'use client'
import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { setToken } from '@/lib/auth'

function CallbackHandler() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const token = params.get('token')
    const isNew = params.get('is_new')
    if (!token) { router.replace('/'); return }
    setToken(token)
    router.replace(isNew === 'true' ? '/onboarding' : '/campaign/new')
  }, [params, router])

  return <p className="text-gray-500 text-sm">Signing you in…</p>
}

export default function AuthCallbackPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Suspense fallback={<p className="text-gray-500 text-sm">Loading…</p>}>
        <CallbackHandler />
      </Suspense>
    </div>
  )
}
