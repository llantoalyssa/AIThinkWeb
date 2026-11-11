// ============================================================
// Shared URL-slug helper for advisory group routes.
//
// The notification surfaces build group URLs client-side from the
// group NAME carried on the notification, and those URLs must match
// the slugs the server produces (see getStudentGroupBySlug). Keeping
// one implementation stops the routes from drifting apart.
// ============================================================

/** URL slug for an advisory group name: lowercase, non-alphanumeric
 *  characters collapsed to "-", trimmed of leading/trailing dashes.
 *  Falls back to "group" so a URL is always buildable. */
export function groupSlug(name: string | null | undefined): string {
  return (
    (name || "group")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "group"
  );
}
