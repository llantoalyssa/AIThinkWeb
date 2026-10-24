"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { USER_ROLES, type UserRole } from "@/lib/constants";
type UserFormData = {
  firstName: string;
  lastName: string;
  middleInitial: string;
  suffix: string;
  srCode: string;
  email: string;
  password: string;
  role: UserRole;
  isActive: boolean;
};

type UserDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";

  initialData?: Partial<UserFormData> & { id?: string };
  onSubmit: (
    data: UserFormData
  ) => Promise<{ success: boolean; error?: string; cancelled?: boolean }>;
  onCancel?: () => void;
};

const EMPTY_FORM: UserFormData = {
  firstName: "",
  lastName: "",
  middleInitial: "",
  suffix: "",
  srCode: "",
  email: "",
  password: "",
  role: "student",
  isActive: true,
};

const ROLE_OPTIONS = Object.entries(USER_ROLES) as [UserRole, string][];
const NAME_DISALLOWED_RE = /[^\p{L} .'-]/gu;
const MIDDLE_DISALLOWED_RE = /[^\p{L}.]/gu;
const NAME_ALLOWED_RE = /^[\p{L} .'-]+$/u;
const MIDDLE_ALLOWED_RE = /^[\p{L}]\.?$/u;

function sanitizeName(value: string): string {
  return value.replace(NAME_DISALLOWED_RE, "");
}
function sanitizeMiddleInitial(value: string): string {

  const cleaned = value.replace(MIDDLE_DISALLOWED_RE, "");
  const letter = cleaned.replace(/\./g, "").slice(0, 1);
  return cleaned.includes(".") && letter ? `${letter}.` : letter;
}

export default function UserDialog({
  open,
  onOpenChange,
  mode,
  initialData,
  onSubmit,
  onCancel,
}: UserDialogProps) {

  const getInitialForm = (): UserFormData => {
    if (mode === "edit" && initialData) {
      return {
        firstName: initialData.firstName || "",
        lastName: initialData.lastName || "",
        middleInitial: initialData.middleInitial || "",
        suffix: initialData.suffix || "",
        srCode: initialData.srCode || "",
        email: initialData.email || "",
        password: "",
        role: initialData.role || "student",
        isActive: initialData.isActive ?? true,
      };
    }
    return EMPTY_FORM;
  };

  const [form, setForm] = useState<UserFormData>(getInitialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField<K extends keyof UserFormData>(
    field: K,
    value: UserFormData[K]
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }
  function formatSrCode(raw: string): string {
    const digits = raw.replace(/\D/g, "").slice(0, 7);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (!form.firstName || form.firstName.trim().length < 2) {
      setError("First name must be at least 2 characters.");
      return;
    }
    if (!NAME_ALLOWED_RE.test(form.firstName.trim())) {
      setError("First name can contain letters, spaces, hyphens, apostrophes and periods only.");
      return;
    }
    if (!form.lastName || form.lastName.trim().length < 2) {
      setError("Last name must be at least 2 characters.");
      return;
    }
    if (!NAME_ALLOWED_RE.test(form.lastName.trim())) {
      setError("Last name can contain letters, spaces, hyphens, apostrophes and periods only.");
      return;
    }
    if (form.middleInitial && !MIDDLE_ALLOWED_RE.test(form.middleInitial.trim())) {
      setError("Middle initial must be a single letter with an optional period (e.g. M).");
      return;
    }
    if (!form.email) {
      setError("Email is required.");
      return;
    }
    if (!form.email.endsWith("@g.batstate-u.edu.ph")) {
      setError("Only @g.batstate-u.edu.ph email addresses are allowed.");
      return;
    }
    if (mode === "create" && (!form.password || form.password.length < 8)) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    const result = await onSubmit(form);
    setSubmitting(false);

    if (result.cancelled) {
      return;
    }

    if (result.success) {
      onOpenChange(false);
    } else {
      setError(result.error || "An unexpected error occurred.");
    }
  }
  function handleCancel() {
    setError(null);
    onCancel?.();
    onOpenChange(false);
  }

  const isCreate = mode === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isCreate ? "New User" : "Edit User"}</DialogTitle>
          <DialogDescription>
            {isCreate
              ? "Create a new user account. A temporary password must be set."
              : "Update the user's profile information."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first-name">
                First Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="first-name"
                placeholder="Juan"
                value={form.firstName}
                onChange={(e) => updateField("firstName", sanitizeName(e.target.value))}
                disabled={submitting}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last-name">
                Last Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="last-name"
                placeholder="Dela Cruz"
                value={form.lastName}
                onChange={(e) => updateField("lastName", sanitizeName(e.target.value))}
                disabled={submitting}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="middle-initial">Middle Initial</Label>
              <Input
                id="middle-initial"
                placeholder="M"
                maxLength={2}
                value={form.middleInitial}
                onChange={(e) =>
                  updateField("middleInitial", sanitizeMiddleInitial(e.target.value).toUpperCase())
                }
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="suffix">Suffix</Label>
              <Input
                id="suffix"
                placeholder="Jr., III"
                value={form.suffix}
                onChange={(e) => updateField("suffix", e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          {}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sr-code">
                SR Code
              </Label>
              <Input
                id="sr-code"
                placeholder="00-00000 (optional)"
                inputMode="numeric"
                maxLength={8}
                value={form.srCode}
                onChange={(e) => updateField("srCode", formatSrCode(e.target.value))}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">
                Email <span className="text-red-500">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="user@g.batstate-u.edu.ph"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                disabled={submitting || mode === "edit"}
                required
              />
            </div>
          </div>

          {}
          {isCreate && (
            <div className="space-y-2">
              <Label htmlFor="password">
                Temporary Password <span className="text-red-500">*</span>
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                value={form.password}
                onChange={(e) => updateField("password", e.target.value)}
                disabled={submitting}
                required
              />
            </div>
          )}

          {}
          <div className="space-y-2">
            <Label htmlFor="role">
              Account Type <span className="text-red-500">*</span>
            </Label>
            <Select
              value={form.role}
              onValueChange={(val) => updateField("role", val as UserRole)}
              disabled={submitting}
            >
              <SelectTrigger id="role">
                <SelectValue placeholder="Select account type..." />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {}
          <div className="space-y-2">
            <Label>Account Status</Label>
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <button
                type="button"
                role="switch"
                aria-checked={form.isActive}
                onClick={() => updateField("isActive", !form.isActive)}
                disabled={submitting}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50 ${
                  form.isActive ? "bg-green-600" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    form.isActive ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
              <div className="flex-1">
                <p className="text-sm font-medium text-[#333]">
                  {form.isActive ? "Active" : "Disabled"}
                </p>
                <p className="text-xs text-gray-500">
                  {form.isActive
                    ? "User can sign in to the system."
                    : "User cannot sign in until re-enabled."}
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isCreate ? "Creating..." : "Saving..."}
                </>
              ) : isCreate ? (
                "Create User"
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}