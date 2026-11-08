"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { createClient } from "@/server/supabase/client";
import { rolePath, formatName } from "@/lib/constants";
import { logout, type CurrentUser } from "@/server/actions/auth";

/**
 * Reusable top-right user menu. Every dashboard page renders this so the
 * user can always reach their Profile page and sign out, regardless of role.
 *
 * Props:
 * - user: the authenticated user (or null while loading/auth fails)
 * - userId: id used to build the profile/role links
 * - forceNavigate: passed from pages that already call router.replace on auth
 *   failure (they can leave this undefined)
 */
export function UserMenu({
  user,
  userId,
  routeBase,
}: {
  user: CurrentUser | null;
  userId: string;
  routeBase: string; // e.g. "/dashboard/student" — hyphens for associate-dean
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const displayName = formatName({
    firstName: user?.firstName,
    middleInitial: user?.middleInitial,
    lastName: user?.lastName,
    suffix: user?.suffix,
  }) || "User";
  const initials =
    (
      (user?.firstName?.charAt(0) || "") +
      (user?.lastName?.charAt(0) || "")
    ).toUpperCase() || "U";

  const profilePath = `${routeBase}/${userId}/profile`;

  async function handleSignOut() {
    setSigningOut(true);

    /**
     * Go through the SERVER action, not the browser client.
     *
     * `createClient().auth.signOut()` here cleared the session without ever
     * touching the audit trail — the only sign-outs that were being recorded
     * were the ones made from a Profile page (which call logout()). This is the
     * header menu, i.e. how nearly everyone actually signs out.
     *
     * `logout()` writes the audit row FIRST (afterwards there is no session to
     * attribute it to) and then clears the session server-side, which also
     * clears the cookies.
     */
    const result = await logout();

    if (!result.success) {
      // Never leave the user stuck signed in because auditing failed — fall
      // back to the client sign-out and report it.
      console.error("[user-menu] logout action failed:", result.error);
      const { error } = await createClient().auth.signOut();
      if (error) {
        console.error("[user-menu] sign out error:", error.message);
        setSigningOut(false);
        return;
      }
    }

    setSigningOut(false);
    router.replace("/login");
    // Drop any cached RSC payload for the authenticated pages.
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[#8B1A1A] text-white text-sm font-semibold hover:bg-[#a32020] transition-colors overflow-hidden cursor-pointer"
        title={displayName}
        aria-label="User menu"
      >
        {user?.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt="Profile"
            className="h-full w-full object-cover"
          />
        ) : (
          initials
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-56 rounded-lg border bg-white shadow-lg z-50">
          <button
            onClick={() => {
              setOpen(false);
              router.push(profilePath);
            }}
            className="w-full text-left px-4 py-3 border-b hover:bg-gray-50 transition-colors cursor-pointer"
            title="View profile"
          >
            <p className="text-sm font-medium text-[#333] truncate">
              {displayName}
            </p>
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
          </button>
          <div className="py-1">
            <button
              onClick={() => {
                setOpen(false);
                router.push(profilePath);
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <span className="h-4 w-4 flex items-center justify-center">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-4 w-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                  />
                </svg>
              </span>
              My Profile
            </button>
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
            >
              {signingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}