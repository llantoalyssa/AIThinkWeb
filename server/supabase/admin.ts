import { createClient } from "@supabase/supabase-js";

// ============================================================
// Admin (service-role) Supabase client — used ONLY on the server
// for privileged auth operations the department needs, like
// creating users with a department-chosen password, created
// ALREADY CONFIRMED (admin.createUser with email_confirm: true)
// so no verification email is sent and the user can sign in
// immediately. The service-role key bypasses RLS, so this must
// never be imported from a client component.
// ============================================================

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}