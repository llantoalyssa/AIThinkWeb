"use client";
import { useEffect, useState } from "react";
import {
  getDiscoverOverview,
  type DiscoverTaf,
} from "@/server/actions/discover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  Users,
  FileText,
  CalendarDays,
  Target,
  Layers,
  TrendingUp,
  Lightbulb,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { HIGH_SIMILARITY_THRESHOLD } from "@/lib/constants";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  analyzed: { label: "Analyzed", cls: "bg-amber-50 text-amber-700" },
  submitted: { label: "Submitted", cls: "bg-blue-50 text-blue-700" },
  approved: { label: "Approved", cls: "bg-green-50 text-green-700" },
};

function cardStatusClass(status: string): string {
  return STATUS_META[status]?.cls || "bg-gray-50 text-gray-600";
}
function cardStatusLabel(status: string): string {
  return STATUS_META[status]?.label || status;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function DiscoverPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tafs, setTafs] = useState<DiscoverTaf[]>([]);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<DiscoverTaf | null>(null);
  const PAGE_SIZE = 9;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await getDiscoverOverview();
      if (cancelled) return;
      if (res.success) {
        setTafs(res.data);
        setPage(1);
      } else {
        setError(res.error);
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const pageCount = Math.max(1, Math.ceil(tafs.length / PAGE_SIZE));
  const pagedTafs = tafs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="min-h-screen bg-gray-50">
      {}
      <header className="border-b bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#8B1A1A]/10">
                <FileText className="h-5 w-5 text-[#8B1A1A]" />
              </span>
              <h1 className="text-2xl font-bold text-[#333]">Public Overview</h1>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Capstone topics submitted to the approvers or fully approved.
              Student names are masked.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.location.assign("/login")}
            className="inline-flex items-center justify-center rounded-xl bg-[#8B1A1A] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#a32020] transition-colors cursor-pointer"
          >
            Sign in
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white py-20">
            <Loader2 className="h-8 w-8 animate-spin text-[#8B1A1A]" />
            <p className="mt-2 text-sm text-gray-400">Loading public overview…</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
            {error}
          </div>
        ) : tafs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white py-20 text-center">
            <Users className="h-8 w-8 text-gray-300" />
            <p className="mt-2 text-sm text-gray-500">
              No analyzed topics to showcase yet. Check back soon.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pagedTafs.map((t, i) => (
              <article
                key={`${t.title}-${i}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(t)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(t);
                  }
                }}
                className="flex cursor-pointer flex-col rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#8B1A1A]/30 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-gray-400">
                    {t.owner || "Student"}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cardStatusClass(
                      t.status,
                    )}`}
                  >
                    {cardStatusLabel(t.status)}
                  </span>
                </div>

                <h2 className="text-base font-semibold leading-snug text-[#333]">
                  {t.title || "Untitled"}
                </h2>

                {(t.sdgCategories.length > 0 || t.fieldOfIt) && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {t.sdgCategories.map((sdg) => (
                      <span
                        key={sdg}
                        className="rounded-full bg-[#8B1A1A]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#8B1A1A]"
                      >
                        {sdg}
                      </span>
                    ))}
                    {t.fieldOfIt && (
                      <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700">
                        {t.fieldOfIt}
                      </span>
                    )}
                  </div>
                )}

                <p className="mt-3 text-sm leading-relaxed text-gray-600 line-clamp-3">
                  {t.researchGap || "No research gap analysis available."}
                </p>

                <div className="mt-3 flex items-center justify-between">
                  {t.date ? (
                    <p className="flex items-center gap-1.5 text-xs text-gray-400">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatDate(t.date)}
                    </p>
                  ) : (
                    <span />
                  )}
                  <span className="text-xs font-medium text-[#8B1A1A]">
                    View details →
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}

        {}
        {!loading && !error && tafs.length > 0 && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <span className="text-sm text-gray-500">
              Page {page} of {pageCount}
            </span>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </main>

      {}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cardStatusClass(
                      selected.status,
                    )}`}
                  >
                    {cardStatusLabel(selected.status)}
                  </span>
                  {selected.date && (
                    <span className="flex items-center gap-1.5 text-xs text-gray-400">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatDate(selected.date)}
                    </span>
                  )}
                </div>
                <DialogTitle className="mt-2 text-left text-xl leading-snug text-[#333]">
                  {selected.title || "Untitled"}
                </DialogTitle>
                <p className="text-left text-sm text-gray-500">
                  Owner: {selected.owner || "Student"}
                </p>
              </DialogHeader>

              <div className="space-y-5">
                {}
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    <Target className="h-3.5 w-3.5" /> SDGs Targeted
                  </p>
                  {selected.sdgCategories.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selected.sdgCategories.map((sdg) => (
                        <span
                          key={sdg}
                          className="rounded-full bg-[#8B1A1A]/10 px-2.5 py-0.5 text-xs font-medium text-[#8B1A1A]"
                        >
                          {sdg}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">—</p>
                  )}
                </div>

                {}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      <Layers className="h-3.5 w-3.5" /> Field of IT
                    </p>
                    {selected.fieldOfIt ? (
                      <span className="inline-block rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                        {selected.fieldOfIt}
                      </span>
                    ) : (
                      <p className="text-sm text-gray-400">—</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      <TrendingUp className="h-3.5 w-3.5" /> Similarity Score
                    </p>
                    <p
                      className={`text-lg font-bold ${
                        selected.combinedScore >= HIGH_SIMILARITY_THRESHOLD
                          ? "text-red-600"
                          : "text-green-600"
                      }`}
                    >
                      {selected.combinedScore}%
                      {selected.version !== null && (
                        <span className="ml-2 align-middle text-xs font-medium text-gray-400">
                          Analysis v{selected.version}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {}
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    <Lightbulb className="h-3.5 w-3.5" /> Research Gap Analysis
                  </p>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">
                    {selected.researchGap ||
                      "No research gap analysis available for this topic."}
                  </p>
                </div>

              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}