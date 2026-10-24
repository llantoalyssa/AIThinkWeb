"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getStudentDashboardData,
  type StudentDashboardData,
} from "@/server/actions/student-dashboard";
import { Loader2, History, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { HIGH_SIMILARITY_THRESHOLD } from "@/lib/constants";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default function StudentStatsDashboard({
  userId,
  initialData,
}: {
  userId: string;
  initialData?: StudentDashboardData;
}) {
  const router = useRouter();
  const [data, setData] = useState<StudentDashboardData | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState<string>("all");

  useEffect(() => {
    if (initialData) return;
    let cancelled = false;
    (async () => {
      const res = await getStudentDashboardData();
      if (cancelled) return;
      if (res.success) setData(res.data);
      else setError(res.error);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialData]);

  const goTaf = useCallback(
    (tafId: string, title: string) => {
      const slug =
        title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") ||
        "untitled";
      router.push(`/dashboard/student/${userId}/taf/${tafId}/${slug}`);
    },
    [router, userId],
  );

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-[#8B1A1A]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-600">
        {error || "Could not load dashboard data."}
      </div>
    );
  }
  const chartData =
    month === "all"
      ? data.monthlyCounts
      : data.monthlyCounts.filter((m) =>
          m.month.endsWith(month),
        );
  const maxCount = Math.max(1, ...chartData.map((d) => d.count));
  const totalTafs = data.monthlyCounts.reduce((a, b) => a + b.count, 0);

  const chartLabel = (ym: string) => {
    const [y, m] = ym.split("-");
    const mi = parseInt(m, 10) - 1;
    return `${MONTHS[mi] ?? m} '${y.slice(2)}`;
  };

  const w = 460;
  const h = 140;
  const pad = 30;
  const n = chartData.length;
  const labelEvery = n > 16 ? 4 : n > 10 ? 3 : n > 6 ? 2 : 1;
  const stepX = n > 1 ? (w - pad * 2) / (n - 1) : 0;
  const pt = (i: number) => {
    const x = n === 1 ? w / 2 : pad + i * stepX;
    const y = pad + (h - pad * 2) * (1 - chartData[i].count / maxCount);
    return [x, y];
  };
  const line =
    n > 1
      ? chartData
          .map((_, i) => pt(i).map((v) => v.toFixed(1)).join(","))
          .map((p, i) => `${i === 0 ? "M" : "L"}${p}`)
          .join(" ")
      : n === 1
        ? `M${w / 2} ${pad} L${w / 2} ${pad}`
        : "";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {}
      <div className="space-y-6">
        {}
        <div className="rounded-2xl border border-green-200 bg-white shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="h-5 w-5 text-green-600" />
            <h3 className="text-base font-bold text-[#333]">Your Lowest Similarity</h3>
          </div>
          {data.lowest ? (
            <button
              type="button"
              onClick={() => goTaf(data.lowest!.tafId, data.lowest!.title)}
              className="w-full text-left cursor-pointer group"
            >
              <p className="text-3xl font-black text-green-600">
                {data.lowest.similarity.toFixed(2)}%
              </p>
              <p className="text-sm font-medium text-[#333] mt-1 group-hover:text-[#8B1A1A] line-clamp-2">
                {data.lowest.title}
              </p>
            </button>
          ) : (
            <p className="text-sm text-gray-400">No analyzed TAFs yet.</p>
          )}
        </div>

        {}
        <div className="rounded-2xl border border-red-200 bg-white shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-5 w-5 text-red-600" />
            <h3 className="text-base font-bold text-[#333]">Your Highest Similarity</h3>
          </div>
          {data.highest ? (
            <button
              type="button"
              onClick={() => goTaf(data.highest!.tafId, data.highest!.title)}
              className="w-full text-left cursor-pointer group"
            >
              <p className="text-3xl font-black text-red-600">
                {data.highest.similarity.toFixed(2)}%
              </p>
              <p className="text-sm font-medium text-[#333] mt-1 group-hover:text-[#8B1A1A] line-clamp-2">
                {data.highest.title}
              </p>
            </button>
          ) : (
            <p className="text-sm text-gray-400">No analyzed TAFs yet.</p>
          )}
        </div>
      </div>

      {}
      <div className="space-y-6">
        {}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-[#333]">Submitted TAF</h3>
              <p className="text-xs text-gray-500">
                Total: <span className="font-semibold text-[#8B1A1A]">{totalTafs}</span>
              </p>
            </div>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30"
            >
              <option value="all">All months</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={String(i + 1).padStart(2, "0")}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {chartData.length === 0 ? (
            <div className="flex h-[140px] items-center justify-center text-sm text-gray-400">
              No generated TAFs for this period.
            </div>
          ) : (
            <>
              <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
                {}
                {[0, 0.5, 1].map((g) => (
                  <g key={g}>
                    <line
                      x1={pad}
                      x2={w - pad}
                      y1={pad + (h - pad * 2) * g}
                      y2={pad + (h - pad * 2) * g}
                      stroke="#e5e7eb"
                      strokeWidth="1"
                    />
                    <text
                      x={pad - 6}
                      y={pad + (h - pad * 2) * g + 3}
                      textAnchor="end"
                      fontSize="10"
                      fill="#9ca3af"
                    >
                      {Math.round(maxCount * (1 - g))}
                    </text>
                  </g>
                ))}
                {
}
                {line && (
                  <path
                    d={line}
                    fill="none"
                    stroke="#8B1A1A"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}
                {chartData.map((d, i) => {
                  const [x, y] = pt(i);
                  return (
                    <g key={d.month}>
                      {}
                      <circle cx={x} cy={y} r="10" fill="transparent">
                        <title>{`${chartLabel(d.month)}: ${d.count} TAF${d.count === 1 ? "" : "s"}`}</title>
                      </circle>
                      <circle
                        cx={x}
                        cy={y}
                        r="3.5"
                        fill="#8B1A1A"
                      />
                    </g>
                  );
                })}
              </svg>
              {

}
              <div className="flex justify-between mt-1 px-[30px] text-[10px] text-gray-400">
                {chartData.map((d, i) => (
                  <span key={d.month} className="truncate" title={chartLabel(d.month)}>
                    {i % labelEvery === 0 ? chartLabel(d.month) : ""}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        {}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <History className="h-5 w-5 text-[#8B1A1A]" />
            <h3 className="text-base font-bold text-[#333]">Most Recent TAFs</h3>
          </div>
          {data.recent.length === 0 ? (
            <p className="text-sm text-gray-400">No recently viewed TAFs yet.</p>
          ) : (
            <ul className="space-y-2">
              {data.recent.map((t) => (
                <li key={t.tafId}>
                  <button
                    type="button"
                    onClick={() => goTaf(t.tafId, t.title)}
                    className="flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-left hover:bg-gray-100 transition-colors cursor-pointer"
                  >
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                        t.similarity >= HIGH_SIMILARITY_THRESHOLD
                          ? "bg-red-50 text-red-700"
                          : "bg-green-50 text-green-700"
                      }`}
                    >
                      {t.similarity.toFixed(1)}%
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate text-sm font-medium text-[#333]">
                        {t.title}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {}
          <button
            type="button"
            onClick={() => router.push(`/dashboard/student/${userId}/taf/new/_`)}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#8B1A1A] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#a32020] transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            New TAF
          </button>
        </div>
      </div>
    </div>
  );
}