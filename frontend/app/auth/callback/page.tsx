'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { setToken } from '@/lib/auth'
import { apiGet } from '@/lib/api'
import type { BrandKitData } from '@/lib/types'

function computeCompletion(user: BrandKitData): number {
  const checks = [
    !!user.business_name,
    !!user.tone,
    !!user.target_audience,
    !!user.content_types,
    (user.products?.length ?? 0) > 0,
    !!user.instagram_handle,
    !!user.sender_email,
  ]
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

function CallbackHandler() {
  const router = useRouter()
  const params = useSearchParams()
  const [showModal, setShowModal] = useState(false)
  const [completionPct, setCompletionPct] = useState(0)

  useEffect(() => {
    const token = params.get('token')
    const isNew = params.get('is_new')
    if (!token) { router.replace('/'); return }
    setToken(token)
    if (isNew === 'true') { router.replace('/onboarding'); return }

    apiGet<BrandKitData>('/auth/me', token)
      .then(user => {
        const pct = computeCompletion(user)
        if (pct >= 100) {
          router.replace('/campaign/new')
        } else {
          setCompletionPct(pct)
          setShowModal(true)
        }
      })
      .catch(() => router.replace('/campaign/new'))
  }, [params, router])

  if (showModal) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full mx-4">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Complete your profile</h2>
          <p className="text-gray-500 text-sm mb-5">
            Your onboarding is{' '}
            <span className="font-semibold text-indigo-600">{completionPct}% complete</span>.
            Finish setting up to get the best results.
          </p>
          <div className="w-full bg-gray-100 rounded-full h-2 mb-6">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all"
              style={{ width: `${completionPct}%` }}
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => router.replace('/campaign/new')}
              className="flex-1 py-2.5 px-4 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition"
            >
              Skip for now
            </button>
            <button
              onClick={() => router.replace('/onboarding')}
              className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition"
            >
              Complete Onboarding
            </button>
          </div>
        </div>
      </div>
    )
  }

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
