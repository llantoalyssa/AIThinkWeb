"use client";

// ============================================================
// SidebarCollapseHandle — the little arrow on the RIGHT EDGE of the side nav.
//
// It sits vertically centred on the nav's inner edge and is revealed when the
// pointer is over the nav (the wrapper carries `group/sidebar`), so it never
// competes with the nav items for attention but is exactly where the eye goes
// when you want to widen or narrow the list.
//
// DESKTOP ONLY (`hidden md:flex`): phones have no persistent sidebar — they use
// the hamburger drawer — so a handle there would be a dead control. The header
// toggle stays for keyboard users, which is why this one is purely additive.
//
// The aria-label/aria-expanded pair is what makes it meaningful to a screen
// reader; without them it is an unlabelled circle.
// ============================================================

import { ChevronLeft, ChevronRight } from "lucide-react";

export default function SidebarCollapseHandle({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  const label = expanded ? "Collapse sidebar" : "Expand sidebar";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-expanded={expanded}
      title={label}
      className="absolute -right-3.5 top-1/2 z-20 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 opacity-0 shadow-md transition-all pointer-coarse:opacity-100 hover:border-[#8B1A1A]/40 hover:text-[#8B1A1A] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B1A1A]/30 group-hover/sidebar:opacity-100 md:flex"
    >
      {expanded ? (
        <ChevronLeft className="h-4 w-4" />
      ) : (
        <ChevronRight className="h-4 w-4" />
      )}
    </button>
  );
}
