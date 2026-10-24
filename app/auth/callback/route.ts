import { NextResponse } from "next/server";
import { createClient } from "@/server/supabase/server";
import { ROLE_DASHBOARD_ROUTES, ALLOWED_EMAIL_DOMAIN, type UserRole } from "@/lib/constants";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const meta = (user.user_metadata || {}) as Record<string, unknown>;
        const fullName = (meta.full_name || meta.name || "") as string;
        const given = (meta.given_name as string) || "";
        const family = (meta.family_name as string) || "";
        const firstName =
          given ||
          (fullName ? fullName.trim().split(/\s+/)[0] || "" : "");
        const lastName =
          family ||
          (fullName
            ? fullName.trim().split(/\s+/).slice(1).join(" ") || ""
            : "");
        const avatarUrl =
          (meta.avatar_url as string) || (meta.picture as string) || null;
        const email = user.email || "";

        if (!email.toLowerCase().endsWith(ALLOWED_EMAIL_DOMAIN)) {
          await supabase.auth.signOut();
          return NextResponse.redirect(`${origin}/login?domain=1`);
        }

        const existing = await supabase
          .from("profiles")
          .select("id, first_name, last_name, middle_initial, suffix, sr_code, role, avatar_url, email")
          .eq("id", user.id)
          .maybeSingle();

        if (!existing.data) {

          await supabase.from("profiles").insert({
            id: user.id,
            email: email || null,
            first_name: firstName || null,
            last_name: lastName || null,
            middle_initial: null,
            suffix: null,
            sr_code: null,
            role: "student",
            avatar_url: avatarUrl,
          });
        } else {

          const patch: Record<string, unknown> = {};
          if (!existing.data.first_name && firstName)
            patch.first_name = firstName;
          if (!existing.data.last_name && lastName) patch.last_name = lastName;
          if (!existing.data.email && email) patch.email = email;
          if (!existing.data.avatar_url && avatarUrl)
            patch.avatar_url = avatarUrl;
          if (Object.keys(patch).length > 0) {
            await supabase
              .from("profiles")
              .update(patch)
              .eq("id", user.id);
          }
        }
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        const role = (profile?.role as UserRole) || "student";
        const dashboardRoute = ROLE_DASHBOARD_ROUTES[role];

        return NextResponse.redirect(`${origin}${dashboardRoute}/${user.id}`);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}