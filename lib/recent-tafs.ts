/**
 * @deprecated Use server actions from `@/server/actions/recents` instead.
 * This file previously used localStorage but now re-exports only for type compatibility.
 *
 * Migration guide:
 *   import { addRecentTAF } from "@/server/actions/recents"   // new
 *   import { addRecentTAF } from "@/lib/recent-tafs"          // old (deprecated)
 *
 * Usage: addRecentTAF(id, title, status)  // new signature (3 args, positional)
 *   vs old: addRecentTAF({ id, proposedTitle, status })  // old (object arg)
 */

export type { RecentTAFEntry } from "@/server/actions/recents";
