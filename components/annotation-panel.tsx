"use client";
import { useState } from "react";
import {
  MessageSquareText,
  X,
  CheckCircle2,
  RotateCcw,
  Loader2,
  Send,
  CornerDownRight,
  FileText,
  Lock,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Check,
} from "lucide-react";
import type { Annotation, AnnotationFieldKey } from "@/server/actions/submission-annotations";

const FIELD_LABELS: Record<AnnotationFieldKey, string> = {
  proposedTitle: "Proposed Title",
  background: "Background of the Proposed Topic",
  objectives: "General & Specific Objectives",
  literatureReview: "Review of Related Literature",
  methodology: "Methodology",
  referenceList: "References",
};

const ROLE_COLOR: Record<string, string> = {
  student: "bg-blue-500",
  adviser: "bg-green-500",
  associate_dean: "bg-purple-500",
  dean: "bg-amber-500",
  vcrdes: "bg-rose-500",
};

type Props = {
  open: boolean;
  onToggle: () => void;
  annotations: Annotation[];

  currentUserId: string | null;
  readOnly?: boolean;

  onResolve: (threadId: string, resolved: boolean) => Promise<void>;

  onReply: (threadId: string, comment: string) => Promise<boolean>;

  onJumpToField: (fieldKey: AnnotationFieldKey) => void;

  onJumpToThread: (thread: Annotation) => void;

  onEdit: (annotationId: string, comment: string) => Promise<boolean>;

  onDelete: (annotationId: string) => Promise<boolean>;
};

function timeAgo(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function roleName(role: string): string {
  if (role === "student") return "Student";
  return role.replace("_", " ");
}
function CommentBody({
  ann,
  currentUserId,
  onEdit,
  onDelete,
  readOnly,
}: {
  ann: Annotation;
  currentUserId: string | null;
  onEdit: (id: string, text: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  readOnly?: boolean;
}) {
  const canEdit = !readOnly && currentUserId === ann.authorId;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(ann.comment);
  const [busy, setBusy] = useState(false);

  async function save() {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    const ok = await onEdit(ann.id, text);
    setBusy(false);
    if (ok) setEditing(false);
  }

  async function remove() {
    if (!window.confirm("Delete this comment? This cannot be undone.")) return;
    setBusy(true);
    await onDelete(ann.id);
    setBusy(false);
  }

  if (editing) {
    return (
      <div className="mt-1">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          autoFocus
          maxLength={2000}
          className="w-full resize-none rounded-lg border border-gray-200 px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
        />
        <div className="flex items-center justify-end gap-1.5 mt-1">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs text-gray-500 hover:underline cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || !draft.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-40 cursor-pointer"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-1 group/body">
      <p className="text-[13px] text-[#444] leading-relaxed whitespace-pre-wrap break-words">
        {ann.comment}
      </p>
      {canEdit && (
        <div className="flex items-center gap-2 mt-1">
          <button
            type="button"
            onClick={() => {
              setDraft(ann.comment);
              setEditing(true);
            }}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-gray-500 hover:text-[#8B1A1A] hover:bg-gray-100 cursor-pointer"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-gray-500 hover:text-red-600 hover:bg-red-50 cursor-pointer disabled:opacity-40"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

function ReplyBubble({
  reply,
  currentUserId,
  onEdit,
  onDelete,
  readOnly,
}: {
  reply: Annotation;
  currentUserId: string | null;
  onEdit: (id: string, text: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  readOnly?: boolean;
}) {
  return (
    <div className="flex gap-2 pt-2">
      <div className={`mt-1 h-5 w-5 shrink-0 rounded-full ${ROLE_COLOR[reply.authorRole] || "bg-gray-400"} flex items-center justify-center text-[9px] font-bold text-white`}>
        {(reply.authorName || "?").charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-[#333]">
          {reply.authorName}
          <span className="ml-1 text-[10px] font-normal text-gray-400">
            {roleName(reply.authorRole)} · {timeAgo(reply.createdAt)}
          </span>
        </p>
        <CommentBody
          ann={reply}
          currentUserId={currentUserId}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}

function ThreadCard({
  thread,
  currentUserId,
  onResolve,
  onReply,
  onLocate,
  onEdit,
  onDelete,
  readOnly,
}: {
  thread: Annotation;
  currentUserId: string | null;
  onResolve: (threadId: string, resolved: boolean) => Promise<void>;
  onReply: (threadId: string, comment: string) => Promise<boolean>;
  onLocate: (thread: Annotation) => void;
  onEdit: (id: string, text: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  readOnly?: boolean;
}) {
  const [replyDraft, setReplyDraft] = useState("");
  const [replying, setReplying] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [resolving, setResolving] = useState(false);
  const canResolve = currentUserId === thread.authorId;

  async function submitReply() {
    const text = replyDraft.trim();
    if (!text) return;
    setReplying(true);
    const ok = await onReply(thread.id, text);
    setReplying(false);
    if (ok) {
      setReplyDraft("");
      setShowReply(false);
    }
  }

  return (
    <div
      className={`rounded-lg border p-3 ${
        thread.resolved ? "border-gray-200 bg-gray-50 opacity-75" : "border-amber-200 bg-white"
      }`}
    >
      {}
      <div className="flex items-start gap-2">
        <div className={`mt-0.5 h-6 w-6 shrink-0 rounded-full ${ROLE_COLOR[thread.authorRole] || "bg-gray-400"} flex items-center justify-center text-[10px] font-bold text-white`}>
          {(thread.authorName || "?").charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-[#333]">
            {thread.authorName}
            <span className="ml-1 text-[10px] font-normal text-gray-400">
              {roleName(thread.authorRole)} · {timeAgo(thread.createdAt)}
            </span>
          </p>
          {thread.textSnippet && (
            <button
              type="button"
              onClick={() => onLocate(thread)}
              title="Locate this text in the document"
              className="mt-0.5 block w-full text-left line-clamp-2 text-[11px] text-amber-700 hover:text-amber-900 hover:underline italic cursor-pointer"
            >
              “{thread.textSnippet}”
            </button>
          )}
          <CommentBody
            ann={thread}
            currentUserId={currentUserId}
            onEdit={onEdit}
            onDelete={onDelete}
            readOnly={readOnly}
          />
        </div>
        {thread.resolved && (
          <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-green-100 text-green-700 px-1.5 py-0.5 text-[9px] font-semibold">
            <CheckCircle2 className="h-3 w-3" /> Resolved
          </span>
        )}
      </div>

      {}
      {thread.replies.length > 0 && (
        <div className="mt-2 pl-8 border-l-2 border-gray-100">
          {thread.replies.map((r) => (
            <ReplyBubble
              key={r.id}
              reply={r}
              currentUserId={currentUserId}
              onEdit={onEdit}
              onDelete={onDelete}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}

      {}
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-3 text-[11px]">
          {!readOnly && (
            <button
              type="button"
              onClick={() => setShowReply((s) => !s)}
              className="inline-flex items-center gap-1 text-amber-700 hover:text-amber-900 hover:underline cursor-pointer"
            >
              <CornerDownRight className="h-3 w-3" /> Reply
            </button>
          )}
          {!readOnly && canResolve && (
            <button
              type="button"
              onClick={async () => {
                setResolving(true);
                await onResolve(thread.id, !thread.resolved);
                setResolving(false);
              }}
              disabled={resolving}
              className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700 hover:underline cursor-pointer disabled:opacity-40"
            >
              {resolving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : thread.resolved ? (
                <RotateCcw className="h-3 w-3" />
              ) : (
                <CheckCircle2 className="h-3 w-3" />
              )}
              {thread.resolved ? "Reopen" : "Resolve"}
            </button>
          )}
        </div>
      </div>

      {}
      {!readOnly && showReply && (
        <div className="mt-2 flex items-start gap-2">
          <textarea
            value={replyDraft}
            onChange={(e) => setReplyDraft(e.target.value)}
            rows={2}
            placeholder="Write a reply…"
            maxLength={2000}
            className="flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none"
          />
          <button
            type="button"
            onClick={submitReply}
            disabled={replying || !replyDraft.trim()}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40"
            aria-label="Send reply"
          >
            {replying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      )}
    </div>
  );
}

export default function AnnotationPanel({
  open,
  onToggle,
  annotations,
  currentUserId,
  readOnly,
  onResolve,
  onReply,
  onJumpToField,
  onJumpToThread,
  onEdit,
  onDelete,
}: Props) {

  const order: AnnotationFieldKey[] = [
    "proposedTitle",
    "background",
    "objectives",
    "literatureReview",
    "methodology",
    "referenceList",
  ];
  const byField = new Map<AnnotationFieldKey, Annotation[]>();
  for (const a of annotations) {
    const list = byField.get(a.fieldKey) || [];
    list.push(a);
    byField.set(a.fieldKey, list);
  }
  const openThreads = annotations.filter((a) => !a.resolved);
  const openCount = openThreads.length;

  return (
    <>
      {}
      <button
        type="button"
        onClick={onToggle}
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-amber-600 text-white shadow-lg hover:bg-amber-700 transition-colors"
        title={open ? "Collapse comments" : "Open comments"}
        aria-label="Toggle comment panel"
      >
        {open ? <ChevronRight className="h-5 w-5" /> : <MessageSquareText className="h-5 w-5" />}
        {!open && openCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#8B1A1A] text-[10px] font-bold text-white">
            {openCount > 9 ? "9+" : openCount}
          </span>
        )}
      </button>

      {}
      {open && (
        <div className="fixed bottom-20 left-4 right-4 z-50 flex h-[70vh] max-h-[560px] w-auto flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl sm:bottom-24 sm:left-auto sm:right-6 sm:h-[560px] sm:w-[380px]">
          <div className="flex items-center gap-2 border-b bg-amber-600 px-4 py-3 text-white">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
              <MessageSquareText className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">Comments</p>
              <p className="text-[11px] text-white/80">
                {openCount} open · {annotations.length - openCount} resolved
              </p>
            </div>
            <button
              type="button"
              onClick={onToggle}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 hover:bg-white/20 hover:text-white"
              aria-label="Close comment panel"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 bg-gray-50 space-y-4">
            {annotations.length === 0 && (
              <div className="text-center py-10">
                <Lock className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">
                  {readOnly
                    ? "No comments have been added to this submission yet."
                    : "No comments yet. Select text in the document and click "}
                  {!readOnly && (
                    <span className="font-medium">Add comment</span>
                  )}
                  {!readOnly && " to start a thread."}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {readOnly
                    ? "Comments from the submitter, adviser, and approvers will appear here."
                    : "Comments follow the approval roadmap — approvers can only see comments once the TAF reaches them."}
                </p>
              </div>
            )}

            {order.map((field) => {
              const list = byField.get(field);
              if (!list || list.length === 0) return null;
              return (
                <div key={field}>
                  <button
                    type="button"
                    onClick={() => onJumpToField(field)}
                    className="mb-2 flex w-full items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#8B1A1A] hover:underline cursor-pointer"
                  >
                    <FileText className="h-3 w-3" />
                    {FIELD_LABELS[field]}
                    <span className="ml-auto text-[10px] text-gray-400 normal-case font-normal">
                      {list.length}
                    </span>
                  </button>
                  <div className="space-y-2">
                    {list.map((thread) => (
                      <ThreadCard
                        key={thread.id}
                        thread={thread}
                        currentUserId={currentUserId}
                        onResolve={onResolve}
                        onReply={onReply}
                        onLocate={onJumpToThread}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        readOnly={readOnly}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t bg-white px-4 py-2.5 text-[10px] text-gray-400 flex items-center gap-1">
            <X className="h-3 w-3" />
            Hover your comments for Edit / Delete options.
          </div>
        </div>
      )}
    </>
  );
}