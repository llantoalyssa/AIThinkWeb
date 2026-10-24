"use client";

import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { EmailOtpType } from "@supabase/supabase-js";
import { toast } from "sonner";
import { updatePassword } from "@/server/actions/auth";
import { createClient } from "@/server/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export default function UpdatePasswordPage() {
  return (
    <Suspense fallback={null}>
      <UpdatePasswordForm />
    </Suspense>
  );
}

function UpdatePasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [verifying, setVerifying] = useState(true);
  const [sessionOk, setSessionOk] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (doneRef.current) return;
      const supabase = createClient();
      const tokenHash = searchParams.get("token_hash");
      const otpType = searchParams.get("type");
      const code = searchParams.get("code");
      if (tokenHash && otpType) {
        const { error } = await supabase.auth.verifyOtp({
          type: otpType as EmailOtpType,
          token_hash: tokenHash,
        });
        doneRef.current = true;
        if (cancelled) return;
        if (error) {
          console.error("[update-password] verifyOtp failed:", error);
          setSessionOk(false);
          setVerifying(false);
          setError(
            error.message ||
              "Invalid or expired reset link. Please request a new one.",
          );
          return;
        }
        setSessionOk(true);
        setVerifying(false);

        router.replace("/auth/update-password", { scroll: false });
        return;
      }
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        doneRef.current = true;
        if (cancelled) return;
        if (error) {
          console.error("[update-password] Code exchange failed:", error);
          const isPkce = /code verifier/i.test(error.message || "");
          setSessionOk(false);
          setVerifying(false);
          setError(
            isPkce
              ? "This reset link belongs to a different browser or device (it was generated before the new email template). Request a fresh reset email and open it here."
              : error.message ||
                  "Invalid or expired reset link. Please request a new one.",
          );
          return;
        }
        setSessionOk(true);
        setVerifying(false);
        router.replace("/auth/update-password", { scroll: false });
        return;
      }
      await Promise.resolve();
      if (cancelled) return;
      setSessionOk(false);
      setVerifying(false);
      setError("Invalid or expired reset link. Please request a new one.");
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [searchParams, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    const result = await updatePassword(password);
    if (!result.success) {
      setSubmitting(false);
      setError(result.error);
      return;
    }
    try {
      await createClient().auth.signOut();
    } catch {

    }

    setSubmitting(false);
    toast.success("Password updated. Please sign in with your new password.");
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 sm:px-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center gap-3">
          <img src="/logo-icon.png" alt="AIThink" className="h-10 w-auto" />
          <img src="/logo-text.png" alt="AIThink" className="h-10 w-auto" />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          {verifying ? (
            <div className="flex flex-col items-center justify-center py-10">
              <Loader2 className="h-7 w-7 animate-spin text-[#8B1A1A]" />
              <p className="mt-3 text-sm text-gray-400">
                Verifying your reset link…
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-[#333]">Set a new password</h1>
              <p className="mt-1 mb-6 text-sm text-gray-500">
                Choose a new password for your account.
              </p>

              {error && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                  <span className="mt-1 block text-xs">
                    You can request a new link from the{" "}
                    <Link href="/login" className="underline">
                      login page
                    </Link>
                    .
                  </span>
                </div>
              )}

              {sessionOk && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-password">New Password</Label>
                    <div className="relative">
                      <Input
                        id="new-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Min. 8 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        disabled={submitting}
                        className="bg-[#EBEBEB] border-0 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        tabIndex={-1}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirm-password">Confirm New Password</Label>
                    <div className="relative">
                      <Input
                        id="confirm-password"
                        type={showConfirm ? "text" : "password"}
                        placeholder="Re-enter your password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        disabled={submitting}
                        className="bg-[#EBEBEB] border-0 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(!showConfirm)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        tabIndex={-1}
                      >
                        {showConfirm ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-green-600 hover:bg-green-700 text-white cursor-pointer"
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      "Update Password"
                    )}
                  </Button>
                </form>
              )}
            </>
          )}
        </div>

        <div className="mt-6 text-center text-sm text-gray-500">
          Remembered your password?{" "}
          <Link href="/login" className="font-medium text-[#660111] hover:underline">
            Back to Login
          </Link>
        </div>
        <Separator className="my-6" />
      </div>
    </div>
  );
}