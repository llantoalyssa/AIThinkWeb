"use client";

// ============================================================
// ResearchAnalytics — approval-dashboard analytics for the
// Associate Dean & Dean. Renders 3 columns of cards (all data is
// fully-approved TAFs only): Top/Least Referenced Capstones,
// SDG bar chart, Top similarity, and Field-of-IT bar chart.
// Every card opens a dialog; the SDG/FoIT dialogs show the chart +
// a searchable/filterable table of fully approved TAFs + PDF export.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getResearchAnalytics,
  type AnalyticsData,
  type ReferencedCapstone,
  type ApprovedTaf,
  type SimilarityEntry,
  type SDGCount,
  type FieldCount,
} from "@/server/actions/research-analytics";
import { Loader2, X, Search, Download, Award, TrendingDown, TrendingUp, BarChart3, FolderTree, Target, CheckCircle2, CalendarDays, ChevronRight } from "lucide-react";
import { IT_FIELDS, normalizeFieldOfIt, rolePath, type UserRole } from "@/lib/constants";
import { groupSlug } from "@/lib/slug";
import JournalViewerButton from "@/components/journal-viewer-button";

// Client-side SDG meaning map (mirrors the server's SDG_MEANINGS) so the
// year-filtered charts can rebuild labels without an extra fetch.
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

// ── Vertical column bar (bar-graph style) ───────────────────
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
      <div className="flex h-28 items-end overflow-hidden rounded-lg bg-gray-50/60 sm:h-40">
        <div
          className="w-full rounded-t-md transition-all group-hover:opacity-80"
          style={{ height: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <div className="mt-1.5 line-clamp-2 text-center text-[9px] font-medium leading-tight text-[#333] sm:line-clamp-3 sm:text-[10px]" style={{ minHeight: "2.25rem" }}>
        {label}
      </div>
    </button>
  );
}

// ── Column chart container (flexible row of bars) ───────────
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
  /**
   * A phone cannot fit 17 tap targets side by side: `flex-1` shrank each bar to
   * ~18px, which also crushed the labels. Give every bar a usable minimum and
   * let the row scroll sideways instead — desktop still fits without scrolling
   * because the min-width stays below the card width.
   */
  const minWidth = Math.max(data.length * 46, 280);
  return (
    <div className="chart-scroll -mx-1 overflow-x-auto pb-1">
      <div
        className="chart-track flex items-end gap-1 px-1 sm:gap-2"
        style={{ minWidth: `${minWidth}px` }}
      >
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
    </div>
  );
}

// ── Capstone list card (shared row) ─────────────────────────
// The reference badge is the drill-down: it opens the list of fully approved
// TAFs behind that count, so the number is never a dead end.
function CapstoneRow({ c, onOpen }: { c: ReferencedCapstone; onOpen: (c: ReferencedCapstone) => void }) {
  const count = c.referenceCount;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
      <div className="flex-1 min-w-0">
        <p className="truncate text-[13px] font-medium text-[#333]" title={c.title}>{c.title}</p>
        <p className="truncate text-[11px] text-gray-500" title={c.authors || "Unknown author"}>{c.authors || "Unknown author"}</p>
      </div>
      <button
        type="button"
        onClick={(event) => {
          // The card this badge sits in opens "Most referenced" on click; without
          // stopping propagation the badge opened BOTH dialogs at once, which is
          // the overlap that was reported.
          event.stopPropagation();
          onOpen(c);
        }}
        className="shrink-0 mt-0.5 min-w-[2.25rem] rounded-full bg-[#8B1A1A]/10 px-2 py-1 text-[10px] font-bold text-[#8B1A1A] hover:bg-[#8B1A1A]/20 transition-colors cursor-pointer"
        title={`See the ${count} approved TAF${count === 1 ? "" : "s"} that referenced this capstone`}
      >
        {count}×
      </button>
    </div>
  );
}

/** Date shown in the reference drill-down ("—" when the stamp is missing). */
function formatApprovedDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// ── Approved TAF table (shared by SDG & FoIT dialogs) ───────
function ApprovedTable({
  rows,
  exportId,
  years = [],
}: {
  rows: ApprovedTaf[];
  exportId: string;
  /** available years for the dropdown ("" = all). */
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

// ── Dialog shell ────────────────────────────────────────────
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
  exportTarget?: string; // element id to print
  /** Content width. "md" = max-w-4xl (default), "lg" = max-w-5xl, "xl" = max-w-6xl. */
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

    // PREVIOUS approach printed the element in place with `position: absolute`
    // + `visibility`. That blanked the output because the target lives inside
    // the dialog's `overflow-hidden`/`overflow-y-auto` containers: taking it
    // out of flow collapses those containers so the print is clipped to
    // nothing. Instead, CLONE the content into a top-level node appended to
    // <body> (no overflow/visibility ancestors), hidden on screen and shown
    // only for print. `print-color-adjust: exact` keeps the div-based bar
    // charts colored (without it Chromium drops background colors → blank bars).
    document.getElementById("analytics-print-root")?.remove();
    const clone = document.createElement("div");
    clone.id = "analytics-print-root";
    clone.innerHTML = source.innerHTML;
    clone.style.display = "none"; // hidden on screen; revealed only in @media print
    clone.style.printColorAdjust = "exact";
    (clone.style as unknown as Record<string, string>).webkitPrintColorAdjust =
      "exact";

    // Physically drop screen-only chrome from the clone. Relying on
    // `display: none` alone left the on-screen hints ("… click a bar …") in the
    // printed page whenever the rule did not match, so they are removed here —
    // the exported DOM simply does not contain them.
    clone.querySelectorAll(".print-hide").forEach((node) => node.remove());

    document.body.appendChild(clone);

    const style = document.createElement("style");
    style.id = "analytics-print-style";
    style.textContent = `
      /* A zero page margin is the ONLY reliable way to suppress the browser's
         own header/footer (page number, URL, date): those live in the margin
         box, so with no margin they are not drawn. The content padding below
         replaces the lost margin. */
      @page { size: A4 portrait; margin: 14mm 12mm; }
      @media print {
        body > *:not(#analytics-print-root) { display: none !important; }
        #analytics-print-root {
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
          /* Real @page margins now carry the inset, and unlike padding they
             repeat on EVERY page — a table continuing onto page 2 no longer
             starts flush against the paper edge. */
          padding: 0 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        #analytics-print-root * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        /* Interactive controls (Reset buttons, search/year filters) and the
           on-screen "click a bar" hints are chrome — never in the export. */
        #analytics-print-root .print-hide { display: none !important; }
        /* Blocks that exist ONLY in the printed copy (title + description). */
        #analytics-print-root .export-only { display: block !important; }
        /* TABLES ON PAPER.
           Two things used to break here:
           • the table kept its on-screen min-width, so long rows were cut off at
             the right paper edge;
           • a row larger than the space left was split by the paginator, and the
             repeated header then appeared underneath a half row, which read as a
             duplicated header.
           Fixed layout + wrapping cells keeps the table inside the page, and a
           row is never split across pages. */
        #analytics-print-root table {
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
          table-layout: fixed !important;
        }
        #analytics-print-root th,
        #analytics-print-root td {
          overflow-wrap: anywhere !important;
          word-break: break-word !important;
        }
        #analytics-print-root thead { display: table-header-group; }
        #analytics-print-root thead tr { break-after: avoid; page-break-after: avoid; }
        #analytics-print-root tbody tr,
        #analytics-print-root tr {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }

        /* CHARTS MUST FIT THE PAGE.
           The chart row is a sideways-scroll container on purpose (17 SDG bars
           need ~46px each on a phone). Printed, that scroll box clipped every
           bar past the printable width — the export showed a cut chart and no
           way to reach the rest. Scrolling is meaningless on paper, so the
           container is released and the bars share the page width instead. */
        #analytics-print-root .chart-scroll,
        #analytics-print-root .overflow-x-auto,
        #analytics-print-root .overflow-y-auto {
          overflow: visible !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
          max-width: 100% !important;
        }
        #analytics-print-root .chart-track {
          min-width: 0 !important;
          width: 100% !important;
          max-width: 100% !important;
          /* 17 bars squeezed into one printed row are ~33px wide and their
             labels become unreadable. Wrapping keeps every bar a usable width
             and still fits the page — no scrollbar, nothing cut. */
          flex-wrap: wrap !important;
          justify-content: flex-start !important;
          row-gap: 10px !important;
        }
        #analytics-print-root .chart-track > * {
          flex: 1 1 56px !important;
          min-width: 0 !important;
          max-width: 96px !important;
        }
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
    /* On a phone a centred 90vh card with 16px gutters wastes the screen: the
       chart and the table both need width. Full-bleed below sm, the familiar
       centred card from sm up. */
    <div className="fixed inset-0 z-[80] flex items-stretch justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={`relative flex h-[100dvh] max-h-[100dvh] w-full ${maxW} flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-2xl`}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-white px-3 py-3 sm:px-5 sm:py-3.5">
          <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[#333] sm:text-base [&>span]:min-w-0 [&>span]:truncate">{title}</h3>
          <div className="flex shrink-0 items-center gap-1">
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
        <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────
export default function ResearchAnalytics({
  role,
  userId,
  initialData,
  hrefMode = "flat",
}: {
  role: UserRole;
  /** URL user id — used to build links into the approved-TAF viewer. */
  userId: string;
  /**
   * Where a clicked row opens its TAF. A SERIALIZABLE descriptor, not a
   * callback: this component is rendered by SERVER pages too, and a function
   * prop cannot cross that boundary.
   *
   *   "flat"  — /dashboard/<role>/<id>/submission/<id>   (approver dashboards)
   *   "group" — /dashboard/adviser/<id>/group/<slug>/submission/<id>
   *   "none"  — rows are read-only (no route to open a TAF in this context)
   */
  hrefMode?: "flat" | "group" | "none";
  /**
   * Optional server-supplied analytics (bundled into the dashboard's single
   * mount action). When given, the mount fetch is skipped and the panel paints
   * immediately; when absent or null it fetches exactly as before.
   */
  initialData?: AnalyticsData | null;
}) {
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [err, setErr] = useState<string | null>(null);
  // Which capstone's reference badge was clicked (null = dialog closed).
  const [refDetail, setRefDetail] = useState<ReferencedCapstone | null>(null);

  /** Open the drill-down without leaving the "View all" dialog stacked behind it. */
  function openRefDetail(c: ReferencedCapstone) {
    setShowMore(null);
    setRefDetail(c);
  }

  /** Whether a drill-down row can actually open its TAF. */
  const canOpenTaf = hrefMode !== "none" && Boolean(userId);

  /** Clicking a row opens that TAF in the approved (read-only) viewer. */
  function openApprovedTaf(submissionId: string, groupName = "") {
    if (!canOpenTaf || !submissionId) return;
    if (hrefMode === "group") {
      router.push(
        `${rolePath(role)}/${userId}/group/${groupSlug(groupName)}/submission/${submissionId}?from=approved`,
      );
      return;
    }
    router.push(`${rolePath(role)}/${userId}/submission/${submissionId}?from=approved`);
  }
  const didLoad = useRef(!!initialData);

  // dialog state
  const [showMore, setShowMore] = useState<"most" | "least" | null>(null);
  const [sdgDialog, setSdgDialog] = useState(false);
  const [foitDialog, setFoitDialog] = useState(false);
  // selected SDG/FoIT for the table filter (bar-clicked)
  const [selectedSdg, setSelectedSdg] = useState<SDGCount | null>(null);
  const [selectedField, setSelectedField] = useState<FieldCount | null>(null);
  // year filter for the charts + tables ("all" or a specific year)
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

  // ── Year-filtered derived data ────────────────────────────
  // Distinct years (sorted desc) from approved TAF approval dates.
  const years = Array.from(
    new Set(data.approvedTafs.map((t) => t.year).filter((y): y is string => !!y)),
  ).sort((a, b) => parseInt(b) - parseInt(a));

  const yearFilteredApproved = data.approvedTafs.filter((t) =>
    yearFilter === "all" ? true : t.year === yearFilter,
  );

  // Recompute SDG / field counts + highest/lowest from the filtered set.
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
    // Always render ALL 17 SDGs (zero counts included) in canonical order so
    // the chart/dialog never omits an SDG with no TAFs.
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
      // Normalize stored/free-text values onto the canonical IT_FIELDS.
      const f = normalizeFieldOfIt(t.fieldOfIt);
      agg[f] = (agg[f] || 0) + 1;
    }
    // Always render ALL nine canonical IT fields (zero counts included).
    const out: FieldCount[] = IT_FIELDS.map((field) => ({
      field,
      count: agg[field] || 0,
    }));
    // Append Unclassified only if some approved TAF didn't map to a field.
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

  // ── Table rows for the SDG dialog ───────────────────────
  // Default view shows ALL year-filtered approved TAFs; a selected bar
  // narrows it to just that SDG. A "Reset" button clears the selection.
  /**
   * Date printed in the exported file's header. Computed once per mount so the
   * value cannot change between the screen render and the print clone.
   */
  const exportStamp = new Date().toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

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

  // The dashboard CARDS preview only the TOP 5 bars; the dialogs show ALL
  // (17 SDGs / 9 IT fields). Keeps the cards compact without hiding data.
  const topSdgCounts = [...sdgCounts].sort((a, b) => b.count - a.count).slice(0, 5);
  const topFieldCounts = [...fieldCounts].sort((a, b) => b.count - a.count).slice(0, 5);

  // VCRDES: hide the Most/Least Referenced Capstone Studies cards.
  const showCapstones = role !== "vcrdes";

  // Card bodies reused by the per-role row layouts below.
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
    <Card title="Top &amp; Bottom Similarity" icon={<TrendingUp />} subtitle="">
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
            {data.mostReferenced.slice(0, 4).map((c) => <CapstoneRow key={c.journalId} c={c} onOpen={openRefDetail} />)}
          </div>
        )}
      </Card>
      <Card title="Least Referenced Capstone Studies" icon={<TrendingDown />} subtitle="By internal similarity references" onClick={() => setShowMore("least")} actionLabel="View all">
        {data.leastReferenced.length === 0 ? (
          <Empty text="No referenced capstones yet." />
        ) : (
          <div className="space-y-1.5">
            {data.leastReferenced.slice(0, 4).map((c) => <CapstoneRow key={c.journalId + c.title} c={c} onOpen={openRefDetail} />)}
          </div>
        )}
      </Card>
    </div>
  ) : null;

  return (
    <div>
      {/* ── Header ───────────────────────────────────────── */}
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

      {/* ── KPI strip ────────────────────────────────────── */}
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
          {/* Row: SDG + Field of IT side by side */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 mb-4">
            <div className="lg:col-span-6">{sdgCard}</div>
            <div className="lg:col-span-6">{foitCard}</div>
          </div>
          {/* Row: Top & Bottom similarity (full width) */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-12">{simCard}</div>
          </div>
        </>
      ) : (
        /* ONE grid with explicit mobile ordering.
           Desktop keeps its two rows (SDG | Similarity, Field of IT | Capstones),
           but on a phone the stacked order is SDG → Field of IT → Similarity →
           Capstones, so the two CHART cards sit together instead of being split
           by the similarity list. `order-*` only reorders the stacked column;
           from lg up the order classes restore the row layout. */
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="order-1 lg:col-span-7">{sdgCard}</div>
          <div className="order-2 lg:order-3 lg:col-span-7">{foitCard}</div>
          <div className="order-3 lg:order-2 lg:col-span-5">{simCard}</div>
          <div className="order-4 lg:col-span-5">{capstoneCards}</div>
        </div>
      )}

      {/* ── Dialog: More / Least referenced ──────────────── */}
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
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  openRefDetail(c);
                }}
                className="shrink-0 rounded-full bg-[#8B1A1A]/10 px-2.5 py-1 text-[11px] font-bold text-[#8B1A1A] hover:bg-[#8B1A1A]/20 transition-colors cursor-pointer"
                title={`See the ${c.referenceCount} approved TAF${c.referenceCount === 1 ? "" : "s"} that referenced this capstone`}
              >
                Referenced {c.referenceCount}×
              </button>
              <JournalViewerButton journalId={c.journalId} />
            </div>
          ))}
        </div>
      </Dialog>

      {/* ── Dialog: which fully approved TAFs reference this capstone ── */}
      {/* The count on the badge IS the length of this list, so clicking
          "5×" always shows exactly five rows. Rows open the TAF itself in the
          approved (read-only) viewer. */}
      <Dialog
        open={refDetail !== null}
        onClose={() => setRefDetail(null)}
        title={
          refDetail
            ? `Referenced by ${refDetail.referenceCount} approved TAF${refDetail.referenceCount === 1 ? "" : "s"}`
            : ""
        }
        size="lg"
      >
        {refDetail && (
          <div className="space-y-3">
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="font-medium text-[#333]">{refDetail.title}</p>
              <p className="text-xs text-gray-500">
                {refDetail.authors || "Unknown author"}
                {refDetail.year ? ` · ${refDetail.year}` : ""}
              </p>
            </div>

            {refDetail.referencedBy.length === 0 ? (
              <Empty text="No approved TAF detail recorded for this capstone." />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                      <th className="px-3 py-2 font-semibold">TAF Title</th>
                      <th className="px-3 py-2 font-semibold">Student</th>
                      <th className="px-3 py-2 font-semibold">Advisory Group</th>
                      <th className="px-3 py-2 font-semibold">Date</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {refDetail.referencedBy.map((r) => (
                      <tr
                        key={r.submissionId || r.tafId}
                        onClick={
                          canOpenTaf
                            ? () => openApprovedTaf(r.submissionId, r.groupName)
                            : undefined
                        }
                        className={`border-b last:border-0 transition-colors ${
                          canOpenTaf ? "cursor-pointer hover:bg-[#8B1A1A]/5" : ""
                        }`}
                        title={canOpenTaf ? "Open this approved TAF" : undefined}
                      >
                        <td className="px-3 py-2 text-[#333]">{r.title}</td>
                        <td className="px-3 py-2 text-gray-600">
                          {r.studentName}
                          {r.studentSrCode ? (
                            <span className="ml-1 text-xs text-gray-400">{r.studentSrCode}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{r.groupName}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                          {formatApprovedDate(r.approvedAt)}
                        </td>
                        <td className="px-3 py-2 text-right text-[#8B1A1A]">
                          {canOpenTaf && <ChevronRight className="ml-auto h-4 w-4" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs text-gray-400">
              Only fully approved TAFs are counted.
              {canOpenTaf ? " Click a row to open the TAF." : ""}
            </p>
          </div>
        )}
      </Dialog>


      {/* ── Dialog: SDG ──────────────────────────────────── */}
      <Dialog
        open={sdgDialog}
        onClose={() => setSdgDialog(false)}
        title={<span className="flex items-center gap-2"><Target className="h-4 w-4 text-[#8B1A1A]" /> Sustainable Development Goals</span>}
        exportTarget="analytics-export-root"
      >
        <div id="analytics-export-root">
          <p className="print-hide mb-3 text-sm text-gray-500">
            Targeted by Topics — click a bar to see the fully approved TAFs for that SDG.
          </p>

          {/* Printed copy only: what this file IS, and where it came from. */}
          <div className="export-only mb-4 hidden border-b border-gray-200 pb-3">
            <h1 className="text-lg font-bold text-[#333]">
              Sustainable Development Goals — Fully Approved TAFs
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              Fully approved Topic Abstract Forms grouped by UN Sustainable
              Development Goal. Generated {exportStamp} · College of Informatics and Computing Sciences, Batangas State University TNEU – JPLPC Malvar.
            </p>
          </div>
          {/* Chart */}
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

          {/* Selected SDG banner */}
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

          {/* Table — the heading is on-screen context only. The export carries
              its own title block, so this line is scrubbed from the printed copy. */}
          <h4 className="print-hide mb-2 text-sm font-semibold text-[#333]">
            Fully Approved TAFs
            {selectedSdg ? ` · ${selectedSdg.label}` : " · All SDGs"}
            <span> — click a bar to filter</span>
          </h4>
          <ApprovedTable rows={sdgRows} exportId="analytics-export-root" years={years} />
        </div>
      </Dialog>

      {/* ── Dialog: Field of IT ───────────────────────────── */}
      <Dialog
        open={foitDialog}
        onClose={() => setFoitDialog(false)}
        title={<span className="flex items-center gap-2"><FolderTree className="h-4 w-4 text-[#8B1A1A]" /> Field of Information Technology</span>}
        exportTarget="analytics-export-root-foit"
        size="xl"
      >
        <div id="analytics-export-root-foit">
          <p className="print-hide mb-3 text-sm text-gray-500">
            Targeted by Topics — click a bar to see the fully approved TAFs for that field.
          </p>

          {/* Printed copy only. */}
          <div className="export-only mb-4 hidden border-b border-gray-200 pb-3">
            <h1 className="text-lg font-bold text-[#333]">
              Field of Information Technology — Fully Approved TAFs
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              Fully approved Topic Abstract Forms grouped by Field of Information
              Technology. Generated {exportStamp} · College of Informatics and Computing Sciences, Batangas State University TNEU – JPLPC Malvar.
            </p>
          </div>
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

          <h4 className="print-hide mb-2 text-sm font-semibold text-[#333]">
            Fully Approved TAFs
            {selectedField ? ` · ${selectedField.field}` : " · All IT Fields"}
            <span> — click a bar to filter</span>
          </h4>
          <ApprovedTable rows={foitRows} exportId="analytics-export-root-foit" years={years} />
        </div>
      </Dialog>
    </div>
  );
}

// ── Small card wrapper ─────────────────────────────────────
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
  /** optional right-aligned "View all" style chip */
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

// ── KPI stat card ───────────────────────────────────────────
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

// ── Similarity row (highest/lowest) ─────────────────────────
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