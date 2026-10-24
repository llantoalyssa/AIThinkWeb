'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { getCurrentUser } from '@/server/actions/auth'

export default function DashboardRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    async function redirectToRoleDashboard() {
      const user = await getCurrentUser()

      if (!user) {
        router.replace('/login')
        return
      }
      router.replace(`/dashboard/${user.role}`)
    }

    redirectToRoleDashboard()
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[#8B1A1A]" />
    </div>
  )
}