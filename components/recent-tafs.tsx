"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getUserRecentTAFs,
  togglePinRecentTAF,
  removeRecentTAF,
  type RecentTAFEntry,
} from "@/server/actions/recents";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import ConfirmDeleteModal from "@/components/ui/confirm-delete-modal";
import {
  Pin,
  PinOff,
  Trash2,
  Edit3,
  ExternalLink,
  MoreHorizontal,
  Clock,
  FileText,
  Loader2,
} from "lucide-react";

type Props = {
  userId: string;

  activeTafId?: string;

  onDeleted?: () => void;
  initialEntries?: RecentTAFEntry[];
};

export default function RecentTafs({ userId, activeTafId, onDeleted, initialEntries }: Props) {
  const router = useRouter();
  const [entries, setEntries] = useState<RecentTAFEntry[]>(initialEntries ?? []);
  const [loading, setLoading] = useState(!initialEntries);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (initialEntries) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await getUserRecentTAFs();
      if (cancelled) return;
      if (result.success) {
        setEntries(result.data);
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [initialEntries]);

  async function refresh() {
    setLoading(true);
    const result = await getUserRecentTAFs();
    if (result.success) {
      setEntries(result.data);
    }
    setLoading(false);
  }

  function navigate(entry: RecentTAFEntry) {
    const slug = entry.proposedTitle
      ? entry.proposedTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
      : "untitled";
    router.push(`/dashboard/student/${userId}/taf/${entry.tafId}/${slug}`);
  }

  async function handleTogglePin(id: string) {
    await togglePinRecentTAF(id);
    refresh();
  }

  async function handleRemove(id: string) {
    await removeRecentTAF(id);
    refresh();
  }

  function handleDeleteClick(id: string) {
    setDeleteTargetId(id);
  }

  async function handleDeleteConfirm() {
    if (!deleteTargetId) return;
    setDeletingId(deleteTargetId);

    const { deleteTopicAbstract } = await import("@/server/actions/topic-abstracts");
    const result = await deleteTopicAbstract(deleteTargetId);
    if (result.success) {
      await removeRecentTAF(deleteTargetId);
      refresh();
      if (onDeleted) onDeleted();
    }
    setDeletingId(null);
    setDeleteTargetId(null);
  }

  const deleteTarget = entries.find((e) => e.id === deleteTargetId);

  if (loading) {
    return (
      <div className="px-2 pt-4">
        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-2 px-1">
          Recents
        </p>
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="px-2 pt-4">
        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-2 px-1">
          Recents
        </p>
        <p className="text-xs text-gray-400 px-1 italic">
          No recent TAFs
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-2 pt-4">
      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-2 px-1 shrink-0">
        Recents
      </p>
      {

}
      <div className="min-h-0 flex-1 overflow-y-auto space-y-0.5 scrollbar-thin">
        {entries.map((entry) => {
          const isActive = activeTafId === entry.tafId;
          const isDraft = entry.status === "draft";

          return (
            <div
              key={entry.id}
              className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs cursor-pointer transition-colors ${
                isActive
                  ? "bg-[#8B1A1A]/10 text-[#8B1A1A]"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
              onClick={() => navigate(entry)}
              title={entry.proposedTitle || "Untitled"}
            >
              {}
              {entry.pinned ? (
                <Pin className="h-3 w-3 shrink-0 text-amber-500" />
              ) : (
                <FileText className="h-3 w-3 shrink-0 text-gray-400" />
              )}

              {}
              <span className="flex-1 truncate leading-tight">
                {entry.proposedTitle || "Untitled"}
              </span>

              {}
              <span
                className={`shrink-0 h-1.5 w-1.5 rounded-full ${
                  entry.status === "draft"
                    ? "bg-gray-300"
                    : entry.status === "submitted"
                    ? "bg-blue-400"
                    : entry.status === "approved"
                    ? "bg-green-400"
                    : entry.status === "revisions_needed"
                    ? "bg-red-400"
                    : "bg-amber-400"
                }`}
              />

              {}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 rounded p-1.5 hover:bg-gray-200 transition-colors"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5 text-gray-500" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  side="right"
                  className="min-w-[140px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <DropdownMenuItem onClick={() => navigate(entry)}>
                    <ExternalLink className="mr-2 h-3.5 w-3.5" />
                    Open
                  </DropdownMenuItem>

                  <DropdownMenuItem onClick={() => handleTogglePin(entry.tafId)}>
                    {entry.pinned ? (
                      <PinOff className="mr-2 h-3.5 w-3.5" />
                    ) : (
                      <Pin className="mr-2 h-3.5 w-3.5" />
                    )}
                    {entry.pinned ? "Unpin" : "Pin"}
                  </DropdownMenuItem>

                  {isDraft && (
                    <DropdownMenuItem onClick={() => navigate(entry)}>
                      <Edit3 className="mr-2 h-3.5 w-3.5" />
                      Edit
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onClick={() => handleRemove(entry.tafId)}
                    className="text-gray-500"
                  >
                    <Clock className="mr-2 h-3.5 w-3.5" />
                    Remove from Recents
                  </DropdownMenuItem>

                  {isDraft && (
                    <DropdownMenuItem
                      onClick={() => handleDeleteClick(entry.id)}
                      className="text-red-600 focus:text-red-600"
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
      </div>

      {}
      <ConfirmDeleteModal
        open={deleteTargetId !== null}
        onOpenChange={(open) => {
          if (!open && deletingId !== deleteTargetId) {
            setDeleteTargetId(null);
          }
        }}
        onConfirm={handleDeleteConfirm}
        itemName={deleteTarget?.proposedTitle || "Untitled"}
        loading={deletingId !== null}
        title="Delete Topic Abstract"
        description="Are you sure you want to delete this draft? This action cannot be undone."
      />
    </div>
  );
}