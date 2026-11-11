// ============================================================
// /dashboard/department/[id]/admin-analytics — the department console's own
// overview. DEPARTMENT ONLY (it is not a grantable page).
//
// A SERVER page: the numbers are resolved before the first paint, and the range
// lives in the URL (?range=today|month|year|all) so a view is linkable and
// survives a refresh. No client fetch, no spinner.
//
// "Active users" is the one number that cannot come from a table policy: it
// reads auth.users.last_sign_in_at with the service-role client (see
// server/actions/admin-analytics.ts), which is why that action re-verifies the
// caller is a department account before creating an elevated client.
// ============================================================

import { redirect } from "next/navigation";
import {
  Activity,
  CheckCircle2,
  Clock,
  FileText,
  GraduationCap,
  RotateCcw,
  Users,
} from "lucide-react";

import { getCurrentUser } from "@/server/actions/auth";
import { getAdminAnalytics } from "@/server/actions/admin-analytics";
import AdminAnalyticsDateFilter from "@/components/admin-analytics-date-filter";
import {
  RANGE_LABELS,
  RANGE_ORDER,
  parseRange,
  parseCustomRange,
  rangeLabel,
  type AdminAnalyticsRange,
} from "@/lib/admin-analytics";
import { rolePath } from "@/lib/constants";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The three roles in the approval chain — shown together as one group. */
const EXEC_ROLE_KEYS: string[] = ["associate_dean", "dean", "vcrdes"];
const EXEC_ROLE_LABELS: Record<string, string> = {
  associate_dean: "Associate Dean",
  dean: "Dean",
  vcrdes: "VCRDES",
};

/**
 * Every timestamp on this page is shown in PHILIPPINE time (UTC+8), regardless
 * of the server's own timezone — Vercel runs in UTC, so a bare toLocaleString()
 * displayed sign-ins 8 hours behind what the office sees on their clock.
 */
const PH_TZ = "Asia/Manila";
function manilaTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${new Date(iso).toLocaleString("en-PH", {
    timeZone: PH_TZ,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })} PHT`;
}

function Metric({
  label,
  value,
  hint,
  icon,
  accent = "text-[#8B1A1A]",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={accent}>{icon}</span>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {label}
        </p>
      </div>
      <p className="mt-2 text-3xl font-bold text-[#333]">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function SmallStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <span className="text-gray-400">{icon}</span>
      <div>
        <p className="text-lg font-semibold leading-none text-[#333]">{value}</p>
        <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-400">
          {label}
        </p>
      </div>
    </div>
  );
}

export default async function AdminAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "department" || (id && user.id !== id)) {
    redirect(`${rolePath(user.role)}/${user.id}`);
  }

  const requested = parseRange(sp.range);
  const customRange = parseCustomRange(sp.from, sp.to);
  // A custom range without a valid span falls back to the preset default rather
  // than reporting zero for everything.
  const range: AdminAnalyticsRange =
    requested === "custom" && !customRange ? "month" : requested;
  const result = await getAdminAnalytics(range, customRange);

  const base = `${rolePath("department")}/${id}/admin-analytics`;
  const activeLabel = rangeLabel(range, customRange);

  return (
      <div className="w-auto px-4 py-6">
        {/* Header + range tabs */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#333] sm:text-2xl">
              Admin Analytics
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Accounts and TAF activity across the college.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
            {RANGE_ORDER.map((option) => (
              <a
                key={option}
                href={`${base}?range=${option}`}
                aria-current={range === option ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  range === option
                    ? "bg-[#8B1A1A] text-white"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {RANGE_LABELS[option]}
              </a>
            ))}
            <AdminAnalyticsDateFilter
              base={base}
              range={range}
              custom={customRange}
              label={activeLabel}
            />
          </div>
        </div>

        {!result.success ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {result.error}
          </div>
        ) : (
          (() => {
            const d = result.data;
            return (
              <div className="space-y-6">
                {/* Primary numbers */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric
                    label="Registered students"
                    value={d.users.students}
                    hint={`${d.users.total} accounts in total`}
                    icon={<GraduationCap className="h-4 w-4" />}
                  />
                  <Metric
                    label="Faculty & staff"
                    value={d.users.staff}
                    hint={d.users.byRole
                      .filter((r) => r.role !== "student")
                      .map((r) => `${r.count} ${r.label.replace(" Account", "")}`)
                      .join(" · ")}
                    icon={<Users className="h-4 w-4" />}
                    accent="text-indigo-600"
                  />
                  <Metric
                    label="Active users"
                    value={d.activity.activeLast24h}
                    hint={`signed in within 24h · ${d.activity.activeLast7d} in 7 days`}
                    icon={<Activity className="h-4 w-4" />}
                    accent="text-green-600"
                  />
                  <Metric
                    label={`TAFs submitted · ${RANGE_LABELS[d.range]}`}
                    value={d.tafs.submitted}
                    hint={
                      d.users.createdInRange > 0
                        ? `${d.users.createdInRange} account(s) created in this range`
                        : undefined
                    }
                    icon={<FileText className="h-4 w-4" />}
                    accent="text-amber-600"
                  />
                </div>

                {/* Secondary numbers */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <SmallStat
                    label="Awaiting approval"
                    value={d.tafs.pending}
                    icon={<Clock className="h-4 w-4" />}
                  />
                  <SmallStat
                    label="Fully approved"
                    value={d.tafs.approved}
                    icon={<CheckCircle2 className="h-4 w-4" />}
                  />
                  <SmallStat
                    label="Returned"
                    value={d.tafs.returned}
                    icon={<RotateCcw className="h-4 w-4" />}
                  />
                  <SmallStat
                    label="Avg days to approve"
                    value={d.tafs.avgDaysToApproval ?? "—"}
                    icon={<Clock className="h-4 w-4" />}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                  {/* Recently signed in */}
                  <div className="lg:col-span-3 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between border-b px-4 py-3">
                      <h2 className="text-sm font-semibold text-[#333]">
                        Recently signed in
                      </h2>
                      <span className="text-xs text-gray-400">
                        {d.activity.neverSignedIn} never signed in
                      </span>
                    </div>
                    {d.activity.recent.length === 0 ? (
                      <p className="px-4 py-10 text-center text-sm text-gray-400">
                        No sign-ins recorded yet.
                      </p>
                    ) : (
                      <ul className="divide-y divide-gray-100">
                        {d.activity.recent.map((u) => (
                          <li
                            key={u.id}
                            className="flex flex-wrap items-center gap-2 px-4 py-2.5"
                          >
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#333]">
                              {u.name}
                            </span>
                            <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                              {u.roleLabel.replace(" Account", "")}
                            </span>
                            <span className="w-40 text-right text-xs text-gray-400">
                              {manilaTime(u.lastSignInAt)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Accounts by role */}
                  <div className="lg:col-span-2 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <div className="border-b px-4 py-3">
                      <h2 className="text-sm font-semibold text-[#333]">
                        Accounts by role
                      </h2>
                    </div>
                    {/* Students / Advisers / Department stay as rows; the three
                        approval-chain roles are grouped under one heading as small
                        cards, because together they are "the executive
                        evaluators" and reading them as three separate rows made
                        the office hunt for them. */}
                    <ul className="divide-y divide-gray-100">
                      {d.users.byRole
                        .filter((r) => !EXEC_ROLE_KEYS.includes(r.role))
                        .map((r) => {
                          const pct =
                            d.users.total > 0
                              ? Math.round((r.count / d.users.total) * 100)
                              : 0;
                          return (
                            <li key={r.role} className="px-4 py-2.5">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">
                                  {r.label.replace(" Account", "")}
                                </span>
                                <span className="font-semibold text-[#333]">
                                  {r.count}
                                </span>
                              </div>
                              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                                <div
                                  className="h-full rounded-full bg-[#8B1A1A]/70"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </li>
                          );
                        })}
                    </ul>

                    <div className="border-t bg-gray-50/60 px-4 py-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        Executive Evaluators
                      </p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {EXEC_ROLE_KEYS.map((role) => {
                          const entry = d.users.byRole.find((r) => r.role === role);
                          return (
                            <div
                              key={role}
                              className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-center"
                            >
                              <p className="text-xs text-gray-500">
                                {entry?.label.replace(" Account", "") ??
                                  EXEC_ROLE_LABELS[role]}
                              </p>
                              <p className="mt-0.5 text-lg font-semibold text-[#333]">
                                {entry?.count ?? 0}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-gray-400">
                  Generated {manilaTime(d.generatedAt)} · showing {activeLabel}
                  {d.rangeStart && ` from ${manilaTime(d.rangeStart)}`}
                </p>
              </div>
            );
          })()
        )}
      </div>
  );
}
