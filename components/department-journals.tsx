"use client";

import { useState, useEffect } from "react";
import {
  getAllJournals,
  saveJournal,
  updateJournal,
  deleteJournal,
  logJournalExtractCost,
  extractPdfText,
  reembedJournals,
  type Journal,
} from "@/server/actions/journals";
import { extractJournalMetadata } from "@/server/analysis/extract-metadata";
import { ocrPdfFile, shouldOcr } from "@/lib/pdf-ocr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  BookOpen,
  Loader2,
  Trash2,
  FileText,
  Upload,
  X,
  Eye,
  RefreshCw,
  Search,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import ConfirmDeleteModal from "@/components/ui/confirm-delete-modal";
type FileEntry = {
  id: string;
  file: File;
  status: "pending" | "uploading" | "extracting" | "ocr" | "ai_extracting" | "ready" | "error";

  fileUrl?: string;

  extractedText?: string;

  title?: string;

  authors?: string;

  year?: string;

  error?: string;
};

const MAX_FILES = 5;

export default function DepartmentJournals({
  initialJournals,
}: {
  initialJournals?: Journal[];
} = {}) {
  const [journals, setJournals] = useState<Journal[]>(initialJournals ?? []);
  const [loading, setLoading] = useState(!initialJournals);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [year, setYear] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [reembedding, setReembedding] = useState(false);

  async function handleReembed() {
    if (reembedding) return;
    setReembedding(true);
    const result = await reembedJournals();
    setReembedding(false);
    if (result.success) {
      toast.success(
        `Re-embedded ${result.data.reembedded} journal(s)${
          result.data.skipped > 0 ? ` (${result.data.skipped} skipped)` : ""
        } from their academic core.`,
      );
    } else {
      toast.error(result.error);
    }
  }
  const [viewingJournal, setViewingJournal] = useState<Journal | null>(null);
  const [editingJournal, setEditingJournal] = useState<Journal | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAuthors, setEditAuthors] = useState("");
  const [editYear, setEditYear] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function openEdit(journal: Journal) {
    setEditingJournal(journal);
    setEditTitle(journal.title || "");
    setEditAuthors(journal.authors || "");
    setEditYear(journal.year || "");
    setEditError(null);
  }

  function closeEdit() {
    setEditingJournal(null);
    setEditError(null);
  }

  async function handleSaveEdit() {
    if (!editingJournal) return;
    setSavingEdit(true);
    setEditError(null);
    const result = await updateJournal(editingJournal.id, {
      title: editTitle,
      authors: editAuthors,
      year: editYear,
    });
    setSavingEdit(false);
    if (result.success) {
      toast.success("Journal updated");
      setJournals((prev) =>
        prev.map((j) => (j.id === result.data.id ? result.data : j))
      );
      closeEdit();
    } else {
      setEditError(result.error || "Failed to update journal.");
    }
  }
  useEffect(() => {
    let cancelled = false;
    const supplied = initialJournals !== undefined;

    async function load() {
      if (!supplied) {
        setLoading(true);
        setError(null);
      }
      const result = await getAllJournals();
      if (cancelled) return;
      if (result.success) {
        setJournals(result.data);
        setError(null);
      } else if (!supplied) {
        setError(result.error);
      }
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [initialJournals]);
  function handleFilesSelected(fileList: FileList | null) {
    setUploadError(null);
    if (!fileList) return;

    const newFiles: FileEntry[] = Array.from(fileList)
      .filter((f) => f.type === "application/pdf" || f.name.endsWith(".pdf"))
      .slice(0, MAX_FILES - files.length)
      .map((file) => ({
        id: crypto.randomUUID(),
        file,
        status: "pending" as const,
      }));

    if (newFiles.length + files.length < fileList.length) {
      setUploadError(
        `Only ${MAX_FILES} PDF files allowed (${files.length} already selected).`
      );
    }

    setFiles([...files, ...newFiles]);
  }

  function removeFile(id: string) {
    setFiles(files.filter((f) => f.id !== id));
  }

  function updateFileTitle(id: string, title: string) {
    setFiles(files.map((f) => (f.id === id ? { ...f, title } : f)));
  }

  function updateFileAuthors(id: string, authors: string) {
    setFiles(files.map((f) => (f.id === id ? { ...f, authors } : f)));
  }

  function updateFileYear(id: string, value: string) {
    setFiles(files.map((f) => (f.id === id ? { ...f, year: value } : f)));
  }
  async function handleStartProcessing() {
    setUploadError(null);
    setProcessing(true);

    const supabase = await import("@/server/supabase/client").then((m) =>
      m.createClient()
    );
    for (const entry of files.filter((f) => f.status === "pending")) {
      try {
        updateStatus(entry.id, "uploading");
        const sanitized = entry.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const ext = sanitized.toLowerCase().endsWith(".pdf") ? ".pdf" : "";
        const base = ext ? sanitized.slice(0, sanitized.length - 4) : sanitized;
        const shortBase = (base || "journal").slice(0, 60);
        const fileName = `${Date.now()}-${shortBase}${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("journals")
          .upload(fileName, entry.file, { cacheControl: "3600", upsert: false });

        if (uploadErr) throw new Error("Upload failed: " + uploadErr.message);

        const { data: urlData } = supabase.storage
          .from("journals")
          .getPublicUrl(fileName);

        const fileUrl = urlData?.publicUrl || "";
        updateField(entry.id, "fileUrl", fileUrl);
        updateStatus(entry.id, "extracting");
        let extractedText = await extractPdfText(fileUrl);
        if (shouldOcr(extractedText)) {
          updateStatus(entry.id, "ocr");
          try {
            const ocrText = await ocrPdfFile(entry.file);
            if (ocrText && ocrText.trim().length > extractedText.trim().length) {
              extractedText = ocrText;
            }
          } catch (ocrErr) {
            console.warn("[journal-upload] OCR fallback failed:", ocrErr);
          }
        }
        updateField(entry.id, "extractedText", extractedText);
        if (extractedText.trim().length > 50) {
          updateStatus(entry.id, "ai_extracting");
          const aiResult = await extractJournalMetadata(extractedText);

          if (aiResult.success) {
            updateField(entry.id, "title", aiResult.data.title);
            updateField(entry.id, "authors", aiResult.data.authors.join(", "));
            if (aiResult.data.usage) {
              logJournalExtractCost({
                promptTokens: aiResult.data.usage.promptTokens,
                completionTokens: aiResult.data.usage.completionTokens,
                totalTokens: aiResult.data.usage.totalTokens,
                journalTitle: aiResult.data.title || entry.title,
              });
            }
          } else {

            const fallback = entry.file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
            updateField(entry.id, "title", fallback);
            updateField(entry.id, "authors", "");
          }
        } else {

          const fallback = entry.file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
          updateField(entry.id, "title", fallback);
          updateField(entry.id, "authors", "");
        }

        updateStatus(entry.id, "ready");
      } catch (err: unknown) {
        console.error("Processing error:", err);
        const message = err instanceof Error ? err.message : "Processing failed";
        updateField(entry.id, "error", message);
        updateStatus(entry.id, "error");
      }
    }

    setProcessing(false);
  }

  function updateStatus(id: string, status: FileEntry["status"]) {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, status } : f)));
  }

  function updateField<K extends keyof FileEntry>(id: string, key: K, value: FileEntry[K]) {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, [key]: value } : f)));
  }
  async function handleSaveAll() {
    const readyFiles = files.filter(
      (f) => f.status === "ready" && f.fileUrl && f.title
    );

    if (readyFiles.length === 0) {
      setUploadError("No files ready to save.");
      return;
    }

    setProcessing(true);
    setUploadError(null);

    const saved: Journal[] = [];
    let failedCount = 0;

    for (const entry of readyFiles) {
      const result = await saveJournal({
        title: entry.title!,
        authors: (entry.authors || "")
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean)
          .join(", "),
        year: entry.year || year || "",
        fileUrl: entry.fileUrl!,
        extractedText: entry.extractedText || "",
      });

      if (result.success) {
        saved.push(result.data);
      } else {
        failedCount++;
      }
    }

    if (saved.length > 0) {
      toast.success(`${saved.length} journal${saved.length !== 1 ? "s" : ""} saved`, {
        description: failedCount > 0 ? `${failedCount} failed to save.` : undefined,
      });
      setJournals([...saved, ...journals]);
    }

    setProcessing(false);
    setUploadOpen(false);
    resetForm();
  }

  function resetForm() {
    setFiles([]);
    setYear("");
    setUploadError(null);
    setProcessing(false);
  }
  function openDeleteConfirm(journalId: string) {
    setDeleteTargetId(journalId);
  }

  async function handleDelete(journalId: string) {
    setDeletingId(journalId);
    const result = await deleteJournal(journalId);
    if (result.success) {
      toast.success("Journal deleted");
      setJournals(journals.filter((j) => j.id !== journalId));
      setDeleteTargetId(null);
    } else {
      toast.error(result.error || "Failed to delete journal.");
    }
    setDeletingId(null);
  }

  const deleteTarget = deleteTargetId
    ? journals.find((j) => j.id === deleteTargetId)
    : null;
  const readyCount = files.filter((f) => f.status === "ready").length;
  const pendingCount = files.filter((f) => f.status === "pending").length;
  const errorCount = files.filter((f) => f.status === "error").length;
  const filteredJournals = journals.filter((j) => {
    const q = filterText.toLowerCase().trim();
    const matchesText =
      !q ||
      (j.title || "").toLowerCase().includes(q) ||
      (j.authors || "").toLowerCase().includes(q);
    const matchesYear =
      !filterYear.trim() || (j.year || "").trim() === filterYear.trim();
    return matchesText && matchesYear;
  });
  return (
    <>
      {}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#333]">
            Journals
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Upload and manage research journals for similarity comparison with
            student TAFs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleReembed}
            disabled={reembedding}
            variant="outline"
            title="Recompute embeddings from each journal's academic core (title + abstract). Run once after the embedding-core migration."
          >
            {reembedding ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {reembedding ? "Re-embedding…" : "Re-embed Journals"}
          </Button>
          <Button
            onClick={() => {
              resetForm();
              setUploadOpen(true);
            }}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload Journals
          </Button>
        </div>
      </div>

      {}
      <Dialog
        open={uploadOpen}
        onOpenChange={(open) => {
          if (!open && !processing) resetForm();
          setUploadOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-[#8B1A1A]" />
              Upload Journals
            </DialogTitle>
            <DialogDescription>
              Select up to {MAX_FILES} PDF files. The system will extract text
              and use AI to capture the title and authors. You can review and
              edit before saving.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {uploadError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {uploadError}
              </div>
            )}

            {}
            <div className="space-y-2">
              <Label htmlFor="journal-files">
                PDF Files ({files.length}/{MAX_FILES})
              </Label>
              <Input
                id="journal-files"
                type="file"
                accept=".pdf,application/pdf"
                multiple
                onChange={(e) => handleFilesSelected(e.target.files)}
                disabled={processing || files.length >= MAX_FILES}
                className="file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-[#8B1A1A]/10 file:text-[#8B1A1A] file:text-sm file:font-medium hover:file:bg-[#8B1A1A]/20 cursor-pointer"
              />
            </div>

            {}
            {files.length > 0 && (
              <div className="w-40">
                <Label htmlFor="global-year">Publication Year</Label>
                <Input
                  id="global-year"
                  placeholder="e.g., 2024"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  disabled={processing}
                  maxLength={4}
                />
              </div>
            )}

            {}
            {pendingCount > 0 && !processing && (
              <Button
                onClick={handleStartProcessing}
                className="bg-[#8B1A1A] hover:bg-[#a32020] text-white w-full"
                disabled={pendingCount === 0}
              >
                <Upload className="h-4 w-4 mr-2" />
                Start Processing ({pendingCount} file{pendingCount !== 1 ? "s" : ""})
              </Button>
            )}

            {processing && (
              <div className="flex items-center gap-2 text-sm text-[#8B1A1A] font-medium">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing files...
              </div>
            )}

            {}
            {files.length > 0 && (
              <div className="space-y-3 pt-2">
                <Label>Files ({files.length})</Label>
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {files.map((entry) => (
                    <FilePreviewCard
                      key={entry.id}
                      entry={entry}
                      year={year}
                      onRemove={() => removeFile(entry.id)}
                      onTitleChange={(t) => updateFileTitle(entry.id, t)}
                      onAuthorsChange={(a) => updateFileAuthors(entry.id, a)}
                      onYearChange={(y) => updateFileYear(entry.id, y)}
                      disabled={processing}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-4">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={processing}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={handleSaveAll}
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={processing || readyCount === 0}
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Save {readyCount} Journal{readyCount !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {}
      <Dialog
        open={!!viewingJournal}
        onOpenChange={(open) => {
          if (!open) setViewingJournal(null);
        }}
      >
        <DialogContent className="sm:max-w-[95vw] lg:max-w-7xl max-h-[95vh] flex flex-col p-0 gap-0 overflow-hidden">
          {viewingJournal && (
            <>
              <DialogHeader className="px-6 py-4 border-b shrink-0">
                <DialogTitle className="text-base text-[#333] pr-8 line-clamp-1">
                  {viewingJournal.title}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {[viewingJournal.authors, viewingJournal.year]
                    .filter(Boolean)
                    .join(" • ") || "No metadata"}
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 min-h-[85vh] bg-gray-100">
                <iframe
                  src={viewingJournal.fileUrl}
                  title={viewingJournal.title}
                  className="w-full h-full min-h-[85vh]"
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {}
      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Filter by title or authors..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="pl-9"
          />
        </div>
        <Input
          placeholder="Year (e.g. 2024)"
          value={filterYear}
          onChange={(e) => setFilterYear(e.target.value)}
          maxLength={4}
          inputMode="numeric"
          className="w-full sm:w-40"
        />
      </div>

      {}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#8B1A1A]" />
        </div>
      ) : error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : journals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen className="h-12 w-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-[#333] mb-1">
            No journals uploaded yet
          </h3>
          <p className="text-sm text-gray-500 mb-4 max-w-md">
            Upload research journals (PDF) so the system can compare student
            TAFs against them for similarity analysis.
          </p>
          <Button
            onClick={() => setUploadOpen(true)}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload Your First Journal
          </Button>
        </div>
      ) : filteredJournals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-lg border bg-white">
          <Search className="h-10 w-10 text-gray-300 mb-3" />
          <h3 className="text-lg font-medium text-[#333] mb-1">
            No journals match your filter
          </h3>
          <p className="text-sm text-gray-500">
            Try adjusting the title/author search or year filter.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-600">Title</th>
                <th className="px-4 py-3 font-medium text-gray-600">Authors</th>
                <th className="px-4 py-3 font-medium text-gray-600">Year</th>
                <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 font-medium text-gray-600">Uploaded</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredJournals.map((journal) => (
                <tr
                  key={journal.id}
                  className="hover:bg-gray-50/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setViewingJournal(journal)}
                      className="flex items-center gap-2 hover:text-[#8B1A1A] transition-colors text-left group"
                      title="View PDF"
                    >
                      <FileText className="h-4 w-4 text-[#8B1A1A] shrink-0" />
                      <span className="font-medium text-[#333] group-hover:text-[#8B1A1A]">
                        {journal.title}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {journal.authors || (
                      <span className="text-gray-400 italic">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {journal.year || (
                      <span className="text-gray-400 italic">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {journal.hasText ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                        Processed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(journal.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setViewingJournal(journal)}
                      className="text-gray-500 hover:text-[#8B1A1A]"
                      title="View PDF"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(journal)}
                      className="text-gray-500 hover:text-[#8B1A1A]"
                      title="Edit metadata"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openDeleteConfirm(journal.id)}
                      disabled={deletingId === journal.id}
                      className="text-gray-500 hover:text-red-600"
                    >
                      {deletingId === journal.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t bg-gray-50/50 px-4 py-2 text-xs text-gray-400">
            {filteredJournals.length} of {journals.length} journal{journals.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}

      {}
      <Dialog open={!!editingJournal} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-[#8B1A1A]" />
              Edit Journal
            </DialogTitle>
            <DialogDescription>
              Update the journal&apos;s metadata. The similarity index will be
              refreshed automatically when the title changes.
            </DialogDescription>
          </DialogHeader>

          {editError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {editError}
            </div>
          )}

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                disabled={savingEdit}
                placeholder="Journal title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-authors">
                Authors (comma-separated)
              </Label>
              <Input
                id="edit-authors"
                value={editAuthors}
                onChange={(e) => setEditAuthors(e.target.value)}
                disabled={savingEdit}
                placeholder="Author 1, Author 2"
              />
            </div>
            <div className="w-40 space-y-2">
              <Label htmlFor="edit-year">Year</Label>
              <Input
                id="edit-year"
                value={editYear}
                onChange={(e) => setEditYear(e.target.value)}
                disabled={savingEdit}
                placeholder="2024"
                maxLength={4}
                inputMode="numeric"
              />
            </div>
          </div>

          <DialogFooter className="pt-4">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={savingEdit}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={handleSaveEdit}
              disabled={savingEdit || !editTitle.trim()}
              className="bg-[#8B1A1A] hover:bg-[#a32020] text-white"
            >
              {savingEdit ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Pencil className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {}
      <ConfirmDeleteModal
        open={deleteTargetId !== null}
        onOpenChange={(open) => {
          if (!open && deletingId !== deleteTargetId) setDeleteTargetId(null);
        }}
        onConfirm={() => deleteTargetId && handleDelete(deleteTargetId)}
        itemName={deleteTarget?.title || "this journal"}
        loading={deletingId !== null}
        title="Delete Journal"
        description="Are you sure you want to delete this journal? This will remove its similarity index and cannot be undone."
      />
    </>
  );
}
function FilePreviewCard({
  entry,
  year,
  onRemove,
  onTitleChange,
  onAuthorsChange,
  onYearChange,
  disabled,
}: {
  entry: FileEntry;
  year: string;
  onRemove: () => void;
  onTitleChange: (t: string) => void;
  onAuthorsChange: (a: string) => void;
  onYearChange: (y: string) => void;
  disabled: boolean;
}) {
  const statusIcon = {
    pending: <FileText className="h-4 w-4 text-gray-400" />,
    uploading: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
    extracting: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
    ocr: <Loader2 className="h-4 w-4 animate-spin text-purple-500" />,
    ai_extracting: <Loader2 className="h-4 w-4 animate-spin text-[#8B1A1A]" />,
    ready: <FileText className="h-4 w-4 text-green-500" />,
    error: <FileText className="h-4 w-4 text-red-500" />,
  };

  const statusLabel = {
    pending: "Pending",
    uploading: "Uploading...",
    extracting: "Extracting text...",
    ocr: "Running OCR (scanned PDF)...",
    ai_extracting: "AI extracting metadata...",
    ready: "Ready",
    error: "Error",
  };

  return (
    <div
      className={`rounded-lg border p-3 ${
        entry.status === "error"
          ? "border-red-200 bg-red-50/50"
          : entry.status === "ready"
          ? "border-green-200 bg-green-50/30"
          : "border-gray-200 bg-white"
      }`}
    >
      {}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0 max-w-full">
          {statusIcon[entry.status]}
          <span
            className="text-xs font-medium text-gray-500 truncate block max-w-[200px]"
            title={entry.file.name}
          >
            {entry.file.name}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${
              entry.status === "ready"
                ? "bg-green-100 text-green-700"
                : entry.status === "error"
                ? "bg-red-100 text-red-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {statusLabel[entry.status]}
          </span>
          {!disabled && (
            <button
              onClick={onRemove}
              className="text-gray-400 hover:text-red-500"
              title="Remove"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {}
      {entry.error && (
        <p className="text-xs text-red-600 mb-2">{entry.error}</p>
      )}

      {}
      {entry.status === "ready" && (
        <div className="space-y-2 mt-2">
          <div>
            <Label className="text-[11px] text-gray-400">Title</Label>
            <Input
              value={entry.title || ""}
              onChange={(e) => onTitleChange(e.target.value)}
              disabled={disabled}
              className="h-8 text-xs"
              placeholder="Journal title"
            />
          </div>
          <div>
            <Label className="text-[11px] text-gray-400">
              Authors (comma-separated)
            </Label>
            <Input
              value={entry.authors || ""}
              onChange={(e) => onAuthorsChange(e.target.value)}
              disabled={disabled}
              className="h-8 text-xs"
              placeholder="Author 1, Author 2"
            />
          </div>
          <div className="w-32">
            <Label className="text-[11px] text-gray-400">Year</Label>
            <Input
              value={entry.year || year}
              onChange={(e) => onYearChange(e.target.value)}
              disabled={disabled}
              className="h-8 text-xs"
              placeholder="2024"
              maxLength={4}
            />
          </div>
        </div>
      )}
    </div>
  );
}