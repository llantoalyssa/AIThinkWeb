export function groupSlug(name: string | null | undefined): string {
  return (
    (name || "group")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "group"
  );
}