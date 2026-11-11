"use client";

import { useState, useEffect } from "react";
import {
  getStudentTopicAbstracts,
  deleteTopicAbstract,
  deleteTopicAbstracts,
  type TopicAbstractForm,
} from "@/server/actions/topic-abstracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, FileText, Plus, Trash2, Clock, Send, CheckCircle, AlertCircle, Eye, X } from "lucide-react";
import { toast } from "sonner";
import ConfirmDeleteModal from "@/components/ui/confirm-delete-modal";
import { HIGH_SIMILARITY_THRESHOLD } from "@/lib/constants";

type Props = {
  onNewForm: () => void;
  onEditForm: (tafId: string, proposedTitle: string) => void;
  initialTafs?: TopicAbstractForm[];
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  analyzed: "Analyzed",
  submitted: "Submitted",
  under_review: "Under Review",
  approved: "Approved",
  revisions_needed: "Revisions Needed",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600 border-gray-300",
  analyzed: "bg-purple-50 text-purple-600 border-purple-300",
  submitted: "bg-blue-50 text-blue-600 border-blue-300",
  under_review: "bg-amber-50 text-amber-600 border-amber-300",
  approved: "bg-green-50 text-green-600 border-green-300",
  revisions_needed: "bg-red-50 text-red-600 border-red-300",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  draft: <Clock className="h-3.5 w-3.5" />,
  analyzed: <CheckCircle className="h-3.5 w-3.5" />,
  submitted: <Send className="h-3.5 w-3.5" />,
  under_review: <Eye className="h-3.5 w-3.5" />,
  approved: <CheckCircle className="h-3.5 w-3.5" />,
  revisions_needed: <AlertCircle className="h-3.5 w-3.5" />,
};

export default function TopicAbstractList({ onNewForm, onEditForm, initialTafs }: Props) {
  const [tafs, setTafs] = useState<TopicAbstractForm[]>(initialTafs ?? []);
  const [loading, setLoading] = useState(!initialTafs);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const deleteTarget = deleteTargetId
    ? tafs.find((t) => t.id === deleteTargetId)
    : null;
  useEffect(() => {
    if (initialTafs) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await getStudentTopicAbstracts();
      if (cancelled) return;
      if (result.success) {
        setTafs(result.data);
      } else {
        toast.error(result.error);
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [initialTafs]);
  function toggleSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  const selectableTafs = tafs.filter((t) => t.canDelete);
  const allSelected =
    selectableTafs.length > 0 && selectableTafs.every((t) => selectedIds.has(t.id));

  function toggleSelectAll() {
    if (allSelected) {
      clearSelection();
    } else {
      setSelectedIds(new Set(selectableTafs.map((t) => t.id)));
    }
  }
  function handleDeleteClick(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setDeleteTargetId(id);
  }

  async function handleDeleteConfirm() {
    if (!deleteTargetId) return;
    setDeletingId(deleteTargetId);
    const result = await deleteTopicAbstract(deleteTargetId);
    if (result.success) {
      toast.success("Draft deleted.");
      setTafs((prev) => prev.filter((t) => t.id !== deleteTargetId));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteTargetId);
        return next;
      });
    } else {
      toast.error(result.error);
    }
    setDeletingId(null);
    setDeleteTargetId(null);
  }

  function handleDeleteModalClose(open: boolean) {
    if (!open && deletingId !== deleteTargetId) {
      setDeleteTargetId(null);
    }
  }
  async function handleBulkDeleteConfirm() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    const result = await deleteTopicAbstracts(ids);
    setBulkDeleting(false);
    if (result.success) {
      toast.success(
        `${result.deleted} form${result.deleted !== 1 ? "s" : ""} deleted.`,
      );
      setTafs((prev) => prev.filter((t) => !selectedIds.has(t.id)));
      clearSelection();
    } else {
      toast.error(result.error);
    }
    setBulkConfirmOpen(false);
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getPreview(text: string, maxLen = 100): string {
    if (!text) return "";
    const stripped = text.replace(/<[^>]*>/g, "").replace(/\s+/g, " ");
    return stripped.length > maxLen ? stripped.slice(0, maxLen) + "…" : stripped;
  }
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#8B1A1A]" />
      </div>
    );
  }
  if (tafs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 mb-6">
          <FileText className="h-10 w-10 text-gray-400" />
        </div>
        <h2 className="text-xl font-semibold text-[#333] mb-2">No Topic Abstract Forms</h2>
        <p className="text-sm text-gray-500 max-w-md mb-6">
          You haven&apos;t created any Topic Abstract Forms yet. Click the button below to get started.
        </p>
        <Button
          onClick={onNewForm}
          className="bg-[#8B1A1A] hover:bg-[#a32020] text-white flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Create New Topic Abstract Form
        </Button>
      </div>
    );
  }
  return (
    <div>
      {}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#333]">My Topic Abstract Forms</h1>
          <p className="text-sm text-gray-500 mt-1">
            You have {tafs.length} Topic Abstract Form{tafs.length !== 1 ? "s" : ""}.
          </p>
        </div>
        <Button
          onClick={onNewForm}
          className="bg-[#8B1A1A] hover:bg-[#a32020] text-white flex items-center gap-2 shrink-0"
        >
          <Plus className="h-4 w-4" />
          New Form
        </Button>
      </div>

      {}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#8B1A1A]/20 bg-[#8B1A1A]/5 px-4 py-2.5">
          <span className="text-sm font-medium text-[#333]">
            {selectedIds.size} selected
          </span>
          <button
            type="button"
            onClick={toggleSelectAll}
            className="text-xs font-medium text-[#8B1A1A] hover:underline cursor-pointer"
          >
            {allSelected ? "Clear all" : "Select all deletable"}
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={clearSelection}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setBulkConfirmOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete selected ({selectedIds.size})
          </button>
        </div>
      )}

      {}
      {selectableTafs.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <input
            id="select-all-tafs"
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            className="h-4 w-4 rounded border-gray-300 text-[#8B1A1A] focus:ring-[#8B1A1A]/30 cursor-pointer"
          />
          <label htmlFor="select-all-tafs" className="text-xs text-gray-500 cursor-pointer">
            Select all deletable forms ({selectableTafs.length})
          </label>
        </div>
      )}

      {}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tafs.map((taf) => {
          const isSelected = selectedIds.has(taf.id);
          return (
            <Card
              key={taf.id}
              className={`relative cursor-pointer hover:shadow-md transition-all border-l-4 flex flex-col ${
                isSelected
                  ? "border-l-red-500 ring-1 ring-red-300"
                  : "border-l-[#8B1A1A]"
              }`}
              onClick={() => onEditForm(taf.id, taf.proposedTitle)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  {}
                  {taf.canDelete ? (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onClick={(e) => toggleSelect(taf.id, e)}
                      onChange={() => {}}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-red-600 focus:ring-red-500/30 cursor-pointer"
                      aria-label={`Select ${taf.proposedTitle || "Untitled"}`}
                      title="Select for bulk delete"
                    />
                  ) : (
                    <span className="mt-1 h-4 w-4 shrink-0" aria-hidden />
                  )}
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base font-semibold text-[#333] line-clamp-2">
                      {taf.proposedTitle || "Untitled"}
                    </CardTitle>
                    <CardDescription className="text-xs flex items-center gap-1 mt-1">
                      <Clock className="h-3 w-3" />
                      Updated {formatDate(taf.updatedAt)}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 flex-1 flex flex-col gap-3">
                {}
                {taf.background && (
                  <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed">
                    {getPreview(taf.background, 120)}
                  </p>
                )}

                {

}
                <div className="mt-auto pt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${
                        STATUS_COLORS[taf.status] || STATUS_COLORS.draft
                      }`}
                    >
                      {STATUS_ICONS[taf.status]}
                      {STATUS_LABELS[taf.status] || taf.status}
                    </span>
                    {taf.latestScore !== null && taf.latestScore !== undefined && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${
                          taf.latestScore >= HIGH_SIMILARITY_THRESHOLD
                            ? "bg-red-50 text-red-700 border-red-200"
                            : "bg-green-50 text-green-700 border-green-200"
                        }`}
                        title="Latest similarity score"
                      >
                        {taf.latestScore.toFixed(1)}%
                      </span>
                    )}
                  </div>
                  {taf.canDelete ? (
                    <button
                      onClick={(e) => handleDeleteClick(taf.id, e)}
                      disabled={deletingId === taf.id}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50"
                      title="Delete this form"
                      aria-label="Delete TAF"
                    >
                      {deletingId === taf.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Delete
                    </button>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-300 cursor-not-allowed"
                      title="This form has been submitted and cannot be deleted."
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Locked
                    </span>
                  )}
                </div>
                {}
                {taf.submittedAt &&
                  ["submitted", "under_review", "approved", "revisions_needed"].includes(
                    taf.status,
                  ) && (
                    <p className="text-[10px] text-gray-400 -mt-1">
                      Submitted {new Date(taf.submittedAt).toLocaleDateString()}
                    </p>
                  )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {}
      <ConfirmDeleteModal
        open={deleteTargetId !== null}
        onOpenChange={handleDeleteModalClose}
        onConfirm={handleDeleteConfirm}
        itemName={deleteTarget?.proposedTitle || "Untitled"}
        loading={deletingId !== null}
        title="Delete Topic Abstract"
        description="Are you sure you want to delete this TAF? This action cannot be undone."
      />

      {}
      <ConfirmDeleteModal
        open={bulkConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !bulkDeleting) setBulkConfirmOpen(false);
        }}
        onConfirm={handleBulkDeleteConfirm}
        loading={bulkDeleting}
        confirmLabel={`Delete ${selectedIds.size}`}
        title="Delete Selected Topic Abstracts"
        description={`Are you sure you want to delete ${selectedIds.size} form${selectedIds.size !== 1 ? "s" : ""}? This action cannot be undone.`}
      />
    </div>
  );
}