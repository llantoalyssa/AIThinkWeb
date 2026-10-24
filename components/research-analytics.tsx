"use client";
import { useEffect, useRef, useState } from "react";
import {
  getResearchAnalytics,
  type AnalyticsData,
  type ReferencedCapstone,
  type ApprovedTaf,
  type SimilarityEntry,
  type SDGCount,
  type FieldCount,
} from "@/server/actions/research-analytics";
import { Loader2, X, Search, Download, Award, TrendingDown, TrendingUp, BarChart3, FolderTree, Target, CheckCircle2, CalendarDays } from "lucide-react";
import { IT_FIELDS, normalizeFieldOfIt } from "@/lib/constants";
import JournalViewerButton from "@/components/journal-viewer-button";
const SDG_MEANINGS_CLIENT: Record<string, string> = {
  "1": "No Poverty",
  "2": "Zero Hunger",
  "3": "Good Health & Well Being",
  "4": "Quality Education",
  "5": "Gender Equality",
  "6": "Clean Water & Sanitation",
  "7": "Affordable & Clean Energy",
  "8": "Decent Work & Economic Growth",
  "9": "Industry, Innovation & Infrastructure",
  "10": "Reduced Inequalities",
  "11": "Sustainable Cities & Communities",
  "12": "Responsible Consumption & Production",
  "13": "Climate Action",
  "14": "Life Below Water",
  "15": "Life on Land",
  "16": "Peace, Justice & Strong Institutions",
  "17": "Partnerships for the Goals",
};
function ColumnBar({
  label,
  value,
  max,
  color = "#8B1A1A",
  onClick,
  title,
}: {
  label: React.ReactNode;
  value: number;
  max: number;
  color?: string;
  onClick?: () => void;
  title?: string;
}) {
  const pct = max > 0 ? Math.max((value / max) * 100, 3) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={title}
      className={`group flex flex-1 flex-col items-stretch justify-end ${onClick ? "cursor-pointer" : "cursor-default"}`}
    >
      <div className="mb-1 text-center text-xs font-bold text-gray-500">{value}</div>
      <div className="flex h-40 items-end overflow-hidden rounded-lg bg-gray-50/60">
        <div
          className="w-full rounded-t-md transition-all group-hover:opacity-80"
          style={{ height: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <div className="mt-1.5 text-center text-[10px] leading-tight text-[#333] font-medium line-clamp-3" style={{ height: "3rem" }}>
        {label}
      </div>
    </button>
  );
}
function ColumnChart({
  data,
  color,
  onSelect,
}: {
  data: { label: React.ReactNode; value: number; key: string; meaning?: string }[];
  color?: string;
  onSelect?: (key: string) => void;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-1 sm:gap-2">
      {data.map((d) => (
        <ColumnBar
          key={d.key}
          label={d.label}
          value={d.value}
          max={max}
          color={color}
          onClick={onSelect ? () => onSelect(d.key) : undefined}
          title={d.meaning}
        />
      ))}
    </div>
  );
}
function CapstoneRow({ c }: { c: ReferencedCapstone }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
      <div className="flex-1 min-w-0">
        <p className="truncate text-[13px] font-medium text-[#333]" title={c.title}>{c.title}</p>
        <p className="truncate text-[11px] text-gray-500" title={c.authors || "Unknown author"}>{c.authors || "Unknown author"}</p>
      </div>
      <span className="shrink-0 mt-0.5 rounded-full bg-[#8B1A1A]/10 px-2 py-0.5 text-[10px] font-bold text-[#8B1A1A]">
        {c.referenceCount}×
      </span>
    </div>
  );
}
function ApprovedTable({
  rows,
  exportId,
  years = [],
}: {
  rows: ApprovedTaf[];
  exportId: string;

  years?: string[];
}) {
  const [q, setQ] = useState("");
  const [year, setYear] = useState("all");
  const filtered = rows.filter((r) => {
    const s = q.trim().toLowerCase();
    const yearOk = year === "all" ? true : r.year === year;
    if (!s) return yearOk;
    return (
      yearOk &&
      (r.proposedTitle.toLowerCase().includes(s) ||
        r.studentName.toLowerCase().includes(s) ||
        r.fieldOfIt.toLowerCase().includes(s))
    );
  });

  return (
    <div id={exportId} className="rounded-xl border border-gray-200">
      <div className="print-hide border-b border-gray-100 p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search TAF title, author, or field…"
            className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30"
          />
        </div>
        {years.length > 0 && (
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30 cursor-pointer"
          >
            <option value="all">All Years</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        )}
        <span className="text-xs text-gray-400 whitespace-nowrap">{filtered.length} of {rows.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2 font-semibold">TAF Title</th>
              <th className="px-3 py-2 font-semibold">Authors</th>
              <th className="px-3 py-2 font-semibold">Field of IT</th>
              <th className="px-3 py-2 font-semibold text-right">Similarity</th>
              <th className="px-3 py-2 font-semibold text-right">Year</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-gray-400">No matching TAFs.</td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.tafId} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-[#333]">
                  <span className="line-clamp-2 max-w-[280px]" title={r.proposedTitle}>{r.proposedTitle}</span>
                </td>
                  <td className="px-3 py-2 text-gray-600">
                    <span title={r.studentName}>{r.studentName}</span>
                    {r.studentSrCode ? <span className="text-gray-400 text-xs"> ({r.studentSrCode})</span> : null}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{r.fieldOfIt}</td>
                  <td className="px-3 py-2 text-right font-semibold text-[#8B1A1A]">{r.combinedScore.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right text-gray-500">{r.year || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function Dialog({
  open,
  onClose,
  title,
  children,
  exportTarget,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  exportTarget?: string;

  size?: "md" | "lg" | "xl";
}) {
  const [printing, setPrinting] = useState(false);
  if (!open) return null;

  const maxW =
    size === "xl" ? "max-w-6xl" : size === "lg" ? "max-w-5xl" : "max-w-4xl";

  function exportPdf() {
    if (printing) return;
    const source = document.getElementById(
      exportTarget || "analytics-export-root",
    );
    if (!source) return;
    document.getElementById("analytics-print-root")?.remove();
    const clone = document.createElement("div");
    clone.id = "analytics-print-root";
    clone.innerHTML = source.innerHTML;
    clone.style.display = "none";
    clone.style.printColorAdjust = "exact";
    (clone.style as unknown as Record<string, string>).webkitPrintColorAdjust =
      "exact";
    document.body.appendChild(clone);

    const style = document.createElement("style");
    style.id = "analytics-print-style";
    style.textContent = `
      @media print {
        body > *:not(#analytics-print-root) { display: none !important; }
        #analytics-print-root { display: block !important; width: 100% !important; max-width: 100% !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        #analytics-print-root * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        #analytics-print-root .print-hide { display: none !important; }
      }`;
    document.head.appendChild(style);
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.getElementById("analytics-print-root")?.remove();
        document.getElementById("analytics-print-style")?.remove();
        setPrinting(false);
      }, 400);
    }, 50);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative flex max-h-[90vh] w-full ${maxW} flex-col overflow-hidden rounded-2xl bg-white shadow-2xl`}>
        <div className="flex items-center justify-between border-b bg-white px-5 py-3.5">
          <h3 className="text-base font-semibold text-[#333] flex items-center gap-2">{title}</h3>
          <div className="flex items-center gap-1">
            {exportTarget && (
              <button
                type="button"
                onClick={exportPdf}
                disabled={printing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" /> {printing ? "Preparing…" : "Export PDF"}
              </button>
            )}
            <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 cursor-pointer" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
export default function ResearchAnalytics({
  role,
  initialData,
}: {
  role: string;
  initialData?: AnalyticsData | null;
}) {
  const [data, setData] = useState<AnalyticsData | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [err, setErr] = useState<string | null>(null);
  const didLoad = useRef(!!initialData);
  const [showMore, setShowMore] = useState<"most" | "least" | null>(null);
  const [sdgDialog, setSdgDialog] = useState(false);
  const [foitDialog, setFoitDialog] = useState(false);

  const [selectedSdg, setSelectedSdg] = useState<SDGCount | null>(null);
  const [selectedField, setSelectedField] = useState<FieldCount | null>(null);

  const [yearFilter, setYearFilter] = useState<string>("all");

  useEffect(() => {
    if (didLoad.current) return;
    didLoad.current = true;
    async function load() {
      const res = await getResearchAnalytics();
      if (res.success) setData(res.data);
      else setErr(res.error);
      setLoading(false);
    }
    void load();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white py-16">
        <Loader2 className="h-8 w-8 animate-spin text-[#8B1A1A]" />
        <p className="mt-2 text-sm text-gray-400">Loading analytics…</p>
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600">
        {err || "Failed to load analytics."}
      </div>
    );
  }
  const years = Array.from(
    new Set(data.approvedTafs.map((t) => t.year).filter((y): y is string => !!y)),
  ).sort((a, b) => parseInt(b) - parseInt(a));

  const yearFilteredApproved = data.approvedTafs.filter((t) =>
    yearFilter === "all" ? true : t.year === yearFilter,
  );
  const sdgCounts: SDGCount[] = (() => {
    const agg: Record<string, number> = {};
    for (const t of yearFilteredApproved) {
      for (const c of t.sdgCategories || []) {
        const m = c.match(/SDG\s*(\d+)/i);
        if (m) {
          const code = String(parseInt(m[1], 10));
          if (code !== "NaN" && parseInt(code, 10) >= 1 && parseInt(code, 10) <= 17) {
            agg[code] = (agg[code] || 0) + 1;
          }
        }
      }
    }
    return Array.from({ length: 17 }, (_, i) => {
      const code = String(i + 1);
      return {
        code,
        meaning: SDG_MEANINGS_CLIENT[code] || "Other",
        label: `SDG ${code} — ${SDG_MEANINGS_CLIENT[code] || "Other"}`,
        count: agg[code] || 0,
      };
    });
  })();

  const fieldCounts: FieldCount[] = (() => {
    const agg: Record<string, number> = {};
    for (const t of yearFilteredApproved) {

      const f = normalizeFieldOfIt(t.fieldOfIt);
      agg[f] = (agg[f] || 0) + 1;
    }

    const out: FieldCount[] = IT_FIELDS.map((field) => ({
      field,
      count: agg[field] || 0,
    }));

    if ((agg["Unclassified"] || 0) > 0) {
      out.push({ field: "Unclassified", count: agg["Unclassified"] });
    }
    return out;
  })();

  const withScore = yearFilteredApproved
    .filter((t) => t.combinedScore > 0)
    .sort((a, b) => b.combinedScore - a.combinedScore);
  const highestSimilarity = withScore[0] || null;
  const lowestSimilarity = withScore[withScore.length - 1] || null;
  const toSim = (t: ApprovedTaf | null): SimilarityEntry | null =>
    t
      ? {
          tafId: t.tafId,
          proposedTitle: t.proposedTitle,
          studentName: t.studentName,
          studentSrCode: t.studentSrCode,
          combinedScore: t.combinedScore,
          internalScore: t.internalScore,
          externalScore: t.externalScore,
          fieldOfIt: t.fieldOfIt,
          fullyApprovedAt: t.fullyApprovedAt,
        }
      : null;
  const highestSim = toSim(highestSimilarity);
  const lowestSim = toSim(lowestSimilarity);
  const sdgRows = selectedSdg
    ? yearFilteredApproved.filter(
        (t) =>
          (t.sdgCategories || []).some((c) => {
            const m = c.match(/SDG\s*(\d+)/i);
            return m && m[1] === selectedSdg.code;
          }),
      )
    : yearFilteredApproved;
  const foitRows = selectedField
    ? yearFilteredApproved.filter(
        (t) => normalizeFieldOfIt(t.fieldOfIt) === selectedField.field,
      )
    : yearFilteredApproved;
  const topSdgCounts = [...sdgCounts].sort((a, b) => b.count - a.count).slice(0, 5);
  const topFieldCounts = [...fieldCounts].sort((a, b) => b.count - a.count).slice(0, 5);
  const showCapstones = role !== "vcrdes";
  const sdgCard = (
    <Card title="Sustainable Development Goals" icon={<Target />} subtitle="Targeted by Topics · click a bar to see its TAFs" onClick={() => setSdgDialog(true)}>
      {sdgCounts.length === 0 ? (
        <Empty text="No SDG data yet." />
      ) : (
        <ColumnChart
          color="#8B1A1A"
          data={topSdgCounts.map((s) => ({ key: s.code, label: `SDG ${s.code}`, value: s.count, meaning: s.label }))}
          onSelect={(code) => {
            const s = sdgCounts.find((x) => x.code === code);
            if (s) { setSelectedSdg(s); setSdgDialog(true); }
          }}
        />
      )}
    </Card>
  );

  const simCard = (
    <Card title="Top &amp; Bottom Similarity" icon={<TrendingUp />} subtitle="Combined score on fully approved TAFs">
      {highestSim ? (
        <SimilarityRow label="Highest" entry={highestSim} tone="bad" />
      ) : (
        <Empty text="No similarity data." />
      )}
      {lowestSim ? (
        <SimilarityRow label="Lowest" entry={lowestSim} tone="good" />
      ) : null}
    </Card>
  );

  const foitCard = (
    <Card title="Field of Information Technology" icon={<FolderTree />} subtitle="Targeted by Topics · click a bar to see its TAFs" onClick={() => setFoitDialog(true)}>
      {fieldCounts.length === 0 ? (
        <Empty text="No field data yet." />
      ) : (
        <ColumnChart
          color="#4f46e5"
          data={topFieldCounts.map((f) => ({ key: f.field, label: f.field, value: f.count, meaning: f.field }))}
          onSelect={(field) => {
            const f = fieldCounts.find((x) => x.field === field);
            if (f) { setSelectedField(f); setFoitDialog(true); }
          }}
        />
      )}
    </Card>
  );

  const capstoneCards = showCapstones ? (
    <div className="lg:col-span-5 space-y-4">
      <Card title="Most Referenced Capstone Studies" icon={<Award />} subtitle="By internal similarity references" onClick={() => setShowMore("most")} actionLabel="View all">
        {data.mostReferenced.length === 0 ? (
          <Empty text="No referenced capstones yet." />
        ) : (
          <div className="space-y-1.5">
            {data.mostReferenced.slice(0, 4).map((c) => <CapstoneRow key={c.journalId} c={c} />)}
          </div>
        )}
      </Card>
      <Card title="Least Referenced Capstone Studies" icon={<TrendingDown />} subtitle="By internal similarity references" onClick={() => setShowMore("least")} actionLabel="View all">
        {data.leastReferenced.length === 0 ? (
          <Empty text="No referenced capstones yet." />
        ) : (
          <div className="space-y-1.5">
            {data.leastReferenced.slice(0, 4).map((c) => <CapstoneRow key={c.journalId + c.title} c={c} />)}
          </div>
        )}
      </Card>
    </div>
  ) : null;

  return (
    <div>
      {}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#333] flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-[#8B1A1A]" />
            Research Analytics
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Insights from {data.approvedTafs.length} fully approved capstone {data.approvedTafs.length === 1 ? "study" : "studies"}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="appearance-none rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-8 text-xs font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30 cursor-pointer"
            >
              <option value="all">All Years</option>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Live
          </span>
        </div>
      </div>

      {}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Approved TAFs" value={yearFilteredApproved.length} icon={<CheckCircle2 className="h-4 w-4" />} tint="bg-green-500" />
        <KpiCard label="SDGs Targeted" value={sdgCounts.filter((s) => s.count > 0).length} icon={<Target className="h-4 w-4" />} tint="bg-[#8B1A1A]" />
        <KpiCard label="Fields of IT" value={fieldCounts.filter((f) => f.count > 0).length} icon={<FolderTree className="h-4 w-4" />} tint="bg-indigo-500" />
        <KpiCard
          label="Avg Similarity"
          value={yearFilteredApproved.length ? `${(yearFilteredApproved.reduce((a, t) => a + t.combinedScore, 0) / yearFilteredApproved.length).toFixed(1)}%` : "—"}
          icon={<TrendingUp className="h-4 w-4" />}
          tint="bg-amber-500"
        />
      </div>

      {role === "vcrdes" ? (
        <>
          {}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 mb-4">
            <div className="lg:col-span-6">{sdgCard}</div>
            <div className="lg:col-span-6">{foitCard}</div>
          </div>
          {}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-12">{simCard}</div>
          </div>
        </>
      ) : (
        <>
          {}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 mb-4">
            <div className="lg:col-span-7">{sdgCard}</div>
            <div className="lg:col-span-5">{simCard}</div>
          </div>
          {}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-7">{foitCard}</div>
            {capstoneCards}
          </div>
        </>
      )}

      {}
      <Dialog open={showMore !== null} onClose={() => setShowMore(null)} title={showMore === "most" ? "Most Referenced Capstone Studies" : "Least Referenced Capstone Studies"}>
        <div className="space-y-2">
          {(showMore === "most" ? data.mostReferenced : data.leastReferenced).length === 0 ? (
            <Empty text="No data yet." />
          ) : (showMore === "most" ? data.mostReferenced : data.leastReferenced).map((c) => (
            <div key={c.journalId + c.title} className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[#333]">{c.title}</p>
                <p className="text-xs text-gray-500">{c.authors || "Unknown author"}{c.year ? ` · ${c.year}` : ""}</p>
              </div>
              <span className="shrink-0 rounded-full bg-[#8B1A1A]/10 px-2.5 py-1 text-[11px] font-bold text-[#8B1A1A]">
                Referenced {c.referenceCount}×
              </span>
              <JournalViewerButton journalId={c.journalId} />
            </div>
          ))}
        </div>
      </Dialog>

      {}
      <Dialog
        open={sdgDialog}
        onClose={() => setSdgDialog(false)}
        title={<span className="flex items-center gap-2"><Target className="h-4 w-4 text-[#8B1A1A]" /> Sustainable Development Goals</span>}
        exportTarget="analytics-export-root"
      >
        <div id="analytics-export-root">
          <p className="mb-3 text-sm text-gray-500">Targeted by Topics — click a bar to see the fully approved TAFs for that SDG.</p>
          {}
          <div className="mb-4">
            <ColumnChart
              color="#8B1A1A"
              data={sdgCounts.map((s) => ({ key: s.code, label: `SDG ${s.code}`, value: s.count, meaning: s.label }))}
              onSelect={(code) => {
                const s = sdgCounts.find((x) => x.code === code);
                if (s) setSelectedSdg(s);
              }}
            />
          </div>
          {sdgCounts.length === 0 && <Empty text="No SDG data yet." />}

          {}
          {selectedSdg && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-[#8B1A1A]/20 bg-[#8B1A1A]/5 px-3 py-2.5">
              <span className="rounded-full bg-[#8B1A1A] px-2.5 py-0.5 text-xs font-bold text-white">
                SDG {selectedSdg.code}
              </span>
              <span className="flex-1 text-sm font-medium text-[#333]">{selectedSdg.meaning}</span>
              <button
                type="button"
                onClick={() => setSelectedSdg(null)}
                className="print-hide shrink-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 cursor-pointer"
              >
                Reset
              </button>
            </div>
          )}

          {}
          <h4 className="mb-2 text-sm font-semibold text-[#333]">
            Fully Approved TAFs{selectedSdg ? ` · ${selectedSdg.label}` : " · All SDGs — click a bar to filter"}
          </h4>
          <ApprovedTable rows={sdgRows} exportId="analytics-export-root" years={years} />
        </div>
      </Dialog>

      {}
      <Dialog
        open={foitDialog}
        onClose={() => setFoitDialog(false)}
        title={<span className="flex items-center gap-2"><FolderTree className="h-4 w-4 text-[#8B1A1A]" /> Field of Information Technology</span>}
        exportTarget="analytics-export-root-foit"
        size="xl"
      >
        <div id="analytics-export-root-foit">
          <p className="mb-3 text-sm text-gray-500">Targeted by Topics — click a bar to see the fully approved TAFs for that field.</p>
          <div className="mb-4">
            <ColumnChart
              color="#4f46e5"
              data={fieldCounts.map((f) => ({ key: f.field, label: f.field, value: f.count, meaning: f.field }))}
              onSelect={(field) => {
                const f = fieldCounts.find((x) => x.field === field);
                if (f) setSelectedField(f);
              }}
            />
          </div>
          {fieldCounts.length === 0 && <Empty text="No field data yet." />}

          {selectedField && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5">
              <span className="flex-1 text-sm font-medium text-[#333]">{selectedField.field}</span>
              <button
                type="button"
                onClick={() => setSelectedField(null)}
                className="print-hide shrink-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 cursor-pointer"
              >
                Reset
              </button>
            </div>
          )}

          <h4 className="mb-2 text-sm font-semibold text-[#333]">
            Fully Approved TAFs{selectedField ? ` · ${selectedField.field}` : " · All IT Fields — click a bar to filter"}
          </h4>
          <ApprovedTable rows={foitRows} exportId="analytics-export-root-foit" years={years} />
        </div>
      </Dialog>
    </div>
  );
}
function Card({
  title,
  subtitle,
  icon,
  onClick,
  actionLabel,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  onClick?: () => void;

  actionLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={onClick ? 0 : -1}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      className={`w-full rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition-shadow ${
        onClick ? "hover:shadow-md hover:border-[#8B1A1A]/30 cursor-pointer" : ""
      }`}
    >
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#8B1A1A]/10">
          <span className="h-5 w-5 text-[#8B1A1A]">{icon}</span>
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[#333] flex items-center gap-1.5">
            {title}
          </h3>
          {subtitle && <p className="text-[11px] text-gray-500">{subtitle}</p>}
        </div>
        {actionLabel && onClick && (
          <span className="shrink-0 rounded-full border border-[#8B1A1A]/20 bg-[#8B1A1A]/5 px-2.5 py-1 text-[11px] font-semibold text-[#8B1A1A]">
            {actionLabel} →
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
function KpiCard({
  label,
  value,
  icon,
  tint,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  tint: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2.5">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white ${tint}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
          <p className="text-xl font-bold text-[#333] leading-tight">{value}</p>
        </div>
      </div>
    </div>
  );
}
function SimilarityRow({
  label,
  entry,
  tone,
}: {
  label: string;
  entry: SimilarityEntry;
  tone: "good" | "bad";
}) {
  const good = tone === "good";
  return (
    <div className={`mb-2 rounded-lg border p-3 ${good ? "border-green-100 bg-green-50" : "border-red-100 bg-red-50"}`}>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className={`font-semibold ${good ? "text-green-700" : "text-red-700"}`}>{label}</span>
        <span className={`font-bold ${good ? "text-green-700" : "text-red-700"}`}>{entry.combinedScore.toFixed(1)}%</span>
      </div>
      <p className="truncate text-[13px] font-medium text-[#333]" title={entry.proposedTitle}>{entry.proposedTitle}</p>
      <p className="text-[11px] text-gray-500" title={entry.studentName}>{entry.studentName}</p>
      <p className="mt-0.5 text-[10px] text-gray-400">
        Approved {new Date(entry.fullyApprovedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
      </p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-gray-400">{text}</p>;
}