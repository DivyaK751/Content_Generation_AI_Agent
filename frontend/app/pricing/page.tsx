'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Zap } from 'lucide-react'
import { getToken } from '@/lib/auth'
import { invalidateUsageCache } from '@/components/UsageBar'
import {
  PlanName,
  PLAN_PRICES,
  PLAN_FEATURES,
  SubscriptionStatus,
} from '@/lib/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

const PLAN_NAMES: PlanName[] = ['free', 'starter', 'growth', 'pro']

const PLAN_DISPLAY: Record<PlanName, string> = {
  free: 'Free',
  starter: 'Starter',
  growth: 'Growth',
  pro: 'Pro',
}

const PLAN_TAGLINES: Record<PlanName, string> = {
  free: 'Get started, no credit card needed',
  starter: 'Perfect for solo creators',
  growth: 'Scale your content strategy',
  pro: 'Full power for serious brands',
}

export default function PricingPage() {
  const router = useRouter()
  const [currentStatus, setCurrentStatus] = useState<SubscriptionStatus | null>(null)
  const [loading, setLoading] = useState<PlanName | null>(null)
  const [successPlan, setSuccessPlan] = useState<PlanName | null>(null)

  useEffect(() => {
    const token = getToken()
    if (!token) return
    fetch(`${API_URL}/subscription/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(setCurrentStatus)
      .catch(() => {})
  }, [])

  async function handleUpgrade(plan: PlanName) {
    const token = getToken()
    if (!token) {
      router.push('/')
      return
    }
    if (plan === 'free') {
      setLoading('free')
      try {
        await fetch(`${API_URL}/subscription/downgrade`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
        setCurrentStatus(prev => prev ? { ...prev, plan: 'free', images_limit: 30 } : prev)
        setSuccessPlan('free')
        invalidateUsageCache()
      } finally {
        setLoading(null)
      }
      return
    }

    setLoading(plan)
    try {
      const resp = await fetch(`${API_URL}/subscription/upgrade`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan }),
      })
      if (resp.ok) {
        const data = await resp.json()
        setCurrentStatus(prev =>
          prev
            ? { ...prev, plan, images_limit: data.images_limit, images_used: 0, can_post_instagram: true, can_schedule: plan === 'growth' || plan === 'pro' }
            : prev
        )
        setSuccessPlan(plan)
        invalidateUsageCache()
      }
    } finally {
      setLoading(null)
    }
  }

  const currentPlan = currentStatus?.plan ?? null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
          ← Back
        </button>
        <h1 className="text-lg font-bold text-gray-900">Pricing</h1>
        <div />
      </div>

      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">Simple pricing for every stage</h2>
          <p className="text-gray-500 text-base">Generate stunning branded content. Upgrade or downgrade anytime.</p>
        </div>

        {/* Success banner */}
        {successPlan && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-800 rounded-xl px-5 py-3 text-sm font-medium text-center">
            You are now on the {PLAN_DISPLAY[successPlan]} plan — no payment required in demo mode.{' '}
            <button onClick={() => router.push('/dashboard')} className="underline">
              Go to Dashboard →
            </button>
          </div>
        )}

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {PLAN_NAMES.map(plan => {
            const price = PLAN_PRICES[plan]
            const features = PLAN_FEATURES[plan]
            const isCurrent = currentPlan === plan
            const isPopular = plan === 'growth'
            const isLoading = loading === plan

            return (
              <div
                key={plan}
                className={`relative rounded-2xl p-6 flex flex-col gap-5 transition-all border ${
                  isPopular
                    ? 'border-indigo-500 bg-indigo-600 text-white shadow-xl shadow-indigo-200'
                    : 'border-gray-200 bg-white text-gray-900'
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-amber-400 text-amber-900 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                      <Zap className="w-3 h-3" /> Most Popular
                    </span>
                  </div>
                )}

                {/* Plan name + price */}
                <div>
                  <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${isPopular ? 'text-indigo-200' : 'text-indigo-600'}`}>
                    {PLAN_DISPLAY[plan]}
                  </p>
                  <div className="flex items-end gap-1">
                    <span className="text-3xl font-bold">${price}</span>
                    {price > 0 && <span className={`text-sm pb-0.5 ${isPopular ? 'text-indigo-200' : 'text-gray-400'}`}>/mo</span>}
                  </div>
                  <p className={`text-xs mt-1.5 ${isPopular ? 'text-indigo-200' : 'text-gray-500'}`}>
                    {PLAN_TAGLINES[plan]}
                  </p>
                </div>

                {/* Features */}
                <ul className="space-y-2 flex-1">
                  {features.map(f => (
                    <li key={f.label} className="flex items-start gap-2 text-sm">
                      {f.included ? (
                        <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isPopular ? 'text-indigo-200' : 'text-indigo-500'}`} />
                      ) : (
                        <X className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isPopular ? 'text-indigo-400' : 'text-gray-300'}`} />
                      )}
                      <span className={f.included ? '' : (isPopular ? 'text-indigo-300' : 'text-gray-400')}>
                        {f.label}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {isCurrent ? (
                  <div className={`w-full text-center text-sm font-semibold py-2.5 rounded-xl ${isPopular ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-700'}`}>
                    Current plan
                  </div>
                ) : (
                  <button
                    onClick={() => handleUpgrade(plan)}
                    disabled={isLoading}
                    className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      isPopular
                        ? 'bg-white text-indigo-700 hover:bg-indigo-50'
                        : plan === 'free'
                        ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    } disabled:opacity-60`}
                  >
                    {isLoading
                      ? 'Activating…'
                      : plan === 'free'
                      ? 'Downgrade to Free'
                      : `Get ${PLAN_DISPLAY[plan]}`}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">
          Demo mode — plans switch instantly with no payment required. Real billing can be wired later.
        </p>
      </div>
    </div>
  )
}
