"use client";
import { BarChart3, Inbox, CheckCircle2, ClipboardList } from "lucide-react";

export type ApproverTab =
  | "analytics"
  | "pending"
  | "approved"
  | "executive-summary";

export type ApproverNavItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  tab: ApproverTab;
};

export const APPROVER_NAV: ApproverNavItem[] = [
  {
    id: "analytics",
    label: "Research Analytics",
    icon: <BarChart3 className="h-4 w-4" />,
    tab: "analytics",
  },
  {
    id: "pending",
    label: "TAF Submissions",
    icon: <Inbox className="h-4 w-4" />,
    tab: "pending",
  },
  {
    id: "approved",
    label: "Approved TAF",
    icon: <CheckCircle2 className="h-4 w-4" />,
    tab: "approved",
  },
];
export const EXECUTIVE_SUMMARY_NAV_ITEM: ApproverNavItem = {
  id: "executive-summary",
  label: "Executive Summary",
  icon: <ClipboardList className="h-4 w-4" />,
  tab: "executive-summary",
};

export const APPROVER_NAV_WITH_EXECUTIVE_SUMMARY: ApproverNavItem[] = [
  EXECUTIVE_SUMMARY_NAV_ITEM,
  ...APPROVER_NAV,
];

type Props = {

  activeTab: ApproverTab;

  expanded: boolean;

  pendingCount?: number;

  items?: ApproverNavItem[];

  onSelect: (tab: ApproverTab) => void;
};

export default function ApproverSidebar({
  activeTab,
  expanded,
  pendingCount = 0,
  items = APPROVER_NAV,
  onSelect,
}: Props) {
  return (
    <aside
      className={`hidden md:flex flex-col border-r bg-white transition-all duration-200 self-start sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto ${
        expanded ? "w-56" : "w-16"
      } shrink-0`}
    >
      <nav className="flex flex-col gap-1 p-2 pt-4">
        {items.map((item) => {
          const badge =
            item.id === "pending" && pendingCount > 0 ? pendingCount : 0;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.tab)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                activeTab === item.tab
                  ? "bg-[#8B1A1A]/10 text-[#8B1A1A] font-medium"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              } ${expanded ? "" : "justify-center"} cursor-pointer`}
              title={item.label}
            >
              {item.icon}
              {expanded && (
                <span className="flex-1 text-left truncate">{item.label}</span>
              )}
              {expanded && badge > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#8B1A1A] text-[10px] font-bold text-white">
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}