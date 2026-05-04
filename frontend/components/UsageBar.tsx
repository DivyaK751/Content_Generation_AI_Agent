'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getToken } from '@/lib/auth'
import { SubscriptionStatus, PlanName, PLAN_LIMITS } from '@/lib/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

const PLAN_LABELS: Record<PlanName, string> = {
  free: 'Free',
  starter: 'Starter',
  growth: 'Growth',
  pro: 'Pro',
}

const CACHE_KEY = 'brandbuddy_sub_status'
const CACHE_TTL_MS = 60_000 // 60 seconds

function readCached(): SubscriptionStatus | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL_MS) return null
    return data as SubscriptionStatus
  } catch { return null }
}

function writeCache(data: SubscriptionStatus) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })) } catch {}
}

export function invalidateUsageCache() {
  try { localStorage.removeItem(CACHE_KEY) } catch {}
}

export default function UsageBar() {
  const router = useRouter()
  const [status, setStatus] = useState<SubscriptionStatus | null>(
    typeof window !== 'undefined' ? readCached() : null
  )

  useEffect(() => {
    const token = getToken()
    if (!token) return
    fetch(`${API_URL}/subscription/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then((data: SubscriptionStatus) => { setStatus(data); writeCache(data) })
      .catch(() => {})
  }, [])

  if (!status) return null

  const { plan, images_used, images_limit } = status
  const isLifetime = plan === 'free'
  const pct = Math.min((images_used / images_limit) * 100, 100)
  const barColor =
    pct >= 95 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-400' : 'bg-indigo-500'

  return (
    <div className="px-3 py-2 border border-white/10 rounded-lg bg-white/5 text-xs space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="font-medium text-white/70">
          {PLAN_LABELS[plan]} plan
        </span>
        {plan !== 'pro' && (
          <button
            onClick={() => router.push('/pricing')}
            className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
          >
            Upgrade
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="text-white/50">
        {images_used} / {images_limit} images{' '}
        {isLifetime ? '(lifetime)' : 'this month'}
      </div>
    </div>
  )
}
