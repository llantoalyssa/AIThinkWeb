"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSubmissionChat,
  getChatConversations,
  sendSubmissionChatMessage,
  type ChatMessage,
  type ChatParticipant,
  type ChatConversation,
} from "@/server/actions/submission-chat";
import { MessageCircle, X, Send, Loader2, ChevronDown, User } from "lucide-react";

const ROLE_LABEL: Record<string, string> = {
  student: "Student",
  adviser: "Adviser",
  associate_dean: "Associate Dean",
  dean: "Dean",
  vcrdes: "VCRDES",
};

type Props = {
  submissionId: string;

  currentUserName?: string;
};

const POLL_INTERVAL_MS = 5000;

export default function SubmissionChat({
  submissionId,
  currentUserName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [other, setOther] = useState<ChatParticipant | null>(null);
  const [me, setMe] = useState<ChatParticipant | null>(null);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeRole, setActiveRole] = useState<string>("adviser");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasUnread, setHasUnread] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);
  const isStudent = me?.role === "student";
  const loadConversations = useCallback(async () => {
    const result = await getChatConversations(submissionId);
    if (result.success) {
      setConversations(result.data);

      if (result.data.length === 1) {
        setActiveRole(result.data[0].role);
      }
    }
  }, [submissionId]);

  const load = useCallback(async () => {
    const result = await getSubmissionChat(submissionId, activeRole);
    if (result.success) {
      setMessages(result.data.messages);
      setOther(result.data.other);
      setMe(result.data.me);
      setError(null);
      if (!open && result.data.messages.length > lastCountRef.current) {
        setHasUnread(true);
      }
      lastCountRef.current = result.data.messages.length;
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [submissionId, activeRole, open]);
  useEffect(() => {
    const initial = setTimeout(() => {
      void load();
      void loadConversations();
    }, 0);
    const interval = setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [load, loadConversations]);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setLoading(true);
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, [activeRole, open, load]);
  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);
  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const result = await sendSubmissionChatMessage(
        submissionId,
        text,
        activeRole,
      );
      if (result.success) {
        setDraft("");
        setMessages((prev) => [...prev, result.message]);
        lastCountRef.current += 1;
      } else {
        setError(result.error);
      }
    } finally {
      setSending(false);
    }
  }

  function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function formatDay(iso: string): string {
    return new Date(iso).toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
  }
  return (
    <>
      {}
      <button
        type="button"
        onClick={() => {
          if (!open) setHasUnread(false);
          setOpen(!open);
        }}
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[#8B1A1A] text-white shadow-lg hover:bg-[#a32020] transition-colors"
        title={open ? "Close chat" : `Chat with ${other?.name || "adviser"}`}
        aria-label="Open submission chat"
      >
        {open ? (
          <X className="h-5 w-5" />
        ) : (
          <MessageCircle className="h-5 w-5" />
        )}
        {!open && hasUnread && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-[10px] font-bold text-white">
            •
          </span>
        )}
      </button>

      {}
      {open && (
        <div className="fixed bottom-20 left-4 right-4 z-50 flex h-[70vh] max-h-[480px] w-auto flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl sm:bottom-24 sm:left-auto sm:right-6 sm:h-[480px] sm:w-[360px]">
          {}
          <div className="flex items-center gap-3 border-b bg-[#8B1A1A] px-4 py-3 text-white">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-sm font-semibold">
              {other ? other.name.charAt(0).toUpperCase() : "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">
                {other ? other.name : "Loading…"}
              </p>
              <p className="text-[11px] text-white/80 truncate">
                {other ? ROLE_LABEL[other.role] || "User" : "…"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-white/80 hover:bg-white/20 hover:text-white"
              aria-label="Close chat"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          {}
          {isStudent && conversations.length > 1 && (
            <div className="flex gap-1 border-b bg-gray-50 px-2 py-1.5 overflow-x-auto">
              {conversations.map((c) => (
                <button
                  key={c.role}
                  type="button"
                  onClick={() => setActiveRole(c.role)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                    activeRole === c.role
                      ? "bg-[#8B1A1A] text-white"
                      : c.available
                        ? "bg-white border border-gray-200 text-gray-600 hover:border-[#8B1A1A]/40"
                        : "bg-white border border-gray-200 text-gray-300 cursor-not-allowed"
                  }`}
                  title={
                    c.available
                      ? `Chat with ${c.label}`
                      : `${c.label} not yet routed to this TAF`
                  }
                >
                  <User className="h-3 w-3" />
                  {c.label}
                </button>
              ))}
            </div>
          )}

          {}
          <div className="flex-1 overflow-y-auto bg-gray-50 px-3 py-4 space-y-3">
            {error && !messages.length && (
              <p className="text-xs text-red-500 text-center py-6">{error}</p>
            )}
            {loading && !messages.length && (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            )}
            {!loading && !error && messages.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6">
                No messages yet in this conversation. Say hello to{" "}
                {other ? other.name.split(" ")[0] : "them"}!
              </p>
            )}
            {messages.map((m, idx) => {
              const mine = m.senderId === me?.id;
              const prev = messages[idx - 1];
              const showDay =
                !prev || formatDay(prev.createdAt) !== formatDay(m.createdAt);
              return (
                <div key={m.id}>
                  {showDay && (
                    <p className="text-center text-[10px] text-gray-400 py-1">
                      {formatDay(m.createdAt)}
                    </p>
                  )}
                  <div
                    className={`flex ${mine ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                        mine
                          ? "bg-[#8B1A1A] text-white rounded-br-md"
                          : "bg-white text-[#333] border border-gray-200 rounded-bl-md"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words leading-relaxed">
                        {m.message}
                      </p>
                      <p
                        className={`mt-0.5 text-[10px] ${
                          mine ? "text-white/70" : "text-gray-400"
                        }`}
                      >
                        {m.senderName} · {formatTime(m.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {}
          <div className="border-t bg-white px-3 py-2.5">
            {error && (
              <p className="text-[11px] text-red-500 mb-1">{error}</p>
            )}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={`Message ${other ? other.name.split(" ")[0] : "…"}`}
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30"
                maxLength={2000}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !draft.trim()}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#8B1A1A] text-white hover:bg-[#a32020] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Send message"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}