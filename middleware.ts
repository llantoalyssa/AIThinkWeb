import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/server/supabase/middleware";
import { ROLE_DASHBOARD_ROUTES, roleLandingPath, type UserRole } from "@/lib/constants";

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

  let userRole: UserRole | null = claimRole;
  let userIsActive = true;

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

  if (userId && AUTH_PAGES.includes(pathname)) {
    if (!userRole) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();
      if (profile?.role) userRole = profile.role as UserRole;
    }
    const url = request.nextUrl.clone();
    url.pathname = roleLandingPath(userRole || "student", userId);
    return redirectWithCookies(url, supabaseResponse);
  }

  if (isDashboardRoute) {
    // Not authenticated - redirect to login
    if (!userId) {
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
      const url = request.nextUrl.clone();
      url.pathname = roleLandingPath(role, userId);
      return redirectWithCookies(url, supabaseResponse);
    }

    // User has access - if they're at the base route without user ID, redirect to include user ID
    const baseRoute = ROLE_DASHBOARD_ROUTES[role];
    if (pathname === baseRoute) {
      const url = request.nextUrl.clone();
      url.pathname = roleLandingPath(role, userId);
      return redirectWithCookies(url, supabaseResponse);
    }

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
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};