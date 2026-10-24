"use client";
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

  forField: (fieldKey: AnnotationFieldKey) => Annotation[];

  addComment: (
    fieldKey: AnnotationFieldKey,
    snippet: string,
    comment: string,
  ) => Promise<boolean>;

  reply: (threadId: string, comment: string) => Promise<boolean>;

  resolveThread: (threadId: string, resolved: boolean) => Promise<void>;

  editComment: (annotationId: string, comment: string) => Promise<boolean>;

  deleteComment: (annotationId: string) => Promise<boolean>;

  jumpToField: (fieldKey: AnnotationFieldKey) => void;

  jumpToThread: (thread: Annotation) => void;

  currentUserId: string | null;
  commentMode: boolean;

  setCommentMode: (on: boolean) => void;

  canView: boolean;

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
}: {
  submissionId: string;
  children: React.ReactNode;
  enableCommentMode?: boolean;
}) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [canAnnotate, setCanAnnotate] = useState(false);
  const [canView, setCanView] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [commentMode, setCommentMode] = useState(enableCommentMode);
  const commentModeRef = useRef(commentMode);
  useEffect(() => {
    commentModeRef.current = commentMode;
  }, [commentMode]);
  const canAnnotateRef = useRef(canAnnotate);
  useEffect(() => {
    canAnnotateRef.current = canAnnotate;
  }, [canAnnotate]);
  const [pending, setPending] = useState<{
    fieldKey: AnnotationFieldKey;
    snippet: string;
    left: number;
    top: number;
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

      setCanView(false);
      setCanAnnotate(false);
      setAnnotations([]);
    }
  }, [submissionId]);
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const user = await getCurrentUser();
      if (!cancelled) setCurrentUserId(user?.id || null);
      if (!cancelled) await load();
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
useEffect(() => {
  function onMiss() {
    toast.info("Showing the section instead", {
      description:
        "The text this comment was anchored to has changed since it was written.",
    });
  }
  window.addEventListener("annotation-jump-miss", onMiss as EventListener);
  return () =>
    window.removeEventListener("annotation-jump-miss", onMiss as EventListener);
}, []);
function notifyChange() {
  try {
    channelRef.current?.send({});
  } catch {

    void load();
  }
}
  async function addComment(
    fieldKey: AnnotationFieldKey,
    snippet: string,
    comment: string,
  ): Promise<boolean> {
    const res = await createSubmissionAnnotation(submissionId, {
      fieldKey,
      textSnippet: snippet,
      comment,
    });
    if (res.success) {

      setAnnotations((prev) => [...prev, res.annotation]);
      notifyChange();
      return true;
    }
    toast.error(res.error);
    return false;
  }

  async function reply(threadId: string, comment: string): Promise<boolean> {
    const res = await replyToAnnotation(submissionId, threadId, comment);
    if (res.success) {

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
    window.dispatchEvent(
      new CustomEvent("annotation-jump", { detail: { fieldKey } }),
    );
  }

  function jumpToThread(thread: Annotation) {

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

    [annotations, forField, currentUserId, submissionId, commentMode, canView, canAnnotate],
  );
  useEffect(() => {
    function handleMouseUp(e: MouseEvent) {
      if (!canAnnotateRef.current) return;

      if (!commentModeRef.current) return;
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
      });
    }
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("selectionchange", () => {
      const sel = window.getSelection();
      const focusedInPopover =
        popoverRef.current &&
        document.activeElement &&
        popoverRef.current.contains(document.activeElement);
      if (!focusedInPopover && (!sel || sel.isCollapsed) && pending) {
        setPending(null);
      }
    });
    return () => document.removeEventListener("mouseup", handleMouseUp);

  }, []);
  useEffect(() => {
    function handleJump(e: Event) {
      const fieldKey = (e as CustomEvent).detail?.fieldKey as
        | AnnotationFieldKey
        | undefined;
      const snippet = (e as CustomEvent).detail?.snippet as string | undefined;
      if (!fieldKey) return;
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

      {}
      {pending && (
        <div
          ref={popoverRef}
          className="fixed z-[60] w-72 rounded-xl border border-gray-200 bg-white p-2 shadow-2xl"
          style={{ left: Math.min(pending.left - 272, window.innerWidth - 300), top: pending.top }}
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

      {

}
      {canView && (
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