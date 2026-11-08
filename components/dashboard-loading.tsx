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