'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/AppLayout'
import { apiGet } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { CalendarDays, TrendingUp, ArrowRight, Mail, CheckCircle2, Loader2 } from 'lucide-react'
import InstagramIcon from '@/components/InstagramIcon'

interface Campaign {
  campaign_id: string
  channels: string        // JSON e.g. '["instagram","email"]'
  mode: string
  theme: string
  status: string
  created_at: string
}

interface BrandKit {
  business_name?: string
}

function parseChannels(raw: string): string[] {
  try { return JSON.parse(raw) } catch { return [] }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function platformLabel(channels: string[]): string {
  const ig = channels.includes('instagram')
  const em = channels.includes('email')
  if (ig && em) return 'Instagram + Email'
  if (ig) return 'Instagram'
  if (em) return 'Email'
  return '—'
}

export default function DashboardPage() {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [businessName, setBusinessName] = useState<string>(
    () => { try { return localStorage.getItem('brandbuddy_business_name') ?? '' } catch { return '' } }
  )
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (!token) { router.replace('/'); return }

    Promise.all([
      apiGet<{ campaigns: Campaign[] }>('/campaigns', token),
      apiGet<BrandKit>('/brand-kit', token),
    ])
      .then(([campaignData, kitData]) => {
        setCampaigns(campaignData.campaigns)
        const name = kitData.business_name ?? ''
        setBusinessName(name)
        try { if (name) localStorage.setItem('brandbuddy_business_name', name) } catch {}
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [router])

  const igCount = campaigns.filter(c => parseChannels(c.channels).includes('instagram')).length
  const emailCount = campaigns.filter(c => parseChannels(c.channels).includes('email')).length
  const recentCampaigns = campaigns.slice(0, 5)

  return (
    <AppLayout>
      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            {businessName ? `Welcome back, ${businessName} 👋` : 'Welcome back 👋'}
          </h1>
          <p className="text-gray-500 mt-1 text-sm">What would you like to create today?</p>
        </div>

        {/* Mode Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
          <button
            onClick={() => router.push('/campaign/new')}
            className="bg-white border border-gray-200 rounded-2xl p-6 text-left hover:border-indigo-300 hover:shadow-md transition-all group"
          >
            <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center mb-4">
              <CalendarDays className="w-6 h-6 text-amber-500" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Create for an Occasion</h2>
            <p className="text-sm text-gray-500 leading-relaxed mb-4">
              Generate content for a specific event — Diwali, Christmas, a product launch, or any custom occasion.
            </p>
            <div className="flex items-center gap-1.5 text-indigo-600 text-sm font-medium group-hover:gap-2.5 transition-all">
              Start creating <ArrowRight className="w-4 h-4" />
            </div>
          </button>

          <button
            onClick={() => router.push('/campaign/new')}
            className="bg-white border border-gray-200 rounded-2xl p-6 text-left hover:border-indigo-300 hover:shadow-md transition-all group"
          >
            <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center mb-4">
              <TrendingUp className="w-6 h-6 text-emerald-500" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Ride a Current Trend</h2>
            <p className="text-sm text-gray-500 leading-relaxed mb-4">
              Discover what&apos;s trending in your location and globally, then generate content tailored to your brand.
            </p>
            <div className="flex items-center gap-1.5 text-indigo-600 text-sm font-medium group-hover:gap-2.5 transition-all">
              Explore trends <ArrowRight className="w-4 h-4" />
            </div>
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            {loading ? <div className="w-12 h-7 bg-gray-100 rounded animate-pulse mb-1" /> : (
              <p className="text-2xl font-bold text-gray-900">{campaigns.length}</p>
            )}
            <p className="text-sm font-medium text-gray-700 mt-0.5">Total Campaigns</p>
            <p className="text-xs text-gray-400 mt-0.5">All time</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            {loading ? <div className="w-8 h-7 bg-gray-100 rounded animate-pulse mb-1" /> : (
              <p className="text-2xl font-bold text-gray-900">{igCount}</p>
            )}
            <p className="text-sm font-medium text-gray-700 mt-0.5">Instagram Posts</p>
            <p className="text-xs text-gray-400 mt-0.5">Published</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            {loading ? <div className="w-8 h-7 bg-gray-100 rounded animate-pulse mb-1" /> : (
              <p className="text-2xl font-bold text-gray-900">{emailCount}</p>
            )}
            <p className="text-sm font-medium text-gray-700 mt-0.5">Emails Sent</p>
            <p className="text-xs text-gray-400 mt-0.5">All time</p>
          </div>
        </div>

        {/* Recent Campaigns */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Recent Campaigns</h2>
            {!loading && (
              <button
                onClick={() => router.push('/projects')}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
              >
                View all →
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : campaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-gray-400 text-sm mb-3">No campaigns yet.</p>
              <button
                onClick={() => router.push('/campaign/new')}
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Create your first campaign →
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase tracking-wide bg-gray-50">
                  <th className="px-6 py-3 font-medium">Campaign</th>
                  <th className="px-6 py-3 font-medium">Published</th>
                  <th className="px-6 py-3 font-medium">Platform</th>
                  <th className="px-6 py-3 font-medium">Mode</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentCampaigns.map((c) => {
                  const ch = parseChannels(c.channels)
                  return (
                    <tr key={c.campaign_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900 max-w-[200px] truncate">
                        {c.theme || '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {c.created_at ? formatDate(c.created_at) : '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        <div className="flex items-center gap-1.5">
                          {ch.includes('instagram') && <InstagramIcon className="w-3.5 h-3.5 text-pink-500" />}
                          {ch.includes('email') && <Mail className="w-3.5 h-3.5 text-indigo-500" />}
                          {platformLabel(ch)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 capitalize">{c.mode || '—'}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                          <CheckCircle2 className="w-3 h-3" />
                          Published
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </AppLayout>
  )
}
