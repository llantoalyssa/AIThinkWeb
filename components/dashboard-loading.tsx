// ============================================================
// Navigation loading state — ONE spinner for every role dashboard.
//
// The app already uses exactly this spinner (Loader2, maroon) for the department
// dashboard's first paint and for its data loads; the sidebar skeleton that was
// tried here first was a SECOND loading language for the same wait. This is the
// uniform one.
//
// Rendered by each role's loading.tsx, so a sidebar click paints it immediately
// instead of leaving the previous page frozen until the server responds.
// ============================================================

import { Loader2 } from "lucide-react";

export default function DashboardLoading() {
  return (
    <div
      className="flex min-h-[60vh] w-full items-center justify-center"
      aria-busy="true"
      aria-live="polite"
    >
      <Loader2 className="h-8 w-8 animate-spin text-[#8B1A1A]" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
