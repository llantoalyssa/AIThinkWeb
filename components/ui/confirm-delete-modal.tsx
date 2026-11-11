"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  itemName?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  variant?: "danger" | "warning";
};

export default function ConfirmDeleteModal({
  open,
  onOpenChange,
  onConfirm,
  title = "Confirm Delete",
  description,
  itemName,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  loading = false,
  variant = "danger",
}: Props) {
  const isDanger = variant === "danger";
  function handleOpenChange(next: boolean) {
    if (!next && typeof document !== "undefined") {
      window.requestAnimationFrame(() => {
        document.body.style.pointerEvents = "";
      });
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                isDanger ? "bg-red-50" : "bg-amber-50"
              }`}
            >
              <AlertTriangle
                className={`h-5 w-5 ${
                  isDanger ? "text-red-600" : "text-amber-600"
                }`}
              />
            </div>
            <div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="mt-1.5">
                {description ||
                  (itemName
                    ? `Are you sure you want to delete "${itemName}"? This action cannot be undone.`
                    : "Are you sure you want to delete this item? This action cannot be undone.")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={isDanger ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={loading}
            className={
              isDanger
                ? "bg-red-600 hover:bg-red-700 text-white min-w-[6.5rem] justify-center"
                : "min-w-[6.5rem] justify-center"
            }
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}