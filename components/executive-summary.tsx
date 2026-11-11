"use client";
import { useEffect, useRef, useState } from "react";
import {
  getExecutiveSummary,
  type AcademicYearSummary,
  type ExecutiveSummaryData,
  type MonthPoint,
} from "@/server/actions/executive-summary";
import {
  Loader2,
  TrendingUp,
  CalendarDays,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  AlertCircle,
} from "lucide-react";

const LINE_COLORS = { this: "#8B1A1A", last: "#4f46e5" };

export default function ExecutiveSummary({
  initialData,
}: {
  initialData?: ExecutiveSummaryData | null;
} = {}) {
  const [data, setData] = useState<
    {
      totalSubmissions: number;
      pendingSubmissions: number;
      academicYears: AcademicYearSummary[];
    } | null
  >(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [err, setErr] = useState<string | null>(null);

  const [selectedLabel, setSelectedLabel] = useState<string>(() => {
    const years = initialData?.academicYears ?? [];
    return years.length ? years[years.length - 1].label : "";
  });
  const chartRef = useRef<HTMLDivElement>(null);
  const [printing, setPrinting] = useState(false);
  const hasInitialData = useRef(!!initialData);

  useEffect(() => {
    if (hasInitialData.current) return;
    let cancelled = false;
    async function load() {
      const res = await getExecutiveSummary();
      if (cancelled) return;
      if (res.success) {
        setData(res.data);

        if (res.data.academicYears.length) {
          setSelectedLabel(
            res.data.academicYears[res.data.academicYears.length - 1].label,
          );
        }
      } else {
        setErr(res.error);
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white py-16">
        <Loader2 className="h-8 w-8 animate-spin text-[#8B1A1A]" />
        <p className="mt-2 text-sm text-gray-400">Loading executive summary…</p>
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600">
        {err || "Failed to load executive summary."}
      </div>
    );
  }

  const thisYear =
    data.academicYears.find((y) => y.label === selectedLabel) ||
    data.academicYears[data.academicYears.length - 1];
  if (!thisYear) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-400">
        No TAF submission data yet. Submissions will appear here once students
        submit TAFs through their advisory groups.
      </div>
    );
  }

  const lastYear =
    data.academicYears.find((y) => y.startYear === thisYear.startYear - 1) ||
    null;

  function exportPdf() {
    if (printing) return;
    const target = chartRef.current;
    if (!target) return;
    const style = document.createElement("style");
    style.id = "exec-summ-print-style";
    style.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        #exec-summ-export, #exec-summ-export * { visibility: visible !important; }
        #exec-summ-export {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
          max-width: 100% !important;
        }
      }`;
    document.head.appendChild(style);
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.getElementById("exec-summ-print-style")?.remove();
        setPrinting(false);
      }, 400);
    }, 50);
  }

  return (
    <div>
      {}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#333] flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-[#8B1A1A]" />
            Executive Summary
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            TAF submission trends by academic year.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            <select
              value={selectedLabel}
              onChange={(e) => setSelectedLabel(e.target.value)}
              className="appearance-none rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-8 text-xs font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30 cursor-pointer"
            >
              {data.academicYears.map((y) => (
                <option key={y.label} value={y.label}>
                  {y.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={exportPdf}
            disabled={printing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            {printing ? "Preparing…" : "Export PDF"}
          </button>
        </div>
      </div>

      {}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white bg-[#8B1A1A]">
              <FileText className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[11px] uppercase tracking-wide text-gray-400">
                Pending TAF Submissions
              </p>
              <p className="text-2xl font-bold text-[#333] leading-tight">
                {data.pendingSubmissions}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white bg-indigo-500">
              <ArrowUpRight className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[11px] uppercase tracking-wide text-gray-400">
                {thisYear.label} Total
              </p>
              <p className="text-2xl font-bold text-[#333] leading-tight">
                {thisYear.total}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white bg-amber-500">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[11px] uppercase tracking-wide text-gray-400">
                {lastYear ? `${lastYear.label} Total` : "Last Year"}
              </p>
              <p className="text-2xl font-bold text-[#333] leading-tight">
                {lastYear ? lastYear.total : 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {}
      <div ref={chartRef} id="exec-summ-export" className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[#333]">TAF Submissions over time</h3>
            <p className="text-xs text-gray-500 mt-0.5">Monthly submissions · {thisYear.label}</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium text-gray-600">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: LINE_COLORS.this }} />
              This Academic Year ({thisYear.label})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: LINE_COLORS.last }} />
              Last Academic Year ({lastYear ? lastYear.label : "—"})
            </span>
          </div>
        </div>

        {lastYear ? (
          <LineChart thisYear={thisYear} lastYear={lastYear} />
        ) : (
          <LineChart thisYear={thisYear} lastYear={null} />
        )}

        {}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PeakTrough
            title={thisYear.label}
            peak={thisYear.peak}
            trough={thisYear.trough}
          />
          <PeakTrough
            title={lastYear ? lastYear.label : "Last Academic Year"}
            peak={lastYear ? lastYear.peak : null}
            trough={lastYear ? lastYear.trough : null}
          />
        </div>

        {!lastYear && (
          <p className="mt-3 text-xs text-gray-400 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" />
            No data for the previous academic year yet — a comparison line will
            appear once that year has submissions.
          </p>
        )}
      </div>
    </div>
  );
}
function PeakTrough({
  title,
  peak,
  trough,
}: {
  title: string;
  peak: MonthPoint | null;
  trough: MonthPoint | null;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        {title}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <ArrowUpRight className="h-4 w-4 text-green-600" />
          <div>
            <p className="text-[11px] text-gray-500">Peak Month</p>
            <p className="text-sm font-bold text-[#333]">
              {peak ? `${peak.label} (${peak.count})` : "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ArrowDownRight className="h-4 w-4 text-red-500" />
          <div>
            <p className="text-[11px] text-gray-500">Trough Month</p>
            <p className="text-sm font-bold text-[#333]">
              {trough ? `${trough.label} (${trough.count})` : "—"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
function LineChart({
  thisYear,
  lastYear,
}: {
  thisYear: AcademicYearSummary;
  lastYear: AcademicYearSummary | null;
}) {
  const W = 1000;
  const H = 260;
  const PAD = { l: 36, r: 14, t: 16, b: 30 };

  const months = ["Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"];
  const maxCount = Math.max(
    1,
    ...thisYear.months.map((m) => m.count),
    ...(lastYear ? lastYear.months.map((m) => m.count) : [0]),
  );
  const yTicks = 4;
  const stepY = maxCount / yTicks;
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const xStep = innerW / 11;

  const x = (i: number) => PAD.l + i * xStep;
  const y = (count: number) => PAD.t + innerH - (count / maxCount) * innerH;

  function pathFor(year: AcademicYearSummary): string {
    return year.months
      .map((m, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(m.count)}`)
      .join(" ");
  }
  function areaPathFor(year: AcademicYearSummary): string {
    const pts = year.months
      .map((m, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(m.count)}`)
      .join(" ");
    return `${pts} L${x(year.months.length - 1)},${PAD.t + innerH} L${x(0)},${PAD.t + innerH} Z`;
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" role="img" aria-label="TAF submissions over time">
      {}
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const value = Math.round(stepY * i);
        const yy = y(value);
        return (
          <g key={i}>
            <line x1={PAD.l} y1={yy} x2={W - PAD.r} y2={yy} stroke="#e5e7eb" strokeWidth={1} />
            <text x={PAD.l - 6} y={yy + 4} textAnchor="end" fontSize={10} fill="#9ca3af">
              {value}
            </text>
          </g>
        );
      })}

      {}
      {thisYear.months.map((m, i) => (
        <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="#9ca3af">
          {m.label}
        </text>
      ))}

      {}
      {lastYear && (
        <>
          <path d={areaPathFor(lastYear)} fill="#4f46e5" fillOpacity={0.08} />
          <path d={pathFor(lastYear)} fill="none" stroke={LINE_COLORS.last} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        </>
      )}

      {}
      <path d={areaPathFor(thisYear)} fill="#8B1A1A" fillOpacity={0.1} />
      <path d={pathFor(thisYear)} fill="none" stroke={LINE_COLORS.this} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

      {}
      {thisYear.months.map((m, i) => (
        <circle
          key={`t-${i}`}
          cx={x(i)}
          cy={y(m.count)}
          r={m.count > 0 ? 5.5 : 0}
          fill="#8B1A1A"
        />
      ))}
      {lastYear &&
        lastYear.months.map((m, i) => (
          <circle
            key={`l-${i}`}
            cx={x(i)}
            cy={y(m.count)}
            r={m.count > 0 ? 4.5 : 0}
            fill="#4f46e5"
          />
        ))}

      {
}
      {thisYear.months.map((m, i) => {
        const lastMonth = lastYear?.months[i];
        const left = Math.max(PAD.l, x(i) - xStep / 2);
        const right = Math.min(W - PAD.r, x(i) + xStep / 2);
        const tip =
          lastMonth && lastYear
            ? `${m.label} — ${thisYear.label}: ${m.count} · ${lastYear.label}: ${lastMonth.count}`
            : `${thisYear.label} · ${m.label}: ${m.count} submission${m.count === 1 ? "" : "s"}`;
        return (
          <rect
            key={`hit-${i}`}
            x={left}
            y={PAD.t}
            width={Math.max(1, right - left)}
            height={innerH}
            fill="transparent"
          >
            <title>{tip}</title>
          </rect>
        );
      })}
    </svg>
  );
}