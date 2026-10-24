'use client'

import { useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { login } from '@/server/actions/auth'
import { createClient } from '@/server/supabase/client'
import { ALLOWED_EMAIL_DOMAIN } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eye, EyeOff, Loader2 } from 'lucide-react'

export default function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const disabledParam = searchParams.get('disabled')
  const domainParam = searchParams.get('domain')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(
    disabledParam === '1'
      ? 'Your account has been disabled. Please contact the department administrator.'
      : domainParam === '1'
        ? `Only ${ALLOWED_EMAIL_DOMAIN} Google accounts are allowed to sign in.`
        : null
  )
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string
    password?: string
  }>({})
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSending, setForgotSending] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotError, setForgotError] = useState<string | null>(null)

  async function handleForgotPassword() {
    setForgotError(null)
    const emailValue = forgotEmail.trim().toLowerCase()

    if (!emailValue) {
      setForgotError('Please enter your email address.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
      setForgotError('Please enter a valid email address.')
      return
    }

    setForgotSending(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(emailValue, {
        redirectTo: `${window.location.origin}/auth/update-password`,
      })
      if (error) {
        setForgotError(error.message)
      } else {
        setForgotSent(true)
      }
    } catch {
      setForgotError('Something went wrong. Please try again.')
    } finally {
      setForgotSending(false)
    }
  }

  function validate(): boolean {
    const errors: { email?: string; password?: string } = {}

    if (!email.trim()) {
      errors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Please enter a valid email'
    }

    if (!password) {
      errors.password = 'Password is required'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleEmailLogin(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!validate()) return

    setIsSubmitting(true)
    try {
      const result = await login({ email: email.trim(), password })

      if (!result.success) {
        setError(result.error)
        return
      }
      router.push(`/dashboard/${result.role}/${result.userId}`)
    } catch {
      setError(
        'A network error occurred. Please check your connection and try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleGoogleLogin() {
    setError(null)
    setIsGoogleLoading(true)
    const supabase = createClient()
    try {
      const { error: oAuthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            hd: ALLOWED_EMAIL_DOMAIN.replace('@', ''),
            prompt: 'select_account',
          },
        },
      })

      if (oAuthError) {
        setError(oAuthError.message)
        setIsGoogleLoading(false)
      }
    } catch {
      setError('Failed to initiate Google sign-in. Please try again.')
      setIsGoogleLoading(false)
    }
  }

  return (
    <>
      <div className="mb-8 text-center">
        <div className="flex col-2 justify-center gap-3">
          <img src="/logo-icon.png" alt="AIThink" className="h-10 w-auto" />
          <img src="/logo-text.png" alt="AIThink" className="h-10 w-auto" />
        </div>

        <h1 className="text-2xl font-bold text-[#333] mt-5">Welcome Back</h1>
        <p className="mt-1 text-sm text-gray-500">Sign in to your account</p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleEmailLogin} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (fieldErrors.email)
                setFieldErrors((prev) => ({ ...prev, email: undefined }))
            }}
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect="off"
            disabled={isSubmitting || isGoogleLoading}
            aria-invalid={!!fieldErrors.email}
            className="bg-[#EBEBEB] border-0"
          />
          {fieldErrors.email && (
            <p className="text-xs text-red-500">{fieldErrors.email}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <button
              type="button"
              onClick={() => {
                setForgotError(null)
                setForgotSent(false)
                setForgotEmail(email)
                setForgotOpen(true)
              }}
              className="text-xs text-gray-500 hover:text-[#660111] hover:underline cursor-pointer"
            >
              Forgot Password?
            </button>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (fieldErrors.password)
                  setFieldErrors((prev) => ({
                    ...prev,
                    password: undefined,
                  }))
              }}
              autoComplete="current-password"
              disabled={isSubmitting || isGoogleLoading}
              aria-invalid={!!fieldErrors.password}
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
          {fieldErrors.password && (
            <p className="text-xs text-red-500">{fieldErrors.password}</p>
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
              Signing in...
            </>
          ) : (
            'Sign In'
          )}
        </Button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <Separator className="bg-gray-200" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-gray-400">Or continue with</span>
        </div>
      </div>

      <Button
        variant="outline"
        type="button"
        className="w-full"
        onClick={handleGoogleLogin}
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
        Don&apos;t have an account?{' '}
        <Link
          href="/register"
          className="font-medium text-[#660111] hover:underline"
        >
          Create Account
        </Link>
      </p>

      <p className="mt-3 text-center text-xs text-gray-400 sm:-mx-8">
        By signing in you agree to our{' '}
        <Link
          href="/terms"
          className="font-medium text-[#8B1A1A] hover:underline"
        >
          Terms &amp; Conditions and Privacy Policy
        </Link>
      </p>

      <Dialog
        open={forgotOpen}
        onOpenChange={(open) => {
          setForgotOpen(open)
          if (!open) setForgotSent(false)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Forgot Password?</DialogTitle>
            <DialogDescription>
              Enter the email you signed up with and we&apos;ll send you a link
              to reset your password.
            </DialogDescription>
          </DialogHeader>

          {forgotSent ? (
            <div className="mt-2 space-y-4">
              <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                If an account exists for{' '}
                <span className="font-medium">{forgotEmail}</span>, a
                password-reset link has been sent. Check your inbox (and spam
                folder).
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setForgotOpen(false)}
                >
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-2 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email">Email Address</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="you@example.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleForgotPassword()
                    }
                  }}
                  className="bg-[#EBEBEB] border-0"
                  autoComplete="email"
                />
              </div>
              {forgotError && (
                <p className="text-sm text-red-600">{forgotError}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setForgotOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="bg-green-600 hover:bg-green-700 text-white cursor-pointer"
                  disabled={forgotSending}
                  onClick={handleForgotPassword}
                >
                  {forgotSending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Send Reset Link'
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}