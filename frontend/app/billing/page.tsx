'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CreditCard, RefreshCw, ArrowUpCircle, AlertTriangle } from 'lucide-react'
import { getToken } from '@/lib/auth'
import { SubscriptionStatus, PlanName, PLAN_PRICES } from '@/lib/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

const PLAN_DISPLAY: Record<PlanName, string> = {
  free: 'Free',
  starter: 'Starter',
  growth: 'Growth',
  pro: 'Pro',
}

export default function BillingPage() {
  const router = useRouter()
  const [status, setStatus] = useState<SubscriptionStatus | null>(null)
  const [resetting, setResetting] = useState(false)
  const [resetDone, setResetDone] = useState(false)

  useEffect(() => {
    const token = getToken()
    if (!token) { router.push('/'); return }
    fetch(`${API_URL}/subscription/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(setStatus)
      .catch(() => {})
  }, [router])

  async function handleResetUsage() {
    const token = getToken()
    if (!token) return
    setResetting(true)
    try {
      await fetch(`${API_URL}/subscription/reset-usage`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      setStatus(prev => prev ? { ...prev, images_used: 0 } : prev)
      setResetDone(true)
      setTimeout(() => setResetDone(false), 3000)
    } finally {
      setResetting(false)
    }
  }

  if (!status) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const { plan, plan_status, images_used, images_limit, billing_cycle_start } = status
  const pct = Math.min((images_used / images_limit) * 100, 100)
  const barColor = pct >= 95 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-400' : 'bg-indigo-500'
  const price = PLAN_PRICES[plan]
  const isLifetime = plan === 'free'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
          ← Back
        </button>
        <h1 className="text-lg font-bold text-gray-900">Billing</h1>
        <div />
      </div>

      <div className="max-w-xl mx-auto px-6 py-10 space-y-5">

        {/* Past due warning */}
        {plan_status === 'past_due' && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Payment past due</p>
              <p className="text-xs text-amber-700 mt-0.5">Please update your payment method to keep your plan active.</p>
            </div>
          </div>
        )}

        {/* Current plan card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Current plan</p>
              <p className="text-lg font-bold text-gray-900">{PLAN_DISPLAY[plan]}</p>
            </div>
            <span className={`ml-auto text-xs font-semibold px-2.5 py-1 rounded-full ${
              plan_status === 'active' ? 'bg-green-100 text-green-700' :
              plan_status === 'past_due' ? 'bg-amber-100 text-amber-700' :
              'bg-gray-100 text-gray-600'
            }`}>
              {plan_status}
            </span>
          </div>

          {price > 0 && (
            <p className="text-2xl font-bold text-gray-900">
              ${price}<span className="text-sm font-normal text-gray-400">/month</span>
            </p>
          )}
          {price === 0 && (
            <p className="text-sm text-gray-500">No charge — Free plan</p>
          )}
          {billing_cycle_start && (
            <p className="text-xs text-gray-400">
              Current period started {new Date(billing_cycle_start).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          )}
        </div>

        {/* Usage card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">Image usage</p>
            <p className="text-sm text-gray-500">
              {images_used} / {images_limit} {isLifetime ? '(lifetime)' : 'this month'}
            </p>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
          </div>
          {pct >= 80 && (
            <p className="text-xs text-amber-600">
              {pct >= 95 ? 'Quota almost full — upgrade to keep generating.' : 'Running low — consider upgrading.'}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={() => router.push('/pricing')}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            <ArrowUpCircle className="w-4 h-4" />
            {plan === 'free' ? 'Upgrade plan' : 'Change plan'}
          </button>

          <button
            onClick={handleResetUsage}
            disabled={resetting}
            className="w-full flex items-center justify-center gap-2 bg-gray-100 text-gray-700 rounded-xl py-3 text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${resetting ? 'animate-spin' : ''}`} />
            {resetDone ? 'Usage reset!' : 'Reset usage counter (dev)'}
          </button>
        </div>

      </div>
    </div>
  )
}
