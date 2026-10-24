"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  createTopicAbstract,
  updateTopicAbstract,
  getTopicAbstractById,
  type CreateTAFInput,
  type TAFResult,
  type TopicAbstractForm,
} from "@/server/actions/topic-abstracts";
import {
  analyzeTAF,
  getTAFAnalysis,
  listAnalysisVersions,
  discardCancelledAnalysis,
  type TAFAnalysisResult,
  type AnalysisVersion,
} from "@/server/actions/analyze-taf";
import { addRecentTAF, updateRecentTAFStatus } from "@/server/actions/recents";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import RichTextEditor, { htmlToText } from "@/components/rich-text-editor";
import { plainTextToHtml, htmlToPlainText } from "@/lib/html";
import RichTextView from "@/components/rich-text-view";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import TAFAnalysisResults from "@/components/taf-analysis-results";
import { toast } from "sonner";
import {
  Save,
  Loader2,
  ArrowLeft,
  FileText,
  Lightbulb,
  Target,
  BookOpen,
  FlaskConical,
  Quote,
  GitCompareArrows,
  BrainCircuit,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  Clock,
  Eye,
  AlertCircle,
  X,
} from "lucide-react";

type Props = {
  tafId?: string;
  /** The TAF record already fetched on the SERVER (see the editor page's
   *  page.tsx). When it matches the loaded id the initial load reuses it
   *  instead of requesting it again — that used to be a whole queued round
   *  trip in front of the form. Absent/short on a failed lookup, in which case
   *  the fetch below still runs exactly as before. */
  initialTaf?: TopicAbstractForm;
  onBack: () => void;
  onSaved: () => void;
  disableAnalyze?: boolean;
  submissionUrl?: string;
  submissionStatus?: string;
};

type FormFields = {
  proposedTitle: string;
  background: string;
  objectives: string;
  literatureReview: string;
  methodology: string;
  referenceList: string;
};

const EMPTY_FIELDS: FormFields = {
  proposedTitle: "",
  background: "",
  objectives: "",
  literatureReview: "",
  methodology: "",
  referenceList: "",
};

const FIELD_LABELS: Record<keyof FormFields, string> = {
  proposedTitle: "Proposed Title",
  background: "Background of the Proposed Topic",
  objectives: "General & Specific Objectives",
  literatureReview: "Review of Related Literature",
  methodology: "Methodology",
  referenceList: "References",
};

const FIELD_ICONS: Record<keyof FormFields, React.ReactNode> = {
  proposedTitle: <FileText className="h-4 w-4" />,
  background: <Lightbulb className="h-4 w-4" />,
  objectives: <Target className="h-4 w-4" />,
  literatureReview: <BookOpen className="h-4 w-4" />,
  methodology: <FlaskConical className="h-4 w-4" />,
  referenceList: <Quote className="h-4 w-4" />,
};

const ANALYSIS_STEPS = [
  "Loading TAF data…",
  "Comparing with existing TAFs (SBERT)…",
  "Searching Google Scholar…",
  "Scoring external matches…",
  "Running AI analysis (SDG, Gap, Recos)…",
  "Generating report…",
];

/** Coerce a stored/loaded draft (possibly PARTIAL or from an older release)
 *  into a complete FormFields object.
 *
 *  A partial object is a silent data-loss bug: `fields.methodology` would be
 *  `undefined`, the rich editor renders that as empty, the autosave then
 *  re-persists the object WITHOUT that key, and the server treats `undefined`
 *  as "don't touch this column" — so the field looks like it was never saved
 *  (which is exactly the "only the title came back" report). */
function normalizeFields(input: Partial<FormFields> | null | undefined): FormFields {
  return {
    proposedTitle: input?.proposedTitle ?? "",
    background: input?.background ?? "",
    objectives: input?.objectives ?? "",
    literatureReview: input?.literatureReview ?? "",
    methodology: input?.methodology ?? "",
    referenceList: input?.referenceList ?? "",
  };
}

/** True when a field holds real content (HTML or plain text). */
function fieldHasContent(value: string | undefined): boolean {
  return !!htmlToText(value || "").trim();
}

/** True when ANY rich-text field holds real content (title excluded). */
function richFieldHasContent(f: FormFields): boolean {
  return (
    fieldHasContent(f.background) ||
    fieldHasContent(f.objectives) ||
    fieldHasContent(f.literatureReview) ||
    fieldHasContent(f.methodology) ||
    fieldHasContent(f.referenceList)
  );
}

/** MINIMUM characters required per rich-text field before a TAF can be
 *  analyzed (the Proposed Title is exempt — it's a title). Drafts can be
 *  saved at any length; only the analysis enforces this. The Reference List
 *  is held to a lower bar because individual entries are short. */
const MIN_FIELD_CHARS_DEFAULT = 1000;
const MIN_FIELD_CHARS_BY_FIELD: Partial<Record<keyof FormFields, number>> = {
  referenceList: 500,
};
const minForField = (k: keyof FormFields): number =>
  MIN_FIELD_CHARS_BY_FIELD[k] ?? MIN_FIELD_CHARS_DEFAULT;

export default function TopicAbstractFormEditor({ tafId, initialTaf, onBack, onSaved, disableAnalyze, submissionUrl, submissionStatus }: Props) {
  const router = useRouter();

  // The server-preloaded record, captured once. A ref (not a dependency) so the
  // load effect's identity never churns on a parent re-render.
  const initialTafRef = useRef(initialTaf);

  // ── State ───────────────────────────────────────────
  const [fields, setFields] = useState<FormFields>(EMPTY_FIELDS);
  const [loading, setLoading] = useState(!!tafId);
  // Gate: the form (and its 5 TipTap editors) must not mount until any local
  // draft has been merged into `fields`. Mounting earlier made the editors
  // start EMPTY and depend on a programmatic sync afterwards — the race that
  // wiped restored drafts ("only the title came back").
  const [bootstrapped, setBootstrapped] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);
  // UI-level cancel (stops the spinner/stepper; the in-flight server
  // request may still finish in the background but the student isn't waiting).
  const analyzeCancelRef = useRef(false);
  // Monotonic run id: each analyze run captures its id; a run only applies its
  // results if it is STILL the current run and hasn't been cancelled. This
  // prevents a cancelled (or superseded) run from dumping its output when the
  // user cancels and re-analyzes (the server action can't be aborted mid-flight).
  const analysisRunIdRef = useRef(0);
  const stepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function handleCancelAnalyze() {
    analyzeCancelRef.current = true;
    // Bump the run id so the in-flight run can never apply its results.
    analysisRunIdRef.current += 1;
    if (stepIntervalRef.current) {
      clearInterval(stepIntervalRef.current);
      stepIntervalRef.current = null;
    }
    setAnalyzing(false);
    toast.info("Analysis cancelled.");
  }
  const [currentStatus, setCurrentStatus] = useState<string>("draft");
  const [analysisResult, setAnalysisResult] = useState<TAFAnalysisResult | null>(null);
  const [versions, setVersions] = useState<AnalysisVersion[]>([]);
  const [activeVersion, setActiveVersion] = useState<number | undefined>(undefined);

  // ── Diff dialog state (before/after per field) ──────────
  const [diffField, setDiffField] = useState<keyof FormFields | null>(null);

  // ── Draft autosave (localStorage) ────────────────────────
  // Survives accidental reloads before the user hits Save. Cleared on save.
  const storageKey = tafId ? `aithink_taf_draft_${tafId}` : "aithink_taf_draft_new";
  const autosaveTimer = useRef<number | null>(null);
  const loadedRef = useRef(false); // gate: don't persist before load completes
  const restoreNotifiedRef = useRef(false); // fire the "restored" toast only once
  // Content of the pending (debounced) autosave + the key it belongs to, so a
  // navigation inside the 600ms window can flush it instead of losing the edit.
  const pendingPayloadRef = useRef<string | null>(null);
  const pendingKeyRef = useRef<string>(storageKey);
  // Once a new TAF is persisted (saved or analyzed), don't re-cache that exact
  // content — it would leak into the NEXT new TAF. Content-based (not a
  // permanent latch) so autosave resumes as soon as the user edits again.
  const persistedDraftRef = useRef<string | null>(null);
  // True ~1.2s after mount. Inside that window the autosave refuses to replace
  // a stored draft that has rich content with a blank one (see the guard in the
  // autosave effect) — a data-loss backstop, independent of the editor race.
  const settledRef = useRef(false);

  useEffect(() => {
    const t = window.setTimeout(() => {
      settledRef.current = true;
    }, 1200);
    return () => window.clearTimeout(t);
  }, []);

  // Returns { before, after } for a field if the analysis enhanced it,
  // or null if there's nothing to compare.
  function getFieldDiff(
    fieldKey: keyof FormFields,
  ): { before: string; after: string } | null {
    if (!analysisResult?.enhancement) return null;
    const e = analysisResult.enhancement;
    const snap = analysisResult.formFieldsSnapshot;

    const before = snap?.[fieldKey] || "";
    const after = (() => {
      switch (fieldKey) {
        case "proposedTitle":
          return e.improvedTitle;
        case "background":
          return e.improvedBackground;
        case "objectives":
          return e.improvedObjectives;
        case "methodology":
          return e.improvedMethodology;
        case "literatureReview":
          return e.improvedLiteratureReview;
        case "referenceList":
          return e.improvedReferences;
        default:
          return "";
      }
    })();

    if (!after || after === before) return null;
    return { before, after };
  }

  const diffData = diffField ? getFieldDiff(diffField) : null;

  // ── Load existing form ──────────────────────────────
  const loadTAF = useCallback(async (id: string) => {
    // Reuse the record the server already loaded (see the editor page's
    // page.tsx) when it matches; otherwise fetch it exactly as before. This
    // removes one queued round trip from the front of every edit page load.
    const preloaded = initialTafRef.current;
    const result: TAFResult =
      preloaded && preloaded.id === id
        ? { success: true, data: preloaded }
        : await getTopicAbstractById(id);
    if (!result.success) {
      toast.error(result.error);
      setLoading(false);
      setBootstrapped(true);
      onBack();
      return;
    }

    setFields({
      // Title is a plain input — strip any legacy HTML wrapper but
      // never wrap it in <p> tags. Only the rich-text fields convert.
      proposedTitle: htmlToPlainText(result.data.proposedTitle),
      background: plainTextToHtml(result.data.background),
      objectives: plainTextToHtml(result.data.objectives),
      literatureReview: plainTextToHtml(result.data.literatureReview),
      methodology: plainTextToHtml(result.data.methodology),
      referenceList: plainTextToHtml(result.data.referenceList),
    });

    // Restore an unsaved local draft (from a previous accidental reload) on top
    // of the saved data, so the user keeps their in-progress edits.
    try {
      const draft = window.localStorage.getItem(storageKey);
      if (draft) {
        const parsed = JSON.parse(draft) as Partial<FormFields>;
        if (parsed && typeof parsed === "object") {
          const local = normalizeFields(parsed);
          setFields((prev) =>
            // Field-by-field: a BLANK value in the local cache must never wipe
            // content that is already saved in the database. Merging the whole
            // object (`{...prev, ...parsed}`) let a stale/partial cache blank
            // out saved fields.
            (Object.keys(local) as (keyof FormFields)[]).reduce<FormFields>(
              (acc, key) => {
                acc[key] =
                  fieldHasContent(local[key]) || !fieldHasContent(prev[key])
                    ? local[key]
                    : prev[key];
                return acc;
              },
              { ...prev },
            ),
          );
          if (!restoreNotifiedRef.current) {
            restoreNotifiedRef.current = true;
            toast.info("Restored your unsaved draft.", {
              description: "Your in-progress edits were recovered.",
            });
          }
        }
      }
    } catch {
      // ignore malformed drafts
    }

    loadedRef.current = true;
    setCurrentStatus(result.data.status);

    // Load versions + latest analysis
    if (result.data.status === "analyzed") {
      const [verRes, analysis] = await Promise.all([
        listAnalysisVersions(id),
        getTAFAnalysis(id),
      ]);
      if (verRes.success) setVersions(verRes.versions);
      if (analysis.success) {
        setAnalysisResult(analysis.data);
        setActiveVersion(analysis.data.versionNumber);
      }
    }
    setBootstrapped(true);
    setLoading(false);
  }, [onBack, setLoading, storageKey]);

  useEffect(() => {
    if (!tafId) return;
    const id = tafId;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTAF(id);
  }, [tafId, loadTAF]);

  // Scroll back to the top once a (re-)analysis finishes. We do this AFTER the
  // analyzing modal has closed (analyzing flips true→false in the finally of
  // handleAnalyze), because smooth-scrolling while the modal covers the page
  // does nothing visible.
  //
  // Why not scroll `main.flex-1.overflow-auto`: the page root is
  // `min-h-screen flex-col`, so <main> grows with its content and has no
  // scrollable overflow of its own — scrollTo() on it is a silent no-op and
  // the WINDOW is what actually scrolls. The first analyze only appeared to
  // work because the results section is inserted above the form, which shifts
  // the layout. scrollIntoView() works whatever the scroll container is.
  const pageTopRef = useRef<HTMLButtonElement | null>(null);

  const scrollResultsToTop = useCallback(() => {
    const run = (instant: boolean) => {
      const behavior: ScrollBehavior = instant ? "auto" : "smooth";
      pageTopRef.current?.scrollIntoView({ behavior, block: "start" });
      // Belt and braces: reset every scrollable ancestor, then the window.
      let el: HTMLElement | null = pageTopRef.current?.parentElement ?? null;
      while (el) {
        if (el.scrollHeight > el.clientHeight + 4) {
          const oy = window.getComputedStyle(el).overflowY;
          if (oy === "auto" || oy === "scroll") {
            el.scrollTo({ top: 0, behavior });
          }
        }
        el = el.parentElement;
      }
      window.scrollTo({ top: 0, behavior });
    };

    // Two animation frames for the first paint, then timed retries to outlast
    // the Radix dialog's exit animation and any focus/scroll restoration.
    requestAnimationFrame(() => requestAnimationFrame(() => run(false)));
    window.setTimeout(() => run(false), 150);
    window.setTimeout(() => run(false), 400);
    // Final guarantee: if something nudged us back down (dialog close, focus
    // restore, browser scroll anchoring), snap to the top instantly.
    window.setTimeout(() => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      if (y > 8) run(true);
    }, 700);
  }, []);

  const prevAnalyzing = useRef(false);
  useEffect(() => {
    if (prevAnalyzing.current && !analyzing && analysisResult) {
      scrollResultsToTop();
    }
    prevAnalyzing.current = analyzing;
  }, [analyzing, analysisResult, scrollResultsToTop]);

  // New-TAF (no tafId): allow autosave immediately and restore any local draft.
  useEffect(() => {
    if (tafId) return;
    loadedRef.current = true;
    try {
      const draft = window.localStorage.getItem(storageKey);
      if (draft) {
        const parsed = JSON.parse(draft) as Partial<FormFields>;
        if (parsed && typeof parsed === "object") {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setFields(normalizeFields(parsed));
          if (!restoreNotifiedRef.current) {
            restoreNotifiedRef.current = true;
            toast.info("Restored your unsaved draft.", {
              description: "Your in-progress edits were recovered.",
            });
          }
        }
      }
    } catch {
      // ignore malformed drafts
    }
    // Only now may the form mount — with the restored fields already in state,
    // so the TipTap editors are CREATED with the draft content instead of
    // being synced into it afterwards.
    setBootstrapped(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tafId]);

  // Debounced localStorage autosave — persist edits ~600ms after the last change.
  useEffect(() => {
    if (!loadedRef.current) return; // don't write before the form is populated
    const payload = JSON.stringify(fields);
    // Content that was just persisted server-side (create / analyze) and is
    // UNCHANGED since? Don't re-cache it — that is what leaked a finished TAF
    // into the next "New" form. Autosave resumes the moment the user edits.
    if (persistedDraftRef.current !== null && payload === persistedDraftRef.current) {
      return;
    }
    persistedDraftRef.current = null;
    // Don't cache an entirely empty form — a blank draft would otherwise be
    // "restored" later and fire the unsaved-draft toast for nothing.
    const blank =
      !fields.proposedTitle.trim() &&
      !htmlToText(fields.background).trim() &&
      !htmlToText(fields.objectives).trim() &&
      !htmlToText(fields.literatureReview).trim() &&
      !htmlToText(fields.methodology).trim() &&
      !htmlToText(fields.referenceList).trim();
    if (blank) {
      pendingPayloadRef.current = null;
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
      return;
    }
    // ── Backstop: never let a blank state destroy a richer stored draft ──
    // The editors emit a transaction when they are created; if that ever
    // reports an empty doc again, this keeps the write from being destructive.
    // Only applies in the settling window after mount, so a deliberate clear
    // still persists once the page has settled.
    if (!settledRef.current && !richFieldHasContent(fields)) {
      try {
        const stored = window.localStorage.getItem(storageKey);
        if (stored) {
          const prev = normalizeFields(JSON.parse(stored) as Partial<FormFields>);
          if (richFieldHasContent(prev)) {
            pendingPayloadRef.current = null;
            return;
          }
        }
      } catch {
        // unreadable stored draft — fall through to the normal write
      }
    }
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    // Remember what is queued so an unmount can flush it (see below).
    pendingPayloadRef.current = payload;
    pendingKeyRef.current = storageKey;
    autosaveTimer.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, payload);
      } catch {
        // storage full / unavailable — silently skip
      }
      pendingPayloadRef.current = null;
    }, 600);
    return () => {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    };
  }, [fields, storageKey]);

  // Flush a pending autosave when the editor unmounts. Navigating away inside
  // the 600ms debounce window used to throw the last edit away, because the
  // cleanup above only cancelled the timer.
  useEffect(() => {
    return () => {
      const payload = pendingPayloadRef.current;
      if (!payload || !loadedRef.current) return;
      try {
        window.localStorage.setItem(pendingKeyRef.current, payload);
      } catch {
        // storage unavailable — nothing else we can do
      }
      pendingPayloadRef.current = null;
    };
  }, []);

  // ── Helpers ─────────────────────────────────────────
  function updateField(name: keyof FormFields, value: string) {
    setFields((prev) => ({ ...prev, [name]: value }));
  }

  /** Rich-text fields still below THEIR minimum length (blocks analysis). */
  function fieldsUnderMinimum(): { label: string; length: number; min: number }[] {
    const keys = (Object.keys(FIELD_LABELS) as Array<keyof FormFields>).filter(
      (k) => k !== "proposedTitle",
    );
    const short: { label: string; length: number; min: number }[] = [];
    for (const k of keys) {
      const min = minForField(k);
      const len = htmlToText(fields[k]).trim().length;
      if (len < min) short.push({ label: FIELD_LABELS[k], length: len, min });
    }
    return short;
  }

  async function handleSave() {
    // Don't create an empty draft: if the user hasn't typed anything, refuse
    // to save so no blank card appears in the list. (Rich-text fields are
    // normalized to plain text so an empty editor — e.g. "<p></p>" — counts
    // as empty.)
    const isEmptyTAF =
      !fields.proposedTitle.trim() &&
      !htmlToText(fields.background).trim() &&
      !htmlToText(fields.objectives).trim() &&
      !htmlToText(fields.literatureReview).trim() &&
      !htmlToText(fields.methodology).trim() &&
      !htmlToText(fields.referenceList).trim();

    if (isEmptyTAF) {
      toast.error("Nothing to save yet.", {
        description:
          "Enter at least one field (e.g. the Proposed Title) before saving a draft.",
      });
      return;
    }

    setSaving(true);
    try {
      if (tafId) {
        const result = await updateTopicAbstract({ id: tafId, ...fields });
        if (result.success) {
          // Draft is now persisted server-side — clear the local autosave.
          window.localStorage.removeItem(storageKey);
          setCurrentStatus(result.data.status);
          toast.success("Draft saved!", { description: "Your changes have been saved." });
          onSaved();
        } else {
          toast.error(result.error);
        }
      } else {
        const result = await createTopicAbstract(fields as CreateTAFInput);
        if (result.success) {
          window.localStorage.removeItem(storageKey);
          addRecentTAF(result.data.id, result.data.proposedTitle || "Untitled", result.data.status);
          toast.success("Topic Abstract created!", {
            description: "You can now analyze it for similarity checking.",
          });
          onSaved();
        } else {
          toast.error(result.error);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Analyze / Re-analyze ────────────────────────────
  async function handleAnalyze() {
    const titleText = fields.proposedTitle.trim();
    const bgText = htmlToText(fields.background).trim();
    const objText = htmlToText(fields.objectives).trim();
    const litText = htmlToText(fields.literatureReview).trim();
    const methodText = htmlToText(fields.methodology).trim();
    const refText = htmlToText(fields.referenceList).trim();

    // ALL fields must be filled before analysis.
    if (!titleText) {
      toast.error("Proposed Title is required before analysis.");
      return;
    }
    if (titleText.length < 5) {
      toast.error("Proposed Title is too short. Please enter a more descriptive title.");
      return;
    }
    if (!bgText) {
      toast.error("Background of the Proposed Topic is required before analysis.");
      return;
    }
    if (bgText.length < 25) {
      toast.error("Background of the Proposed Topic is too short. Please add more content.");
      return;
    }
    if (!objText) {
      toast.error("Objectives are required before analysis.");
      return;
    }
    if (objText.length < 25) {
      toast.error("Objectives are too short. Please add more detailed objectives.");
      return;
    }
    if (!litText) {
      toast.error("Review of Related Literature is required before analysis.");
      return;
    }
    if (!methodText) {
      toast.error("Methodology is required before analysis.");
      return;
    }
    if (!refText) {
      toast.error("Reference List is required before analysis.");
      return;
    }

    // Per-field MINIMUM content (title excluded): every rich-text field must
    // reach its own minimum before the TAF can be analyzed.
    const stillShort = fieldsUnderMinimum();
    if (stillShort.length > 0) {
      const detail = stillShort
        .map((f) => `${f.label} (${f.length}/${f.min})`)
        .join(", ");
      toast.error("Some fields are still below the minimum length.", {
        description: `Still short: ${detail}`,
      });
      return;
    }

    setAnalyzing(true);
    setAnalysisStep(0);
    analyzeCancelRef.current = false;
    // Capture this run's id — the run only applies results if it's still current
    // (a cancel or a newer run bumps the id, voiding this run's output).
    const myRun = ++analysisRunIdRef.current;

    stepIntervalRef.current = setInterval(() => {
      setAnalysisStep((prev) => Math.min(prev + 1, ANALYSIS_STEPS.length - 1));
    }, 2500);
    const stepInterval = stepIntervalRef.current;

    try {
      // Save first if new TAF
      let targetId = tafId;
      if (!targetId) {
        const createResult = await createTopicAbstract(fields as CreateTAFInput);
        if (!createResult.success) {
          toast.error(createResult.error);
          setAnalyzing(false);
          clearInterval(stepInterval);
          return;
        }
        targetId = createResult.data.id;
        // The new TAF is now persisted — clear the "new draft" local cache so
        // its content is NOT restored into the next New TAF (title carry-over)
        // and the "restored draft" toast stops re-firing. Marking this exact
        // content as persisted stops it being re-cached; autosave resumes on
        // the next edit (a permanent latch used to kill autosave for the rest
        // of the session, losing any later edits on navigation).
        persistedDraftRef.current = JSON.stringify(fields);
        try {
          window.localStorage.removeItem("aithink_taf_draft_new");
        } catch {
          // ignore
        }
        addRecentTAF(targetId, createResult.data.proposedTitle || "Untitled", "draft");
        router.replace(
          `/dashboard/student/${createResult.data.studentId}/taf/${targetId}/analyzing`,
        );
      }

      // Save latest field values before analyzing
      if (tafId) {
        await updateTopicAbstract({ id: tafId, ...fields });
      }

      const result = await analyzeTAF(targetId);
      clearInterval(stepInterval);
      stepIntervalRef.current = null;

      // Void the output if the user cancelled, or if a newer run has started
      // (this run's results are stale) — don't touch the UI in that case.
      if (analyzeCancelRef.current || myRun !== analysisRunIdRef.current) {
        // The server action can't be aborted, so a cancelled run still wrote
        // its result (version row + AI-enhanced fields + status='analyzed').
        // Roll it back so cancelling leaves no trace and no "output".
        if (result.success) {
          const discard = await discardCancelledAnalysis(
            targetId,
            result.data.versionNumber,
          );
          if (discard.success) {
            // Revert the local view back to the pre-analysis state.
            setCurrentStatus("draft");
            setAnalysisResult(null);
            setVersions((prev) =>
              prev.filter((v) => v.versionNumber !== result.data.versionNumber),
            );
          }
        }
        return; // user cancelled / superseded — don't apply results
      }

      if (result.success) {
        setAnalysisResult(result.data);
        setActiveVersion(result.data.versionNumber);
        setCurrentStatus("analyzed");

        // Apply the AI enhancement to the form fields (the analysis
        // already updated the TAF in the DB — mirror it here).
        // AI returns plain text — convert to HTML paragraphs so it
        // renders properly in the rich text editor.
        //
        // RULE: the enhancement only applies to HIGH-similarity runs.
        // Low-similarity (passing) results keep the student's original
        // content untouched — even on re-analyses — matching the server.
        const isLowSimilarity =
          result.data.judgment === "low_similarity";
        if (result.data.enhancement && !isLowSimilarity) {
          const e = result.data.enhancement;
          setFields((prev) => ({
            // Title stays plain text (it's an <Input>, not rich text)
            proposedTitle: e.improvedTitle || prev.proposedTitle,
            background: plainTextToHtml(e.improvedBackground || prev.background),
            objectives: plainTextToHtml(e.improvedObjectives || prev.objectives),
            literatureReview: plainTextToHtml(
              e.improvedLiteratureReview || prev.literatureReview,
            ),
            methodology: plainTextToHtml(e.improvedMethodology || prev.methodology),
            referenceList: plainTextToHtml(e.improvedReferences || prev.referenceList),
          }));
        }

        await updateRecentTAFStatus(targetId, "analyzed");

        // Refresh versions list
        const verRes = await listAnalysisVersions(targetId);
        if (verRes.success) setVersions(verRes.versions);

        toast.success("Analysis complete!", {
          description: `Version ${result.data.versionNumber} created.`,
        });

        // Belt-and-braces: scroll to the top on every successful run. The
        // analyzing-effect also does this, but on a re-analyze that path can
        // be missed, so we scroll here too (duplicate scrolls are harmless).
        scrollResultsToTop();
      } else {
        toast.error("Analysis failed", {
          description: result.error || "Something went wrong during analysis.",
        });
      }
    } catch (err) {
      clearInterval(stepInterval);
      if (myRun === analysisRunIdRef.current && !analyzeCancelRef.current) {
        toast.error("Analysis error", {
          description: err instanceof Error ? err.message : "Unexpected error",
        });
      }
    } finally {
      // Only the CURRENT run may clear the analyzing state — otherwise a stale
      // (cancelled/superseded) run would close a newer run's progress modal.
      if (myRun === analysisRunIdRef.current) {
        setAnalyzing(false);
      }
    }
  }

  // ── Version switching ─────────────────────────────
  async function handleSelectVersion(version: number) {
    if (!tafId) return;
    const analysis = await getTAFAnalysis(tafId, version);
    if (analysis.success) {
      setAnalysisResult(analysis.data);
      setActiveVersion(version);
    }
  }

  // ── Computed ───────────────────────────────────────
  const showAnalysisButton = currentStatus === "draft" && !disableAnalyze;
  const showResults = analysisResult !== null;
  // Fields are locked when TAF has been submitted to a group
  const isLocked = !!disableAnalyze;

  // ── Analysis version limit (max 5 analyses per TAF) ──
  // Once the latest version reaches the cap, the analyze/re-analyze
  // button is disabled (the server also enforces this as a backstop).
  const MAX_ANALYSIS_VERSIONS = 5;
  const latestVersion =
    versions.length > 0
      ? Math.max(...versions.map((v) => v.versionNumber))
      : activeVersion || 0;
  const analysisLimitReached = latestVersion >= MAX_ANALYSIS_VERSIONS;

  // Analysis / re-analysis is blocked until every rich-text field reaches its
  // minimum length — the buttons below are disabled while this is non-empty.
  const shortFields = fieldsUnderMinimum();
  const belowMinimum = shortFields.length > 0;
  const minimumBlocker = belowMinimum
    ? `Some fields are still below the minimum length: ${shortFields
        .map((f) => `${f.label} (${f.length}/${f.min})`)
        .join(", ")}`
    : undefined;

  // Detect changes vs the analyzed baseline. When an enhancement was
  // applied, the baseline is the improved content (the TAF was updated
  // with it); otherwise compare against the original snapshot.
  // Both sides are normalized to plain text so HTML vs plain-text
  // representations of the same content don't falsely flag as changes.
  const baseline = analysisResult?.enhancement
    ? {
        proposedTitle: analysisResult.enhancement.improvedTitle,
        background: analysisResult.enhancement.improvedBackground,
        objectives: analysisResult.enhancement.improvedObjectives,
        literatureReview: analysisResult.enhancement.improvedLiteratureReview,
        methodology: analysisResult.enhancement.improvedMethodology,
        referenceList: analysisResult.enhancement.improvedReferences,
      }
    : analysisResult?.formFieldsSnapshot;
  const norm = (v?: string | null) => htmlToText(v || "").trim();
  const hasChanges = showResults && !!baseline && (
    norm(fields.proposedTitle) !== norm(baseline.proposedTitle) ||
    norm(fields.background) !== norm(baseline.background) ||
    norm(fields.objectives) !== norm(baseline.objectives) ||
    norm(fields.literatureReview) !== norm(baseline.literatureReview) ||
    norm(fields.methodology) !== norm(baseline.methodology) ||
    norm(fields.referenceList) !== norm(baseline.referenceList)
  );

  const statusBadge = (() => {
    const colors: Record<string, string> = {
      draft: "bg-gray-100 text-gray-700 border-gray-300",
      analyzed: "bg-indigo-50 text-indigo-700 border-indigo-300",
      submitted: "bg-blue-50 text-blue-700 border-blue-300",
      under_review: "bg-amber-50 text-amber-700 border-amber-300",
      approved: "bg-green-50 text-green-700 border-green-300",
      revisions_needed: "bg-red-50 text-red-700 border-red-300",
    };
    const labels: Record<string, string> = {
      draft: "Draft",
      analyzed: "Analyzed",
      submitted: "Submitted",
      under_review: "Under Review",
      approved: "Approved",
      revisions_needed: "Revisions Needed",
    };
    return (
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
          colors[currentStatus] || colors.draft
        }`}
      >
        {labels[currentStatus] || currentStatus}
      </span>
    );
  })();

  // ── Loading ────────────────────────────────────────
  // `bootstrapped` also gates the NEW-TAF path: without it the form (and its
  // editors) mounted before the local draft was read, so the draft had to be
  // pushed into already-created editors — a race that lost the content.
  if (loading || !bootstrapped) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#8B1A1A]" />
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────
  return (
    <>
      {/* Back button — also the scroll anchor the editor jumps back to after
          an analyze/re-analyze. scroll-mt-16 keeps it clear of the sticky
          dashboard header. */}
      <button
        ref={pageTopRef}
        onClick={onBack}
        className="scroll-mt-16 flex items-center gap-2 text-sm text-gray-500 hover:text-[#8B1A1A] transition-colors mb-6 cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to My Topic Abstracts
      </button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#333]">
            {tafId ? "Edit Topic Abstract Form" : "New Topic Abstract Form"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {showResults
              ? "Your TAF has been analyzed. Review the results below."
              : "Fill out the form below with your proposed research topic."}
          </p>
        </div>
        {tafId && <div className="flex items-center gap-2">{statusBadge}</div>}
      </div>

      {/* ── Analysis limit reached banner ──────────────────── */}
      {analysisLimitReached && (
        <div className="mb-6 flex items-center gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              Maximum analyses reached (V{latestVersion}/{MAX_ANALYSIS_VERSIONS})
            </p>
            <p className="text-xs text-amber-600">
              This TAF has been analyzed {MAX_ANALYSIS_VERSIONS} times, which is
              the maximum allowed. Re-analysis is disabled — you can still save
              edits, or create a new TAF to run a fresh analysis.
            </p>
          </div>
        </div>
      )}

      {/* ── Submitted / Locked banner with progress ──────────── */}
      {disableAnalyze && (
        <div className="mb-6 space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-lg border border-blue-200 bg-blue-50">
            <FileText className="h-5 w-5 text-blue-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-800">
                This TAF has been submitted to an advisory group
              </p>
              <p className="text-xs text-blue-600">
                Analysis and editing are disabled because this TAF is under review. Create a new TAF for further revisions.
              </p>
            </div>
            {submissionUrl && (
              <button
                type="button"
                onClick={() => router.push(submissionUrl)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors shrink-0 cursor-pointer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View Submission
              </button>
            )}
          </div>

          {/* Progress tracker card */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-center">
                {[
                  { key: 'pending', label: 'Pending', icon: <Clock className="h-4 w-4" /> },
                  { key: 'under_review', label: 'Under Review', icon: <Eye className="h-4 w-4" /> },
                  { key: submissionStatus === 'approved' ? 'approved' : submissionStatus === 'revisions_needed' ? 'revisions_needed' : submissionStatus === 'rejected' ? 'rejected' : 'decision',
                    label: submissionStatus === 'approved' ? 'Approved' : submissionStatus === 'revisions_needed' ? 'Revisions Needed' : submissionStatus === 'rejected' ? 'Rejected' : 'Decision',
                    icon: submissionStatus === 'approved' ? <CheckCircle2 className="h-4 w-4" /> : submissionStatus === 'revisions_needed' ? <AlertCircle className="h-4 w-4" /> : submissionStatus === 'rejected' ? <AlertCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />,
                  },
                ].map((step, idx, arr) => {
                  const statusOrder = ['pending', 'under_review', 'approved', 'revisions_needed', 'rejected'];
                  const currentIdx = statusOrder.indexOf(submissionStatus || 'pending');
                  const stepIdx = statusOrder.indexOf(step.key);
                  const isPast = stepIdx >= 0 && currentIdx >= 0 && stepIdx < currentIdx;
                  const isCurrent = step.key === submissionStatus || (step.key === 'decision' && !['pending', 'under_review', 'approved', 'revisions_needed', 'rejected'].includes(submissionStatus || ''));
                  return (
                    <div key={step.key} className="flex items-center">
                      <div className="flex flex-col items-center">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                          isPast ? 'bg-green-100 text-green-600'
                          : isCurrent ? 'bg-[#8B1A1A]/10 text-[#8B1A1A] ring-2 ring-[#8B1A1A]/30'
                          : 'bg-gray-100 text-gray-300'
                        }`}>
                          {isPast ? <CheckCircle2 className="h-4 w-4" /> : step.icon}
                        </div>
                        <p className={`text-[10px] mt-1 font-medium whitespace-nowrap ${
                          isPast ? 'text-green-700' : isCurrent ? 'text-[#8B1A1A]' : 'text-gray-400'
                        }`}>
                          {step.label}
                        </p>
                      </div>
                      {idx < arr.length - 1 && (
                        <div className={`w-12 sm:w-20 h-0.5 mx-2 sm:mx-3 mb-4 ${isPast ? 'bg-green-300' : 'bg-gray-200'}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Changes detected banner ─────────────────────── */}
      {/* Hidden once the analysis cap (v5) is reached — re-analysis is no
          longer possible, so prompting for it would be misleading. */}
      {hasChanges && !analysisLimitReached && (
        <div className="flex items-center gap-3 p-4 mb-6 rounded-lg border border-amber-200 bg-amber-50">
          <BrainCircuit className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              Changes detected
            </p>
            <p className="text-xs text-amber-600">
              You&apos;ve updated your fields since the last analysis. Re-analyze to
              get updated results.
            </p>
          </div>
        </div>
      )}

      {/* ── Analysis Results (ABOVE form) ──────────────── */}
      {showResults && analysisResult && (
        <TAFAnalysisResults
          analysis={analysisResult}
          reanalyzeDisabled={belowMinimum}
          reanalyzeDisabledReason={minimumBlocker}
          versions={versions}
          activeVersion={activeVersion}
          onSelectVersion={handleSelectVersion}
          onReanalyze={handleAnalyze}
        />
      )}

      {/* ── Analysis Progress Modal ────────────────────── */}
      <Dialog open={analyzing} onOpenChange={() => {}}>
        <DialogContent
          className="sm:max-w-sm [&>button]:hidden"
          onInteractOutside={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base justify-center">
              <BrainCircuit className="h-5 w-5 text-indigo-600" />
              Analyzing your TAF…
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="relative">
              <Loader2 className="h-12 w-12 animate-spin text-indigo-600" />
              <BrainCircuit className="h-5 w-5 text-indigo-600 absolute top-3.5 left-3.5" />
            </div>
            <p className="text-sm text-indigo-700 text-center font-medium">
              {ANALYSIS_STEPS[analysisStep]}
            </p>
            <div className="flex gap-1.5">
              {ANALYSIS_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-2 w-2 rounded-full transition-colors duration-300 ${
                    i <= analysisStep ? "bg-indigo-500" : "bg-indigo-200"
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={handleCancelAnalyze}
              className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Form fields ────────────────────────────────── */}
      <div className="space-y-6 mb-8 mt-8">
        {(Object.keys(FIELD_LABELS) as Array<keyof FormFields>).map(
          (fieldKey) => {
            const diff = getFieldDiff(fieldKey);
            return (
              <Card key={fieldKey}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base text-[#333]">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#8B1A1A]/10 shrink-0">
                      {FIELD_ICONS[fieldKey]}
                    </span>
                    {FIELD_LABELS[fieldKey]}
                    {diff && (
                      <button
                        type="button"
                        onClick={() => setDiffField(fieldKey)}
                        title="View changes made by the analysis"
                        aria-label={`View before/after changes for ${FIELD_LABELS[fieldKey]}`}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer"
                      >
                        <GitCompareArrows className="h-3.5 w-3.5" />
                        View Changes
                      </button>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {fieldKey === "proposedTitle" ? (
                    <Input
                      placeholder="Enter your proposed research title"
                      value={fields[fieldKey]}
                      onChange={(e) => updateField(fieldKey, e.target.value)}
                      disabled={isLocked}
                      className="text-base"
                    />
                  ) : (
                    <RichTextEditor
                      value={fields[fieldKey]}
                      onChange={(value) => updateField(fieldKey, value)}
                      readOnly={isLocked}
                      placeholder={`Enter ${FIELD_LABELS[fieldKey].toLowerCase()}`}
                      minHeight={
                        fieldKey === "literatureReview" ||
                        fieldKey === "methodology" ||
                        fieldKey === "referenceList"
                          ? "160px"
                          : "120px"
                      }
                    />
                  )}

                  {/* Live per-field character count (title excluded) — amber
                      until it reaches the minimum required for analysis. */}
                  {fieldKey !== "proposedTitle" &&
                    (() => {
                      const min = minForField(fieldKey);
                      const len = htmlToText(fields[fieldKey]).trim().length;
                      const short = len < min;
                      return (
                        <p
                          className={`mt-1.5 text-right text-[11px] ${
                            short
                              ? "font-medium text-amber-600"
                              : "font-medium text-green-600"
                          }`}
                        >
                          {len}/{min}
                          {short
                            ? ` · ${min - len} more characters needed`
                            : " · meets the minimum"}
                        </p>
                      );
                    })()}

                </CardContent>
              </Card>
            );
          },
        )}
      </div>

      {/* ── Before/After diff dialog ────────────────────── */}
      <Dialog open={!!diffData} onOpenChange={(open) => { if (!open) setDiffField(null); }}>
        <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto">
          {diffData && diffField && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <GitCompareArrows className="h-4 w-4 text-amber-600" />
                  Changes: {FIELD_LABELS[diffField]}
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide mb-2">
                    Before (your original)
                  </p>
                  <div className="text-sm text-gray-500 bg-gray-50 border rounded-lg p-3 max-h-[62vh] overflow-y-auto">
                    <RichTextView html={diffData.before} fallback="(empty)" />
                  </div>
                </div>
                <div>
                  <p className="text-[11px] text-green-600 font-medium uppercase tracking-wide mb-2">
                    After (AI-improved)
                  </p>
                  <div className="text-sm text-[#333] bg-green-50/60 border border-green-200 rounded-lg p-3 max-h-[62vh] overflow-y-auto">
                    <RichTextView html={diffData.after} fallback="(empty)" />
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-400 pt-2">
                The form field above already contains the improved version — this
                is just to show you what changed.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Action buttons ─────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 justify-end border-t pt-6">
        {showAnalysisButton && !analyzing && (
          <>
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={saving || analyzing}
              className="flex items-center gap-2"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {tafId ? "Save Draft" : "Create Draft"}
            </Button>
            <Button
              onClick={handleAnalyze}
              disabled={saving || analyzing || belowMinimum}
              title={minimumBlocker}
              className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2"
            >
              {analyzing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BrainCircuit className="h-4 w-4" />
              )}
              Analyze TAF
            </Button>
          </>
        )}
        {/* For analyzed TAFs, show both Save and Re-analyze */}
        {showResults && !analyzing && !showAnalysisButton && !disableAnalyze && (
          <>
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              Save Changes
            </Button>
            {/* Hide the Re-analyze button entirely once the analysis cap (v5)
                is reached — showing a disabled "Re-analyze (V6)" is confusing. */}
            {!analysisLimitReached && (
              <Button
                onClick={handleAnalyze}
                disabled={analyzing || belowMinimum}
                title={minimumBlocker}
                className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2"
              >
                {analyzing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Re-analyze (V{versions.length + 1})
              </Button>
            )}
          </>
        )}
        <Button variant="outline" onClick={onBack}>
          Back to List
        </Button>
      </div>
    </>
  );
}
