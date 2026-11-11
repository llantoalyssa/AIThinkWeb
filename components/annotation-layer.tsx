"use client";

// ============================================================
// AnnotationLayer — provider for Google-Docs-style comments on a
// submitted TAF. Wraps children in an AnnotationContext so the
// document can render snippet highlights, detects text
// selections inside `[data-annotate]` elements and shows an
// "Add comment" popover, and hosts the AnnotationPanel.
// ============================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AnnotationPanel from "@/components/annotation-panel";
import {
  getSubmissionAnnotations,
  createSubmissionAnnotation,
  replyToAnnotation,
  resolveAnnotation,
  updateAnnotation,
  deleteAnnotation,
  type Annotation,
  type AnnotationFieldKey,
} from "@/server/actions/submission-annotations";
import { createClient } from "@/server/supabase/client";
import { getCurrentUser } from "@/server/actions/auth";
import { toast } from "sonner";
import { Loader2, X, Send } from "lucide-react";

type AnnotationContextValue = {
  annotations: Annotation[];
  /** comments visible for a given section */
  forField: (fieldKey: AnnotationFieldKey) => Annotation[];
  /** create a comment anchored to the highlighted snippet */
  addComment: (
    fieldKey: AnnotationFieldKey,
    snippet: string,
    comment: string,
  ) => Promise<boolean>;
  /** reply to a thread root */
  reply: (threadId: string, comment: string) => Promise<boolean>;
  /** resolve / reopen a thread */
  resolveThread: (threadId: string, resolved: boolean) => Promise<void>;
  /** edit an annotation or reply (author only) */
  editComment: (annotationId: string, comment: string) => Promise<boolean>;
  /** delete an annotation or reply (author only) */
  deleteComment: (annotationId: string) => Promise<boolean>;
  /** jump/scroll to a section in the document */
  jumpToField: (fieldKey: AnnotationFieldKey) => void;
  /** jump/scroll to a section and flash the exact highlighted snippet */
  jumpToThread: (thread: Annotation) => void;
  /** the current user id (for resolve authorization) */
  currentUserId: string | null;
  /**
   * Whether text selection should show the "Add comment" bubble.
   * Approvers (read-only) always have this on. The student's EDITABLE
   * view keeps it OFF by default so selecting text to format doesn't
   * hijack the toolbar; they toggle "Comment mode" on to annotate.
   */
  commentMode: boolean;
  /** enable/disable comment-on-selection for this viewer */
  setCommentMode: (on: boolean) => void;
  /** whether this user may view comment threads (participants + group members) */
  canView: boolean;
  /** whether this user may add/edit/delete comments (participants only) */
  canAnnotate: boolean;
};

const AnnotationContext = createContext<AnnotationContextValue | null>(null);

export function useAnnotations(): AnnotationContextValue {
  const ctx = useContext(AnnotationContext);
  if (!ctx) throw new Error("useAnnotations must be used within AnnotationLayer");
  return ctx;
}

export default function AnnotationLayer({
  submissionId,
  children,
  enableCommentMode = true,
  showCommentsPanel = true,
  initialAnnotations,
  initialUserId,
  initialCanComment,
}: {
  submissionId: string;
  children: React.ReactNode;
  /** Default comment-on-selection state. Pass false for the student's
   *  editable view so formatting doesn't trigger the comment bubble. */
  enableCommentMode?: boolean;
  /**
   * Render the collapsible comments panel (the floating "Comments" button).
   * Pass false for a role that must not annotate at all — the DEPARTMENT, which
   * reviews TAFs but does not take part in the comment thread the adviser /
   * approvers / group members hold.
   */
  showCommentsPanel?: boolean;
  /**
   * Server-supplied threads. When present the mount fetch is skipped, so the
   * comment badge is already correct on the FIRST paint instead of appearing a
   * round trip after the TAF opens.
   */
  initialAnnotations?: Annotation[] | null;
  initialUserId?: string | null;
  initialCanComment?: boolean;
}) {
  const seeded = useRef(initialAnnotations != null);
  const [annotations, setAnnotations] = useState<Annotation[]>(initialAnnotations ?? []);
  const [currentUserId, setCurrentUserId] = useState<string | null>(initialUserId ?? null);
  // Author identity for optimistic comments: shown immediately, before the
  // server round trip (auth + access gate + insert) comes back.
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  // Whether the current user may ANNOTATE/COMMENT. Only the submitter and
  // approvers (adviser + routed approvers) can; other group-member students
  // viewing the TAF get a read-only view (server enforces this too).
  const [canAnnotate, setCanAnnotate] = useState(initialCanComment ?? false);
  // Whether the current user may even VIEW the threads. Group-member
  // students who aren't the submitter can view (canView true) but NOT
  // annotate (canAnnotate false).
  const [canView, setCanView] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [commentMode, setCommentMode] = useState(enableCommentMode);

  // Handler reads the latest mode without re-registering listeners.
  const commentModeRef = useRef(commentMode);
  useEffect(() => {
    commentModeRef.current = commentMode;
  }, [commentMode]);
  const canAnnotateRef = useRef(canAnnotate);
  useEffect(() => {
    canAnnotateRef.current = canAnnotate;
  }, [canAnnotate]);

  // Selection → comment popover state
  const [pending, setPending] = useState<{
    fieldKey: AnnotationFieldKey;
    snippet: string;
    left: number;
    top: number;
    /**
     * Phones get a BOTTOM SHEET instead of a bubble anchored to the selection:
     * the bubble is 288px wide and its height was never known before layout, so
     * clamping it to "viewport − 260" cut it off at the bottom on a real phone.
     */
    mobile: boolean;
  } | null>(null);
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);

  const popoverRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const res = await getSubmissionAnnotations(submissionId);
    if (res.success) {
      setAnnotations(res.data);
      setCanView(true);
      setCanAnnotate(res.canComment);
    } else {
      // Not a participant and not a group-member student — nothing to see.
      setCanView(false);
      setCanAnnotate(false);
      setAnnotations([]);
    }
  }, [submissionId]);

  // Init: current user + initial load.
  // Both run in PARALLEL — awaiting the identity first doubled the time before
  // the comment badge appeared. When the server already sent the threads, only
  // the identity is still needed.
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const userPromise = getCurrentUser();
      if (!seeded.current) void load();
      const user = await userPromise;
      if (cancelled) return;
      if (user) {
        setCurrentUserId(user.id);
        setCurrentUserName(
          [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "You",
        );
        setCurrentUserRole(user.role);
      } else {
        setCurrentUserId(null);
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const channelRef = useRef<{
  send: (payload: object) => void;
  remove: () => void;
} | null>(null);

// ── Realtime: live comment updates ────────────────────────────
// Uses a BROADCAST channel (not postgres_changes). Broadcast rides the
// same WebSocket socket but is NOT gated by DB RLS, so a comment saved by
// ANY participant is reliably reflected to every other open client of this
// submission (student, adviser, assoc dean, dean, vcrdes) regardless of the
// annotation table's RLS policy. The author's own client already applies an
// optimistic update; broadcast refreshes the OTHER clients.
useEffect(() => {
  const supabase = createClient();
  const channel = supabase
    .channel(`annotations-live-${submissionId}`)
    .on(
      "broadcast",
      { event: "annotations_changed" },
      () => {
        void load();
      },
    )
    .subscribe((status) => {
      if (process.env.NODE_ENV === "development") {
        console.log(`[annotations realtime] channel status: ${status}`);
      }
    });

  channelRef.current = {
    send: () => {
      channel.send({ type: "broadcast", event: "annotations_changed" });
    },
    remove: () => {
      supabase.removeChannel(channel);
    },
  };

  return () => {
    channelRef.current?.remove();
    channelRef.current = null;
  };
}, [submissionId, load]);

// ── Jump fallbacks ────────────────────────────────────────────
//
// This used to announce "the text this comment was anchored to has changed"
// whenever a highlight could not be located. That claim was not reliable: a
// snippet captured from an <input> (the title field), or one that only matches
// across a normalisation boundary, produces no <mark> even for a comment created
// seconds earlier — so freshly written comments accused the reader of having
// edited their own text.
//
// A miss is now silent. The section still scrolls into view and flashes, which
// is the useful part of the interaction. The `annotation-jump-miss` event is
// still dispatched by the emitters, so an evidence-based check (comparing the
// stored snapshot against the current field text) can be added there later
// without touching them.

// Tell every other client viewing this submission to reload their comments.
function notifyChange() {
  try {
    channelRef.current?.send({});
  } catch {
    // channel not ready — fall back to a local reload
    void load();
  }
}

  // ── Add comment from selection ─────────────────────────────
  async function addComment(
    fieldKey: AnnotationFieldKey,
    snippet: string,
    comment: string,
  ): Promise<boolean> {
    // Show the comment IMMEDIATELY. The server action costs ~1-2s (auth +
    // access gate + insert), and making the user stare at that before their
    // own comment appeared was the main complaint. A temporary thread goes in
    // now and is swapped for the real row when the action answers; on failure
    // it is rolled back, so a rejected comment never lingers.
    const tempId = `temp-${Date.now()}`;
    const optimistic: Annotation = {
      id: tempId,
      submissionId,
      fieldKey,
      textSnippet: snippet,
      parentId: null,
      withRole: currentUserRole || "adviser",
      authorId: currentUserId || "",
      authorRole: currentUserRole || "student",
      authorName: currentUserName || "You",
      comment,
      resolved: false,
      createdAt: new Date().toISOString(),
      replies: [],
    };
    setAnnotations((prev) => [...prev, optimistic]);

    const res = await createSubmissionAnnotation(submissionId, {
      fieldKey,
      textSnippet: snippet,
      comment,
    });
    if (res.success) {
      // Replace the placeholder with the server's row (real id + timestamp).
      setAnnotations((prev) => prev.map((a) => (a.id === tempId ? res.annotation : a)));
      notifyChange();
      return true;
    }
    setAnnotations((prev) => prev.filter((a) => a.id !== tempId));
    toast.error(res.error);
    return false;
  }

  async function reply(threadId: string, comment: string): Promise<boolean> {
    const res = await replyToAnnotation(submissionId, threadId, comment);
    if (res.success) {
      // Optimistic: attach the reply to its thread root locally.
      setAnnotations((prev) =>
        prev.map((a) =>
          a.id === threadId ? { ...a, replies: [...a.replies, res.annotation] } : a,
        ),
      );
      notifyChange();
      return true;
    }
    toast.error(res.error);
    return false;
  }

  async function resolveThread(threadId: string, resolved: boolean): Promise<void> {
    const res = await resolveAnnotation(submissionId, threadId, resolved);
    if (res.success) {
      setAnnotations((prev) =>
        prev.map((a) =>
          a.id === threadId ? { ...a, resolved: !a.resolved } : a,
        ),
      );
      notifyChange();
    } else {
      toast.error(res.error);
    }
  }

  // Update an annotation's fields whether it's a thread root or a reply.
  // (Replies live nested inside their thread root's `replies` array.)
  function patchAnnotation(id: string, patch: Partial<Annotation>) {
    setAnnotations((prev) =>
      prev.map((a) => {
        if (a.id === id) return { ...a, ...patch };
        if (a.replies.some((r) => r.id === id)) {
          return {
            ...a,
            replies: a.replies.map((r) => (r.id === id ? { ...r, ...patch } : r)),
          };
        }
        return a;
      }),
    );
  }

  async function editComment(annotationId: string, comment: string): Promise<boolean> {
    const res = await updateAnnotation(submissionId, annotationId, comment);
    if (res.success) {
      patchAnnotation(annotationId, { comment });
      notifyChange();
      return true;
    }
    toast.error(res.error);
    return false;
  }

  async function deleteComment(annotationId: string): Promise<boolean> {
    const res = await deleteAnnotation(submissionId, annotationId);
    if (res.success) {
      // Remove the root and its replies if it's a root; remove a reply otherwise.
      setAnnotations((prev) => {
        const root = prev.find((a) => a.id === annotationId);
        if (root) return prev.filter((a) => a.id !== annotationId);
        return prev.map((a) => ({
          ...a,
          replies: a.replies.filter((r) => r.id !== annotationId),
        }));
      });
      notifyChange();
      return true;
    }
    toast.error(res.error);
    return false;
  }

  function jumpToField(fieldKey: AnnotationFieldKey) {
    // Dispatch a custom event the document listens to, to scroll to
    // the section with the matching data-annotate attribute.
    window.dispatchEvent(
      new CustomEvent("annotation-jump", { detail: { fieldKey } }),
    );
  }

  function jumpToThread(thread: Annotation) {
    // Jump to the section AND flash just the highlighted snippet.
    window.dispatchEvent(
      new CustomEvent("annotation-jump", {
        detail: { fieldKey: thread.fieldKey, snippet: thread.textSnippet },
      }),
    );
  }

  const forField = useCallback(
    (fieldKey: AnnotationFieldKey) =>
      annotations.filter((a) => a.fieldKey === fieldKey),
    [annotations],
  );

  const value = useMemo<AnnotationContextValue>(
    () => ({
      annotations,
      forField,
      addComment,
      reply,
      resolveThread,
      editComment,
      deleteComment,
      jumpToField,
      jumpToThread,
      currentUserId,
      commentMode,
      setCommentMode,
      canView,
      canAnnotate,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [annotations, forField, currentUserId, submissionId, commentMode, canView, canAnnotate],
  );

  // ── Global selection detection ──────────────────────────────
  // When the user highlights text inside an element with data-annotate,
  // pop the "Add comment" bubble anchored near the selection.
  useEffect(() => {
    function handleMouseUp(e: MouseEvent) {
      // Non-participants (only the submitter + approvers may comment) get a
      // read-only view — no comment bubble.
      if (!canAnnotateRef.current) return;
      // Comment-on-selection is opt-in for editable views.
      if (!commentModeRef.current) return;

      // Ignore mouseups that happen inside the comment popover (clicking
      // the textarea / Add button shouldn't dismiss it).
      if (
        popoverRef.current &&
        e.target &&
        popoverRef.current.contains(e.target as Node)
      ) {
        return;
      }
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setPending(null);
        return;
      }
      const text = sel.toString().trim().slice(0, 500);
      // find the annotatable section containing the selection
      let node = sel.anchorNode as Node | null;
      let fieldKey: AnnotationFieldKey | null = null;
      while (node && node !== document.body) {
        const el = node instanceof Element ? node : node.parentElement;
        if (el) {
          const key = el.getAttribute("data-annotate");
          if (key) {
            fieldKey = key as AnnotationFieldKey;
            break;
          }
        }
        node = node.parentNode;
      }
      if (!fieldKey || !text) {
        setPending(null);
        return;
      }
      const rects = sel.getRangeAt(0).getClientRects();
      let rect = rects[rects.length - 1];
      if (!rect) rect = sel.getRangeAt(0).getBoundingClientRect();
      setPending({
        fieldKey,
        snippet: text,
        left: rect ? rect.right : window.innerWidth - 220,
        top: rect ? rect.bottom + 6 : 60,
        mobile: window.innerWidth < 640,
      });
    }

    /**
     * TOUCH: a long-press text selection fires no `mouseup` on iOS Safari and
     * unreliably on Android Chrome, so on a phone the "Add comment" bubble never
     * appeared — the panel could be opened, but a comment could not be created.
     * `touchend` (delayed a tick, so the selection is final) and a debounced
     * `selectionchange` both run the same handler.
     */
    // `number` + window.setTimeout: the project's Node types make the bare
    // setTimeout return a Timeout object, which clearTimeout rejects here.
    let touchTimer: number | undefined;
    function handleTouchEnd(e: TouchEvent) {
      if (
        popoverRef.current &&
        e.target &&
        popoverRef.current.contains(e.target as Node)
      ) {
        return;
      }
      if (touchTimer) window.clearTimeout(touchTimer);
      touchTimer = window.setTimeout(handleMouseUp, 40);
    }

    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("touchend", handleTouchEnd);
    document.addEventListener("selectionchange", () => {
      const sel = window.getSelection();
      // Only auto-dismiss when the collapse wasn't caused by focusing the
      // comment popover itself (which collapses the text selection).
      const focusedInPopover =
        popoverRef.current &&
        document.activeElement &&
        popoverRef.current.contains(document.activeElement);
      if (!focusedInPopover && (!sel || sel.isCollapsed) && pending) {
        setPending(null);
      }
    });
    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchend", handleTouchEnd);
      if (touchTimer) window.clearTimeout(touchTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Jump-to-section handler (scroll + flash) ───────────────
  useEffect(() => {
    function handleJump(e: Event) {
      const fieldKey = (e as CustomEvent).detail?.fieldKey as
        | AnnotationFieldKey
        | undefined;
      const snippet = (e as CustomEvent).detail?.snippet as string | undefined;
      if (!fieldKey) return;
      // If a specific snippet is targeted, AnnotatedSection handles the
      // scroll + pulse on the matching mark — let it take over.
      if (snippet) return;
      const target = document.querySelector(
        `[data-annotate="${fieldKey}"]`,
      ) as HTMLElement | null;
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.style.outline = "2px solid #f59e0b";
      target.style.outlineOffset = "3px";
      setTimeout(() => {
        target.style.outline = "";
        target.style.outlineOffset = "";
      }, 1800);
    }
    window.addEventListener("annotation-jump", handleJump);
    return () => window.removeEventListener("annotation-jump", handleJump);
  }, []);

  async function submitComment() {
    const text = draft.trim();
    if (!pending || !text) return;
    setCreating(true);
    const ok = await addComment(pending.fieldKey, pending.snippet, text);
    setCreating(false);
    if (ok) {
      setDraft("");
      setPending(null);
      setPanelOpen(true);
    }
  }

  return (
    <AnnotationContext.Provider value={value}>
      {children}

      {/* "Add comment" popover anchored at the selection */}
      {pending && (
        <div
          ref={popoverRef}
          className={
            pending.mobile
              ? "fixed inset-x-2 bottom-2 z-[60] max-h-[75dvh] overflow-y-auto rounded-xl border border-gray-200 bg-white p-2 shadow-2xl"
              : "fixed z-[60] w-72 rounded-xl border border-gray-200 bg-white p-2 shadow-2xl"
          }
          /* Desktop keeps the bubble anchored to the selection (clamped to the
             viewport). A phone uses the bottom sheet above, so no height guess is
             needed — the bubble's real height was larger than the clamp assumed,
             which cut off the buttons. */
          style={
            pending.mobile
              ? undefined
              : {
                  left: Math.max(
                    8,
                    Math.min(pending.left - 272, window.innerWidth - 300),
                  ),
                  top: Math.min(
                    pending.top,
                    Math.max(8, window.innerHeight - 260),
                  ),
                }
          }
        >
          <div className="flex items-center justify-between px-1 pb-1">
            <span className="text-[11px] font-semibold text-[#333] truncate">
              Comment on this text
            </span>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="text-gray-400 hover:text-gray-600 cursor-pointer"
              aria-label="Cancel comment"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="px-1 pb-1 text-[10px] text-gray-400 italic line-clamp-2">
            “{pending.snippet}”
          </p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Type your feedback…"
            maxLength={2000}
            className="w-full resize-none rounded-lg border border-gray-200 px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
          />
          <div className="flex items-center justify-end gap-1 pt-1.5">
            <button
              type="button"
              onClick={() => setPending(null)}
              className="rounded-lg px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitComment}
              disabled={creating || !draft.trim()}
              className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-40 cursor-pointer"
            >
              {creating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
              Add comment
            </button>
          </div>
        </div>
      )}

      {/* Comments panel — anyone who can VIEW (submitter, approvers,
          group-member students). Pass readOnly (= !canAnnotate) so viewers
          see threads but no composer/reply/resolve/edit/delete. */}
      {canView && showCommentsPanel && (
        <AnnotationPanel
          open={panelOpen}
          onToggle={() => setPanelOpen((o) => !o)}
          annotations={annotations}
          currentUserId={currentUserId}
          readOnly={!canAnnotate}
          onResolve={resolveThread}
          onReply={reply}
          onJumpToField={jumpToField}
          onJumpToThread={jumpToThread}
          onEdit={editComment}
          onDelete={deleteComment}
        />
      )}
    </AnnotationContext.Provider>
  );
}