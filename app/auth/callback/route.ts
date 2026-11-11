import { NextResponse } from "next/server";
import { createClient } from "@/server/supabase/server";
import { createAdminClient } from "@/server/supabase/admin";
import { roleLandingPath, ALLOWED_EMAIL_DOMAIN, type UserRole } from "@/lib/constants";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Authenticated user — after exchanging the OAuth code we have their
      // REAL identity (names, email, avatar) from Google.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        // ── Ensure a profiles row exists, filling names/avatar from the
        //    authenticated user (this is the authoritative source — Google's
        //    given/family name if available, else the full_name).
        //    Only fill EMPTY fields so we never clobber something the user
        //    edited later (e.g. a corrected name or their SR code).
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

        // ── Domain gate ──────────────────────────────────────────
        // Only @g.batstate-u.edu.ph Google accounts may sign in. The `hd`
        // query param sent by the client is only a Google UI hint, so the
        // real enforcement happens here: sign the outsider out and bounce
        // them back to login with a message.
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
          // No profile yet (e.g. Google sign-in) — create it.
          //
          // NULL (not "") for sr_code: profiles.sr_code is UNIQUE, and the
          // OAuth trigger (migration 039) used to insert '', so the SECOND
          // Google account failed that insert with a unique violation. The
          // trigger is fixed in migration 064; this insert has to stay NULL
          // either way.
          const insertPayload = {
            id: user.id,
            email: email || null,
            first_name: firstName || null,
            last_name: lastName || null,
            middle_initial: null,
            suffix: null,
            sr_code: null,
            role: "student",
            avatar_url: avatarUrl,
          };
          const { error: insertError } = await supabase
            .from("profiles")
            .insert(insertPayload);
          if (insertError) {
            // This used to be fire-and-forget: a failed insert left the account
            // with NO profile, so the role lookup below answered "student" and
            // the dashboard bounced the user straight back to /login. Log it,
            // then repair with the service-role client (which RLS cannot block).
            console.error(
              "[auth/callback] profile insert failed for",
              user.id,
              "—",
              insertError.code,
              insertError.message,
            );
            const admin = createAdminClient();
            if (admin) {
              const { error: repairError } = await admin
                .from("profiles")
                .insert(insertPayload);
              if (repairError && repairError.code !== "23505") {
                console.error(
                  "[auth/callback] service-role profile repair failed:",
                  repairError.code,
                  repairError.message,
                );
              }
            }
          }
        } else {
          // Fill only empty fields (never overwrite user-edited values).
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

        // ── Role-based redirect ──────────────────────────────────
        // maybeSingle (not single): a missing profile must be DISTINGUISHABLE
        // from "role = student". Assuming student here is what produced a
        // sign-in loop — the student dashboard then found no profile and sent
        // the user back to /login with no explanation.
        const adminForRead = createAdminClient();
        const profileClient = adminForRead ?? supabase;
        const { data: profile, error: profileError } = await profileClient
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError || !profile) {
          console.error(
            "[auth/callback] no profile for",
            user.id,
            "—",
            profileError?.code ?? "row missing",
            profileError?.message ?? "",
          );
          await supabase.auth.signOut();
          return NextResponse.redirect(`${origin}/login?profile=1`);
        }

        const role = profile.role as UserRole;

        return NextResponse.redirect(`${origin}${roleLandingPath(role, user.id)}`);
      }
      // Fallback if user not immediately available
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}