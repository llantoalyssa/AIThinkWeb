"use client";

import { useEffect, useState } from "react";
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
import { AlertTriangle, Loader2, Lock } from "lucide-react";
import { USER_ROLES, type UserRole } from "@/lib/constants";
// Type-only import: the values behind these live in a "use server" module and
// are read by the department page (this component only renders what it is given).
import type {
  PermissionChange,
  PermissionGroup,
  PermissionItem,
} from "@/server/actions/permissions";
import {
  permissionAppliesToRole,
  permissionFixedForRole,
} from "@/lib/permissions";

// Re-use the server action types inline so we're decoupled
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

// What the dialog hands back to the page. `permissionChanges` carries ONLY the
// permission keys the department actually touched: granted:true = explicit
// GRANT, granted:false = explicit DENY, granted:null = "no override" (the page
// deletes the row, restoring the role default).
export type UserDialogSubmit = UserFormData & {
  permissionChanges: PermissionChange[];
};

/**
 * Everything the Permissions section needs, all PROVIDED by the department page
 * getDepartmentShell → readPermissionConsoleData(), preloaded with the page).
 * Nothing here is hardcoded, so the dialog cannot disagree with the tables.
 */
export type PermissionPanelData = {
  /** The catalogue, grouped for display. */
  groups: PermissionGroup[];
  /** role → the permission keys that role gets by default. */
  roleDefaults: Record<string, string[]>;
  /** Explicit override rows for this account (true = GRANT, false = DENY). */
  overrides: Record<string, boolean>;
  // NOTE: there is no `effective` field any more. It is DERIVED here from
  // roleDefaults + overrides with the same rule has_permission() uses
  // (lib/permissions.ts → resolvePermissionState), so the boxes are correct on
  // the first paint instead of waiting for a server read to land.
};

// Which rows warn is decided by the STRUCTURAL column in the permissions table —
// never by a key list here. A structural permission changes WHO approves, not
// just what is visible, so those rows say so; the ones with a known consequence
// spell it out.
const STRUCTURAL_CONSEQUENCES: Record<string, string> = {
  "groups.create": "This person becomes the FIRST APPROVER for groups they create.",
};
const STRUCTURAL_WARNING_FALLBACK =
  "Structural: this changes who approves, not just what is visible.";

// RESERVED rows (public.permissions.department_only — migration 058: user
// management, journal uploads, feedback replies) can only ever be held by a
// DEPARTMENT account. On any other target they render unchecked and read-only
// with a "department only" note; setUserPermission() refuses them and a trigger
// in the database raises, so the checkbox is a hint, never the rule.

function structuralWarning(key: string): string {
  return STRUCTURAL_CONSEQUENCES[key] ?? STRUCTURAL_WARNING_FALLBACK;
}

type UserDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  /**
   * Roles this dialog may offer. The Users page lists students and staff in
   * separate tabs, so the role list must match the tab the dialog was opened
   * from — a "Department" option inside the Students tab is a mis-click waiting
   * to happen. Omitted = every role (previous behaviour).
   */
  allowedRoles?: UserRole[];
  /** Pre-filled data for edit mode */
  initialData?: Partial<UserFormData> & { id?: string };
  /**
   * Role of the SIGNED-IN account. The Permissions section only exists for a
   * department account.
   */
  actorRole?: UserRole | null;
  /** Id of the signed-in account — used to hide the section on your OWN account. */
  currentUserId?: string | null;
  /**
   * Permission data for the account being edited. Null/omitted → the section is
   * not rendered at all (non-department viewer, or no data loaded yet).
   */
  permissions?: PermissionPanelData | null;
  onSubmit: (data: UserDialogSubmit) => Promise<{
    success: boolean;
    error?: string;
    cancelled?: boolean;
  }>;
  /**
   * Fired when the user cancels. The parent uses this to roll back a create
   * that was already in flight (a server action can't be aborted mid-request).
   */
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

/** SR Code shape: two digits, a dash, five digits (e.g. 23-93627). */
const SR_CODE_RE = /^\d{2}-\d{5}$/;

// Name inputs accept Unicode letters, spaces, hyphens, apostrophes and periods
// (e.g. José, Dela Cruz, O'Brien). The middle initial is a SINGLE letter plus an
// optional final period (legacy values like "M." stay valid) — never two
// letters, digits or other punctuation.
const NAME_DISALLOWED_RE = /[^\p{L} .'-]/gu;
const MIDDLE_DISALLOWED_RE = /[^\p{L}.]/gu;
const NAME_ALLOWED_RE = /^[\p{L} .'-]+$/u;
const MIDDLE_ALLOWED_RE = /^[\p{L}]\.?$/u;

function sanitizeName(value: string): string {
  return value.replace(NAME_DISALLOWED_RE, "");
}
function sanitizeMiddleInitial(value: string): string {
  // Collapse to one letter, keeping a single optional trailing period.
  const cleaned = value.replace(MIDDLE_DISALLOWED_RE, "");
  const letter = cleaned.replace(/\./g, "").slice(0, 1);
  return cleaned.includes(".") && letter ? `${letter}.` : letter;
}

/**
 * Clear the body locks Radix layers set while a popover/dialog is open.
 *
 * `pointer-events: none` left on <body> makes every control on the page ignore
 * clicks — the "frozen Users page". Radix normally restores it, but a Select
 * whose parent dialog unmounts first can miss its own cleanup and re-apply the
 * lock AFTER the dialog's. Repeating the sweep (immediately, then shortly after
 * the close) makes the order irrelevant.
 */
function releaseBodyLocks() {
  if (typeof document === "undefined") return;
  const clear = () => {
    document.body.style.pointerEvents = "";
    document.body.style.overflow = "";
    document.body.removeAttribute("data-scroll-locked");
  };
  clear();
  window.setTimeout(clear, 60);
  window.setTimeout(clear, 250);
}

export default function UserDialog({
  open,
  onOpenChange,
  mode,
  allowedRoles,
  initialData,
  actorRole,
  currentUserId,
  permissions,
  onSubmit,
  onCancel,
}: UserDialogProps) {
  // Compute initial form state based on props (component remounts via key)
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
  // The role Select is CONTROLLED so it can be closed before its parent Dialog
  // unmounts — see the cleanup effect below.
  const [roleSelectOpen, setRoleSelectOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Permission keys the department TOUCHED, and nothing else: true = GRANT,
  // false = DENY, null = "reset to the role default" (delete the override row).
  // Untouched rows are never written, so an unchanged account keeps whatever the
  // database already says about it.
  const [permissionEdits, setPermissionEdits] = useState<
    Record<string, boolean | null>
  >({});

  function updateField<K extends keyof UserFormData>(
    field: K,
    value: UserFormData[K]
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // ── Permissions section (derived, nothing stored) ──────────
  // Shown ONLY for a department account, and NEVER on your own account: a
  // department account must not widen (or narrow) its own access. The same rule
  // is enforced server-side by setUserPermission().
  const isSelf =
    mode === "edit" && !!currentUserId && initialData?.id === currentUserId;
  const permissionPanel =
    actorRole === "department" &&
    !isSelf &&
    permissions &&
    permissions.groups.length > 0
      ? permissions
      : null;

  // The role selected in the form, not the stored one — the department can change
  // the account type and the permissions in the same save.
  const defaultKeys = new Set(
    permissionPanel
      ? (permissionPanel.roleDefaults[form.role] ?? [])
      : []
  );

  /**
   * Rows the selected account type cannot hold at all (`applies_to`, migration
   * 060): a `pages.users` grant means nothing to an adviser, because the only
   * Users page is the department's. They are not rendered — offering them is how
   * the nav used to grow a dead department link.
   */
  function appliesToRole(permission: PermissionItem): boolean {
    return permissionAppliesToRole(permission.applies_to, form.role);
  }

  /**
   * Rows that ARE the account type (`fixed_roles`, migration 060): an adviser
   * creates advisory groups and sits in the approval chain by definition, and a
   * dean owns the Executive Summary. Those render checked + locked instead of as
   * a toggle that changes nothing.
   */
  function isFixed(permission: PermissionItem): boolean {
    return permissionFixedForRole(permission.fixed_roles, form.role);
  }

  const visibleGroups = permissionPanel
    ? permissionPanel.groups
        .map((group) => ({
          ...group,
          permissions: group.permissions.filter(appliesToRole),
        }))
        .filter((group) => group.permissions.length > 0)
    : [];

  /**
   * A RESERVED (department_only) row is read-only unless the target account's
   * role — the one selected in the form, since the role can change in the same
   * save — is 'department'. Nothing here hardcodes which keys those are.
   */
  function isReserved(permission: PermissionItem): boolean {
    return permission.department_only && form.role !== "department";
  }

  function hasEdit(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(permissionEdits, key);
  }
  function serverOverride(key: string): true | false | undefined {
    const value = permissionPanel?.overrides[key];
    return value === true || value === false ? value : undefined;
  }
  function defaultApplies(key: string): boolean {
    return defaultKeys.has(key);
  }
  /** The value the box shows: what has_permission() would answer if saved now. */
  function effectiveValue(key: string): boolean {
    if (hasEdit(key)) {
      const edit = permissionEdits[key];
      return edit === null ? defaultApplies(key) : edit;
    }
    const override = serverOverride(key);
    if (override !== undefined) return override;
    // override → role default → false, exactly as public.has_permission().
    return defaultApplies(key);
  }
  /** True when this row does not simply follow the role default. */
  function isChanged(key: string): boolean {
    // Explicitly reset back to the role default → no longer "changed".
    if (hasEdit(key) && permissionEdits[key] === null) return false;
    // An explicit override row IS a deviation from the role default.
    if (serverOverride(key) !== undefined) return true;
    return effectiveValue(key) !== defaultApplies(key);
  }

  function togglePermission(key: string, next: boolean) {
    setPermissionEdits((prev) => ({ ...prev, [key]: next }));
  }
  /** "Reset to role default": send null → the override row is DELETED on save. */
  function resetPermission(key: string) {
    setPermissionEdits((prev) => ({ ...prev, [key]: null }));
  }

  /**
   * The changes to persist: only keys the department touched, and a key whose
   * value matches the role default is sent as null (delete the override) — so a
   * later role change cannot leave a stale grant behind.
   */
  function buildPermissionChanges(): PermissionChange[] {
    if (!permissionPanel) return [];
    const changes: PermissionChange[] = [];
    for (const group of permissionPanel.groups) {
      for (const item of group.permissions) {
        // A reserved row is read-only on a non-department account: a tick left
        // behind by switching the role away must never reach the server (which
        // would refuse it anyway).
        if (isReserved(item)) continue;
        // A row this account TYPE cannot hold, or one that IS the account type,
        // is never written: setUserPermission() refuses both and the migration
        // 060 trigger raises for either.
        if (!appliesToRole(item) || isFixed(item)) continue;
        if (!hasEdit(item.key)) continue;
        const value = effectiveValue(item.key);
        const followsDefault = defaultApplies(item.key);
        changes.push({
          permission: item.key,
          granted: value === followsDefault ? null : value,
        });
      }
    }
    return changes;
  }

  // Format SR Code as digits, auto-inserting a dash after the first 2
  // digits: "00-00000". Strips non-digits; max 2 + 5 digits. Optional field.
  function formatSrCode(raw: string): string {
    const digits = raw.replace(/\D/g, "").slice(0, 7);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return; // ignore double submits / re-entrancy
    setError(null);

    // Client-side validation
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
    if (isStudentScope && !SR_CODE_RE.test(form.srCode)) {
      setError("SR Code is required for student accounts (format 00-00000).");
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
    // Students: the email's local part must BE the SR code — the same rule the
    // registration page enforces. Checked here too so the office gets the
    // message before a round trip.
    if (
      isStudentScope &&
      form.email.split("@")[0].toLowerCase() !== form.srCode.trim().toLowerCase()
    ) {
      setError(
        `The email must match the SR code (e.g. ${form.srCode.trim()}@g.batstate-u.edu.ph).`,
      );
      return;
    }
    if (mode === "create" && (!form.password || form.password.length < 8)) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    const result = await onSubmit({
      ...form,
      // Staff accounts carry no SR code. Clearing it here also covers the case
      // where the role was switched inside the dialog.
      srCode: isStudentScope ? form.srCode : "",
      permissionChanges: buildPermissionChanges(),
    });
    setSubmitting(false);

    if (result.cancelled) {
      // The user cancelled while the request was in flight and the parent
      // already rolled it back — don't surface an error or "close" again.
      return;
    }

    if (result.success) {
      releaseBodyLocks();
      onOpenChange(false);
    } else {
      setError(result.error || "An unexpected error occurred.");
    }
  }

  // Cancel: never a submitter, and never blocked by an in-flight request —
  // cancelling must always be possible. The parent decides whether an already
  // running create needs to be undone.
  function handleCancel() {
    setError(null);
    onCancel?.();
    releaseBodyLocks();
    onOpenChange(false);
  }


  /**
   * Safety net for the Radix nested-overlay bug: if the dialog is closed while a
   * popover was still mounted, <body> can keep `pointer-events: none` (and the
   * scroll lock). The dialog still closes, but every control underneath is dead
   * — the "Users page went unresponsive" report. Clear it only when nothing else
   * is genuinely open.
   */
  useEffect(() => {
    if (open) return;
    /**
     * This used to bail out when ANY `[data-radix-popper-content-wrapper]`
     * existed — but an ORPHANED select portal (left behind when the dialog
     * unmounted first) matches that selector too, so the guard cancelled the
     * very cleanup it was there to perform. That is why the freeze survived on
     * the Students tab. Clear the locks unconditionally once the dialog is
     * closed; releasing body styles is harmless even if a popover is genuinely
     * open, because Radix restores its own lock on close.
     */
    const id = window.setTimeout(releaseBodyLocks, 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const isCreate = mode === "create";
  /**
   * Is this dialog for STUDENT accounts? The Users page opens it from either
   * tab: the Students tab allows only `student`, the Faculty & Staff tab never
   * does. SR Code belongs to students (it IS their username), so the field is
   * shown and required there and hidden entirely for staff.
   */
  const isStudentScope = !allowedRoles || allowedRoles.includes("student");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        /**
         * Closing the dialog while the role Select is open used to leave Radix's
         * body lock behind (`pointer-events: none`), so the whole Users page
         * ignored every click — the "frozen page".
         *
         * Setting the Select closed in the SAME commit is not enough: React
         * unmounts the Dialog (and its portal) before the Select's own exit
         * cleanup runs, which orphans the popover's invisible overlay on top of
         * the page. So close the Select first, let it finish, and close the
         * dialog on the next frame. The body-style sweep afterwards is a
         * belt-and-braces guard for any lock that still slips through.
         */
        if (next) {
          onOpenChange(true);
          return;
        }

        if (roleSelectOpen) {
          setRoleSelectOpen(false);
          requestAnimationFrame(() => {
            onOpenChange(false);
            releaseBodyLocks();
          });
          return;
        }

        onOpenChange(false);
        releaseBodyLocks();
      }}
    >
      <DialogContent className="sm:max-w-3xl">
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

          {/* Name fields */}
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

          {/* SR Code & Email — SR Code is a STUDENT field: faculty and staff
              have no SR code, so the input is not rendered for them at all
              (a hidden-but-required field would block every staff save). */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {isStudentScope && (
              <div className="space-y-2">
                <Label htmlFor="sr-code">
                  SR Code <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="sr-code"
                  placeholder="00-00000"
                  inputMode="numeric"
                  maxLength={8}
                  value={form.srCode}
                  onChange={(e) => updateField("srCode", formatSrCode(e.target.value))}
                  disabled={submitting}
                  required
                  aria-required="true"
                />
              </div>
            )}
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

          {/* Password (create only) */}
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

          {/* Role */}
          <div className="space-y-2">
            <Label htmlFor="role">
              Role <span className="text-red-500">*</span>
            </Label>
            <Select
              value={form.role}
              onValueChange={(val) => updateField("role", val as UserRole)}
              open={roleSelectOpen}
              onOpenChange={setRoleSelectOpen}
              disabled={submitting}
            >
              <SelectTrigger id="role">
                <SelectValue placeholder="Select a role..." />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.filter(
                  ([value]) => !allowedRoles || allowedRoles.includes(value),
                ).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status */}
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

          {/* Permissions — department accounts only, and never your own */}
          {permissionPanel && (
            <div className="space-y-3 rounded-lg border p-3">
              <div>
                <Label>Permissions</Label>
                <p className="mt-1 text-xs text-gray-500">
                  Tick what this account may do. The boxes start from the
                  account&apos;s current access; only rows you change are saved,
                  and a row that matches the {USER_ROLES[form.role]} defaults is
                  stored as &ldquo;no change&rdquo; so a later account-type change
                  keeps that role&apos;s own defaults. Rows marked{" "}
                  <span className="font-medium text-gray-700">
                    included with {USER_ROLES[form.role]}
                  </span>{" "}
                  are part of that Role and cannot be changed per account.
                </p>
              </div>

              {/* Two columns on a wide dialog: the catalogue has enough rows that
                  a single column turns the permission list into a long scroll. */}
              {visibleGroups.length === 0 && (
                <p className="rounded-md border border-dashed border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
                  Nothing to configure — a {USER_ROLES[form.role]} account has no
                  permissions that can be granted or denied individually.
                </p>
              )}

              <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
              {visibleGroups.map((group) => (
                <div key={group.group} className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    {group.group}
                  </p>
                  {group.permissions.map((permission) => {
                    // Reserved rows are never shown ticked for a non-department
                    // target and can't be toggled — see isReserved().
                    const reserved = isReserved(permission);
                    // Part of the account type (migration 060): always ON, shown
                    // ticked and locked so the department can see it is held
                    // without being offered a toggle that would do nothing.
                    const fixed = isFixed(permission);
                    const checked = fixed
                      ? true
                      : reserved
                        ? false
                        : effectiveValue(permission.key);
                    const changed =
                      !reserved && !fixed && isChanged(permission.key);
                    const inputId = `permission-${permission.key}`;
                    return (
                      <div
                        key={permission.key}
                        className={`rounded-md border p-2 ${
                          changed
                            ? "border-amber-300 bg-amber-50/40"
                            : fixed
                              ? "border-gray-200 bg-gray-50/70"
                              : reserved
                                ? "border-dashed border-gray-200 bg-gray-50"
                                : "border-gray-200"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <input
                            id={inputId}
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              togglePermission(permission.key, e.target.checked)
                            }
                            disabled={submitting || reserved || fixed}
                            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#8B1A1A] disabled:cursor-not-allowed disabled:opacity-50"
                          />
                          <div className="min-w-0 flex-1">
                            <label
                              htmlFor={inputId}
                              className={`block text-sm font-medium ${
                                reserved
                                  ? "text-gray-400"
                                  : fixed
                                    ? "cursor-default text-[#333]"
                                    : "cursor-pointer text-[#333]"
                              }`}
                            >
                              {permission.label}
                              {fixed && (
                                <span className="ml-1.5 rounded bg-gray-200 px-1.5 py-0.5 align-middle text-[10px] font-medium text-gray-600">
                                  included with {USER_ROLES[form.role]}
                                </span>
                              )}
                            </label>
                            {reserved && (
                              <p className="mt-0.5 flex items-start gap-1 text-xs font-medium text-gray-500">
                                <Lock className="mt-0.5 h-3 w-3 shrink-0" />
                                <span>
                                  department only — this Role cannot
                                  hold it.
                                </span>
                              </p>
                            )}
                            {permission.description && (
                              <p className="text-xs text-gray-500">
                                {permission.description}
                              </p>
                            )}
                            {/* Which rows carry this warning is decided by the
                                `structural` column in the permissions table. */}
                            {permission.structural && (
                              <p
                                className={`mt-1 flex items-start gap-1 text-xs ${
                                  checked
                                    ? "font-medium text-amber-700"
                                    : "text-gray-500"
                                }`}
                              >
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <span>{structuralWarning(permission.key)}</span>
                              </p>
                            )}
                          </div>
                          {changed && (
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                                changed
                              </span>
                              <button
                                type="button"
                                onClick={() => resetPermission(permission.key)}
                                disabled={submitting}
                                className="text-[10px] text-gray-500 underline underline-offset-2 hover:text-[#8B1A1A] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Reset to role default
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              </div>
            </div>
          )}

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
