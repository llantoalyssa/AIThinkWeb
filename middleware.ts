import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/server/supabase/middleware";
import { ROLE_DASHBOARD_ROUTES, type UserRole } from "@/lib/constants";

// Define route patterns for each role (with or without user ID)
const ROUTE_PATTERNS = {
  student: ["/dashboard/student"],
  adviser: ["/dashboard/adviser", "/dashboard/adviser/group"],
  associate_dean: ["/dashboard/associate-dean", "/dashboard/associate-dean/submission"],
  dean: ["/dashboard/dean", "/dashboard/dean/submission"],
  department: ["/dashboard/department"],
  vcrdes: ["/dashboard/vcrdes", "/dashboard/vcrdes/submission"],
} as const;

// Auth pages that logged-in users should not access
const AUTH_PAGES = ["/login", "/register", "/discover"];

// ── Redirects must carry the refreshed session cookies ─────────────────
// updateSession() refreshes the session and writes the new access/refresh
// tokens onto `supabaseResponse` via Set-Cookie. A redirect returned from this
// middleware is a BRAND-NEW response object, so it does NOT inherit them.
//
// Dropping them is not cosmetic: Supabase rotates the refresh token on every
// refresh, so the server would move to a new token while the browser kept the
// old one. The next refresh happens well outside Supabase's 10s reuse window,
// the server reads it as token REUSE, and per the docs "the whole session is
// regarded as terminated and all refresh tokens belonging to it are marked as
// revoked" — the user is silently logged out and lands on /login. Supabase's
// SSR guidance requires redirect responses to carry the refreshed cookies.
function redirectWithCookies(
  url: URL,
  supabaseResponse: NextResponse
): NextResponse {
  const redirect = NextResponse.redirect(url);
  for (const cookie of supabaseResponse.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  // @supabase/ssr hands these to setAll for refresh responses (v0.10+); they
  // must survive the redirect too, or a CDN may cache the token.
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = supabaseResponse.headers.get(header);
    if (value) redirect.headers.set(header, value);
  }
  return redirect;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // If Supabase env vars are missing, skip auth checks and let requests through
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.next({ request });
  }

  const { supabase, supabaseResponse } = await updateSession(request);

  // ── Identity ────────────────────────────────────────────────────────────
  // getClaims() VERIFIES the JWT signature — locally, against the project's
  // cached JWKS, when access tokens are signed with an asymmetric key. That is
  // the recommended replacement for getUser() here: the same verified identity
  // without a round trip to the Auth server on EVERY request. Middleware runs
  // for every navigation, including the RSC fetches behind side-nav clicks, so
  // that round trip was being paid constantly.
  //
  // This is NOT getSession(): the claims are signature-verified rather than
  // read out of an unverified cookie. If the project still signs with the
  // legacy HS256 secret and no key material is available, getClaims() falls
  // back to the Auth server by itself; if it throws, we fall back to getUser()
  // below — so the worst case is exactly the previous behaviour.
  let userId: string | null = null;
  let claimRole: UserRole | null = null;

  try {
    const { data, error } = await supabase.auth.getClaims();
    if (!error && data?.claims?.sub) {
      userId = data.claims.sub as string;
      const meta = (data.claims.user_metadata ?? {}) as { role?: UserRole };
      claimRole = meta.role ?? null;
    }
  } catch {
    // Verification unavailable — the getUser() fallback below handles it.
  }

  if (!userId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
      claimRole = (user.user_metadata?.role as UserRole) || null;
    }
  }

  // role + active flag come from the DB (authoritative), keyed by the
  // authenticated user id. Assume active until proven otherwise.
  let userRole: UserRole | null = claimRole;
  let userIsActive = true;

  // Protected dashboard routes: do ONE DB query for the fresh role + disabled
  // flag. (Previously this profile query ran on every request, including
  // public pages — now it only runs for /dashboard/*.)
  const isDashboardRoute = pathname.startsWith("/dashboard");

  if (userId && isDashboardRoute) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", userId)
      .single();
    if (profile?.role) userRole = profile.role as UserRole;
    userIsActive = profile?.is_active !== false;
  }

  // Disabled account — sign out and send to login
  if (userId && !userIsActive) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("disabled", "1");
    return redirectWithCookies(url, supabaseResponse);
  }

  // Redirect authenticated users away from auth pages to their role-based
  // dashboard. When the token carried no role claim, resolve it from the DB
  // instead of assuming "student" — otherwise an approver whose claims lack
  // user_metadata would be sent to the student dashboard.
  if (userId && AUTH_PAGES.includes(pathname)) {
    if (!userRole) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();
      if (profile?.role) userRole = profile.role as UserRole;
    }
    const dashboardRoute = ROLE_DASHBOARD_ROUTES[userRole || "student"];
    const url = request.nextUrl.clone();
    url.pathname = `${dashboardRoute}/${userId}`;
    return redirectWithCookies(url, supabaseResponse);
  }

  if (isDashboardRoute) {
    // Not authenticated - redirect to login
    if (!userId) {
      // Diagnosability: distinguishes "the browser sent no auth cookie at all"
      // from "the cookie was there but the session was rejected" — the two
      // causes behind a silent logout. Cookie NAME only, never its value.
      console.warn(
        "[middleware] no session for",
        pathname,
        "| auth cookie present:",
        request.cookies.getAll().some((c) => c.name.includes("-auth-token")),
      );
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return redirectWithCookies(url, supabaseResponse);
    }

    // Authenticated - check role-based access
    const role = userRole || "student";
    const allowedRoutes = ROUTE_PATTERNS[role];

    const hasAccess = allowedRoutes.some((route) => {
      if (pathname === route) return true;
      if (pathname.startsWith(`${route}/`)) return true;
      return pathname.startsWith(route);
    });

    if (!hasAccess) {
      const correctDashboard = ROLE_DASHBOARD_ROUTES[role];
      const url = request.nextUrl.clone();
      url.pathname = `${correctDashboard}/${userId}`;
      return redirectWithCookies(url, supabaseResponse);
    }

    // User has access - if they're at the base route without user ID, redirect to include user ID
    const baseRoute = ROLE_DASHBOARD_ROUTES[role];
    if (pathname === baseRoute) {
      const url = request.nextUrl.clone();
      url.pathname = `${baseRoute}/${userId}`;
      return redirectWithCookies(url, supabaseResponse);
    }

    // ── Canonical user id in the URL ──────────────────────────────────────
    // /dashboard/<role>/<id>/... must carry the SIGNED-IN user's id. This is
    // the guard that used to be duplicated inside individual pages
    // (`if (urlUserId !== currentUser.id) router.replace(...)`), each paying
    // its own Auth round trip for the privilege. Enforcing it once here covers
    // every route — including the ones that never had the check — and it
    // happens before any HTML is generated.
    const segments = pathname.split("/"); // ["", "dashboard", role, id, ...]
    const urlId = segments[3];
    if (urlId && urlId !== userId) {
      segments[3] = userId;
      const url = request.nextUrl.clone();
      url.pathname = segments.join("/");
      return redirectWithCookies(url, supabaseResponse);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, SVGs, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};