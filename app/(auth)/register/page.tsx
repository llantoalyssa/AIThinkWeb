"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { register } from "@/server/actions/auth";
import { createClient } from "@/server/supabase/client";
import { ALLOWED_EMAIL_DOMAIN } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff, Loader2 } from "lucide-react";

const NAME_ALLOWED_RE = /^[\p{L} .'-]+$/u;

const SUFFIX_ALLOWED_RE = /^[\p{L} .,'-]+$/u;
const NAME_DISALLOWED_RE = /[^\p{L} .'-]/gu;
const SUFFIX_DISALLOWED_RE = /[^\p{L} .,'-]/gu;
function sanitizeName(value: string, allowComma = false): string {
  return value.replace(allowComma ? SUFFIX_DISALLOWED_RE : NAME_DISALLOWED_RE, "");
}

const NAME_ERROR =
  "Only letters are allowed (spaces, hyphen, apostrophe and period are OK)";

export default function RegisterForm() {
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleInitial, setMiddleInitial] = useState("");
  const [suffix, setSuffix] = useState("");
  const [srCode, setSrCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    firstName?: string;
    lastName?: string;
    middleInitial?: string;
    suffix?: string;
    srCode?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  function validate(): boolean {
    const errors: typeof fieldErrors = {};

    if (!firstName.trim()) {
      errors.firstName = "First name is required";
    } else if (firstName.trim().length < 2) {
      errors.firstName = "First name must be at least 2 characters";
    } else if (!NAME_ALLOWED_RE.test(firstName.trim())) {
      errors.firstName = NAME_ERROR;
    }

    if (!lastName.trim()) {
      errors.lastName = "Last name is required";
    } else if (lastName.trim().length < 2) {
      errors.lastName = "Last name must be at least 2 characters";
    } else if (!NAME_ALLOWED_RE.test(lastName.trim())) {
      errors.lastName = NAME_ERROR;
    }

    if (middleInitial.trim() && !/^[A-Za-z]$/.test(middleInitial.trim())) {
      errors.middleInitial = "Middle initial must be a single letter (e.g. M)";
    }

    if (suffix.trim() && !SUFFIX_ALLOWED_RE.test(suffix.trim())) {
      errors.suffix = NAME_ERROR;
    }

    if (!srCode.trim()) {
      errors.srCode = "SR code is required";
    }

    if (!email.trim()) {
      errors.email = "Email is required";
    } else if (!email.toLowerCase().endsWith(ALLOWED_EMAIL_DOMAIN)) {
      errors.email = `Must be a valid ${ALLOWED_EMAIL_DOMAIN} email`;
    } else {
      const emailLocalPart = email.trim().toLowerCase().split("@")[0];
      const srNorm = srCode.trim().toLowerCase();
      if (srNorm && emailLocalPart !== srNorm) {
        errors.email = `Email must match your SR code (e.g. ${srCode.trim()}${ALLOWED_EMAIL_DOMAIN})`;
      }
    }

    if (!password) {
      errors.password = "Password is required";
    } else if (password.length < 8) {
      errors.password = "Password must be at least 8 characters";
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function clearFieldError(field: keyof typeof fieldErrors) {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }
  function formatSrCode(raw: string): string {
    const digits = raw.replace(/\D/g, "").slice(0, 7);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  }

  async function handleGoogleSignIn() {
    setError(null);
    setIsGoogleLoading(true);
    const supabase = createClient();
    try {
      const { error: oAuthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            hd: ALLOWED_EMAIL_DOMAIN.replace("@", ""),
            prompt: "select_account",
          },
        },
      });
      if (oAuthError) {
        setError(oAuthError.message);
        setIsGoogleLoading(false);
      }
    } catch {
      setError("Failed to initiate Google sign-in. Please try again.");
      setIsGoogleLoading(false);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const result = await register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        middleInitial: middleInitial.trim() || undefined,
        suffix: suffix.trim() || undefined,
        srCode: srCode.trim(),
        email: email.trim(),
        password,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      router.push("/login");
    } catch {
      setError("A network error occurred. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-[#333]">Create Account</h1>
        <p className="mt-1 text-sm text-gray-500">Fill in your details to get started</p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleRegister} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="first_name">First Name</Label>
            <Input
              id="first_name"
              type="text"
              placeholder="Juan"
              value={firstName}
              onChange={(e) => {
                setFirstName(sanitizeName(e.target.value));
                clearFieldError("firstName");
              }}
              autoCapitalize="words"
              autoComplete="given-name"
              disabled={isSubmitting}
              aria-invalid={!!fieldErrors.firstName}
            />
            {fieldErrors.firstName && (
              <p className="text-xs text-red-500">{fieldErrors.firstName}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="last_name">Last Name</Label>
            <Input
              id="last_name"
              type="text"
              placeholder="Dela Cruz"
              value={lastName}
              onChange={(e) => {
                setLastName(sanitizeName(e.target.value));
                clearFieldError("lastName");
              }}
              autoCapitalize="words"
              autoComplete="family-name"
              disabled={isSubmitting}
              aria-invalid={!!fieldErrors.lastName}
            />
            {fieldErrors.lastName && (
              <p className="text-xs text-red-500">{fieldErrors.lastName}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="middle_initial">Middle Initial <span className="text-gray-400 font-normal">(optional)</span></Label>
            <Input
              id="middle_initial"
              type="text"
              placeholder="M"
              value={middleInitial}
              onChange={(e) => {
                setMiddleInitial(
                  e.target.value.replace(/[^A-Za-z]/g, "").slice(0, 1),
                );
                clearFieldError("middleInitial");
              }}
              maxLength={1}
              autoCapitalize="characters"
              autoComplete="additional-name"
              disabled={isSubmitting}
              aria-invalid={!!fieldErrors.middleInitial}
            />
            {fieldErrors.middleInitial && (
              <p className="text-xs text-red-500">{fieldErrors.middleInitial}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="suffix">Suffix <span className="text-gray-400 font-normal">(optional)</span></Label>
            <Input
              id="suffix"
              type="text"
              placeholder="Jr., III"
              value={suffix}
              onChange={(e) => {
                setSuffix(sanitizeName(e.target.value, true));
                clearFieldError("suffix");
              }}
              autoCapitalize="words"
              autoComplete="honorific-suffix"
              disabled={isSubmitting}
              aria-invalid={!!fieldErrors.suffix}
            />
            {fieldErrors.suffix && (
              <p className="text-xs text-red-500">{fieldErrors.suffix}</p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sr_code">SR Code</Label>
          <Input
            id="sr_code"
            type="text"
            placeholder="e.g. 00-00000"
            value={srCode}
            onChange={(e) => {
              setSrCode(formatSrCode(e.target.value));
              clearFieldError("srCode");
            }}
            maxLength={8}
            inputMode="numeric"
            autoCapitalize="characters"
            autoComplete="off"
            disabled={isSubmitting}
            aria-invalid={!!fieldErrors.srCode}
          />
          {fieldErrors.srCode && (
            <p className="text-xs text-red-500">{fieldErrors.srCode}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">School Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@g.batstate-u.edu.ph"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearFieldError("email");
            }}
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect="off"
            disabled={isSubmitting}
            aria-invalid={!!fieldErrors.email}
          />
          {fieldErrors.email ? (
            <p className="text-xs text-red-500">{fieldErrors.email}</p>
          ) : (
            <p className="text-xs text-gray-400">
              Only @g.batstate-u.edu.ph emails are accepted
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Min. 8 characters"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearFieldError("password");
              }}
              autoComplete="new-password"
              disabled={isSubmitting}
              aria-invalid={!!fieldErrors.password}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {fieldErrors.password && (
            <p className="text-xs text-red-500">{fieldErrors.password}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm_password">Confirm Password</Label>
          <div className="relative">
            <Input
              id="confirm_password"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                clearFieldError("confirmPassword");
              }}
              autoComplete="new-password"
              disabled={isSubmitting}
              aria-invalid={!!fieldErrors.confirmPassword}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {fieldErrors.confirmPassword && (
            <p className="text-xs text-red-500">{fieldErrors.confirmPassword}</p>
          )}
        </div>

        <Button
          type="submit"
          className="w-full bg-green-600 hover:bg-green-700 text-white cursor-pointer"
          disabled={isSubmitting || isGoogleLoading}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating account...
            </>
          ) : (
            "Create Account"
          )}
        </Button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <Separator className="bg-gray-200" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-gray-400">Or sign up with</span>
        </div>
      </div>

      <Button
        variant="outline"
        type="button"
        className="w-full"
        onClick={handleGoogleSignIn}
        disabled={isSubmitting || isGoogleLoading}
      >
        {isGoogleLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <svg className="mr-2 h-4 w-4" aria-hidden="true" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
        )}
        Continue with Google
      </Button>

      <p className="mt-6 text-center text-sm text-gray-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-[#660111] hover:underline">
          Back to Login
        </Link>
      </p>
    </>
  );
}