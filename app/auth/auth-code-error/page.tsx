// ============================================================
// /auth/auth-code-error — where the OAuth callback sends a user when the code
// exchange fails.
//
// This route did not exist: the callback redirected here on failure and the user
// got a 404, which reads exactly like "Google sign-in is broken" with no clue
// what happened. It is a plain server page — no auth required, no data.
// ============================================================

import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-[#333]">
          Sign-in could not be completed
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          The sign-in link was invalid or has expired. This usually means the
          browser tab was left open too long, or the account chooser was
          cancelled. Try again from the login page.
        </p>
        <p className="mt-3 text-xs text-gray-400">
          If you were signing in with Google, make sure you use your{" "}
          <span className="font-medium text-gray-600">@g.batstate-u.edu.ph</span>{" "}
          account.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-[#8B1A1A] px-4 py-2 text-sm font-medium text-white hover:bg-[#a02020]"
        >
          Back to login
        </Link>
      </div>
    </div>
  );
}
