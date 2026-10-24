"use client";
import { useCallback, useEffect, useState } from "react";
import {
  listAllFeedback,
  deleteFeedback,
  type FeedbackItem,
} from "@/server/actions/feedback";
import { Star, MessageSquareQuote, Loader2, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";

const ROLE_COLORS: Record<string, string> = {
  student: "bg-blue-50 text-blue-700 border-blue-200",
  adviser: "bg-green-50 text-green-700 border-green-200",
  associate_dean: "bg-purple-50 text-purple-700 border-purple-200",
  dean: "bg-amber-50 text-amber-700 border-amber-200",
  department: "bg-gray-100 text-gray-700 border-gray-200",
  vcrdes: "bg-rose-50 text-rose-700 border-rose-200",
};

export default function DepartmentFeedback({
  initialItems,
}: {
  initialItems?: FeedbackItem[];
} = {}) {
  const [items, setItems] = useState<FeedbackItem[]>(initialItems ?? []);
  const [loading, setLoading] = useState(!initialItems);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supplied = initialItems !== undefined;
    async function load() {
      const res = await listAllFeedback();
      if (cancelled) return;
      if (res.success) setItems(res.data);
      else if (!supplied) toast.error(res.error);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [initialItems]);

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this feedback? This cannot be undone.")) return;
    setDeletingId(id);
    const res = await deleteFeedback(id);
    setDeletingId(null);
    if (res.success) {
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success(res.message);
    } else {
      toast.error(res.error);
    }
  }

  const avg = items.length
    ? items.reduce((s, i) => s + i.rating, 0) / items.length
    : 0;
  const counts = [1, 2, 3, 4, 5].map(
    (n) => items.filter((i) => i.rating === n).length,
  );

  return (
    <div className="space-y-6">
      {}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Total feedback</p>
          <p className="text-2xl font-bold text-[#333]">{items.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Average rating</p>
          <p className="text-2xl font-bold text-[#333]">
            {items.length ? avg.toFixed(1) : "—"}
            <span className="text-sm font-normal text-gray-400"> / 5</span>
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">5-star</p>
          <p className="text-2xl font-bold text-green-600">{counts[4]}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">1-star</p>
          <p className="text-2xl font-bold text-red-600">{counts[0]}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-[#8B1A1A]" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center">
          <MessageSquareQuote className="h-12 w-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-[#333] mb-1">No feedback yet</h3>
          <p className="text-sm text-gray-500">User feedback will appear here once submitted.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#8B1A1A]/10">
                    <UserRound className="h-4 w-4 text-[#8B1A1A]" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-[#333] truncate">{item.userName}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${ROLE_COLORS[item.userRole] || "bg-gray-100 text-gray-600"}`}>
                        {item.userRole}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">
                      {new Date(item.createdAt).toLocaleString("en-US", {
                        month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={`h-4 w-4 ${n <= item.rating ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
                    ))}
                  </div>
                  <button
                    onClick={() => handleDelete(item.id)}
                    disabled={deletingId === item.id}
                    className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-40 cursor-pointer"
                    title="Delete feedback"
                  >
                    {deletingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <p className="mt-3 text-sm text-gray-600 whitespace-pre-wrap break-words">{item.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}