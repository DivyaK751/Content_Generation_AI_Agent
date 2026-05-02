'use client'
import { useState, useEffect } from 'react'
import AppLayout from '@/components/AppLayout'
import { apiGet } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { Mail, ChevronDown, ChevronUp, Loader2, ImageOff, Heart, MessageCircle } from 'lucide-react'
import InstagramIcon from '@/components/InstagramIcon'

interface Campaign {
  campaign_id: string
  channels: string       // JSON string e.g. '["instagram","email"]'
  mode: string
  theme: string
  image_url: string
  all_image_urls?: string  // JSON string e.g. '["url1","url2","url3"]'
  caption: string
  email_subject: string
  email_body: string
  instagram_post_id: string
  sendgrid_message_id: string
  status: string
  created_at: string
}

function parseChannels(raw: string): string[] {
  try { return JSON.parse(raw) } catch { return [] }
}

function parseImages(raw?: string): string[] {
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Instagram campaign card ───────────────────────────────────────────────────
function InstagramCard({ campaign }: { campaign: Campaign }) {
  const images = parseImages(campaign.all_image_urls)
  const primaryImage = campaign.image_url || images[0] || null
  const [likes, setLikes] = useState<number | null>(null)
  const [comments, setComments] = useState<number | null>(null)

  useEffect(() => {
    if (!campaign.instagram_post_id) return
    const token = getToken()
    if (!token) return
    apiGet<{ like_count?: number; comments_count?: number }>(
      `/campaigns/ig-stats/${campaign.instagram_post_id}`, token
    )
      .then(d => {
        if (d.like_count != null) setLikes(d.like_count)
        if (d.comments_count != null) setComments(d.comments_count)
      })
      .catch(() => {})
  }, [campaign.instagram_post_id])

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-sm transition-shadow">
      {/* Image */}
      <div className="aspect-square w-full overflow-hidden bg-gray-100">
        {primaryImage ? (
          <img src={primaryImage} alt={campaign.theme} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <ImageOff className="w-8 h-8" />
          </div>
        )}
      </div>

      <div className="px-4 pb-4 pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">{formatDate(campaign.created_at)}</span>
          <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">Published</span>
        </div>
        {(likes != null || comments != null) && (
          <div className="flex items-center gap-3 mt-1">
            {likes != null && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Heart className="w-3.5 h-3.5 text-pink-400" /> {likes.toLocaleString()}
              </span>
            )}
            {comments != null && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <MessageCircle className="w-3.5 h-3.5 text-indigo-400" /> {comments.toLocaleString()}
              </span>
            )}
          </div>
        )}

        {campaign.theme && (
          <p className="text-sm font-semibold text-gray-900 leading-snug">{campaign.theme}</p>
        )}

        {campaign.caption && (
          <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">{campaign.caption}</p>
        )}

        {/* Extra images strip */}
        {images.length > 1 && (
          <div className="flex gap-1.5 pt-1">
            {images.slice(0, 3).map((url, i) => (
              <div key={i} className="w-10 h-10 rounded-lg overflow-hidden border border-gray-100 flex-shrink-0">
                <img src={url} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
            {images.length > 3 && (
              <div className="w-10 h-10 rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center text-[10px] text-gray-400 font-medium">
                +{images.length - 3}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Email campaign card ───────────────────────────────────────────────────────
function EmailCard({ campaign }: { campaign: Campaign }) {
  const [expanded, setExpanded] = useState(false)
  if (!campaign.email_subject) return null
  const bodyPreview = campaign.email_body?.slice(0, 120)

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-sm transition-shadow">
      <div className="p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <Mail className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-gray-400">{formatDate(campaign.created_at)}</p>
              <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full flex-shrink-0">Delivered</span>
            </div>
            {campaign.theme && (
              <p className="text-xs text-gray-500 mt-0.5 truncate">{campaign.theme}</p>
            )}
          </div>
        </div>

        <p className="text-sm font-semibold text-gray-900 mb-1">{campaign.email_subject}</p>
        {bodyPreview && !expanded && (
          <p className="text-xs text-gray-400 mb-3 leading-relaxed">{bodyPreview}…</p>
        )}

        {campaign.email_body && (
          <>
            <button
              onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
            >
              {expanded ? <><ChevronUp className="w-3.5 h-3.5" /> Hide email</> : <><ChevronDown className="w-3.5 h-3.5" /> View email</>}
            </button>
            {expanded && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 leading-relaxed whitespace-pre-line border border-gray-100">
                {campaign.email_body}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
type Tab = 'instagram' | 'email'

export default function ProjectsPage() {
  const [tab, setTab] = useState<Tab>('instagram')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = getToken()
    if (!token) { setLoading(false); return }
    apiGet<{ campaigns: Campaign[] }>('/campaigns', token)
      .then(data => setCampaigns(data.campaigns))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const instagramCampaigns = campaigns.filter(c => parseChannels(c.channels).includes('instagram'))
  const emailCampaigns = campaigns.filter(c => parseChannels(c.channels).includes('email'))

  return (
    <AppLayout>
      <main className="max-w-5xl mx-auto px-8 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Previous Projects</h1>
          <p className="text-gray-500 text-sm mt-1">Your full history of published campaigns.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Total Campaigns', value: loading ? '—' : String(campaigns.length) },
            { label: 'Instagram Posts', value: loading ? '—' : String(instagramCampaigns.length) },
            { label: 'Emails Sent', value: loading ? '—' : String(emailCampaigns.length) },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-sm text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Toggle */}
        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={() => setTab('instagram')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
              tab === 'instagram'
                ? 'bg-pink-50 border-pink-200 text-pink-700'
                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            <InstagramIcon className="w-4 h-4" />
            Instagram
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === 'instagram' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-400'}`}>
              {instagramCampaigns.length}
            </span>
          </button>

          <button
            onClick={() => setTab('email')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
              tab === 'email'
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            <Mail className="w-4 h-4" />
            Email
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === 'email' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>
              {emailCampaigns.length}
            </span>
          </button>
        </div>

        {/* Loading / error */}
        {loading && (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading campaigns…
          </div>
        )}
        {error && (
          <p className="text-sm text-red-500 py-10 text-center">{error}</p>
        )}

        {/* Empty */}
        {!loading && !error && campaigns.length === 0 && (
          <div className="text-center py-20 text-gray-400 text-sm">
            No published campaigns yet. Start a new campaign to see it here.
          </div>
        )}

        {/* Instagram grid */}
        {!loading && tab === 'instagram' && instagramCampaigns.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {instagramCampaigns.map(c => (
              <InstagramCard key={c.campaign_id} campaign={c} />
            ))}
          </div>
        )}

        {/* Email list */}
        {!loading && tab === 'email' && emailCampaigns.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {emailCampaigns.map(c => (
              <EmailCard key={c.campaign_id} campaign={c} />
            ))}
          </div>
        )}

        {/* Tab-specific empty */}
        {!loading && !error && campaigns.length > 0 && tab === 'instagram' && instagramCampaigns.length === 0 && (
          <p className="text-sm text-gray-400 py-10 text-center">No Instagram campaigns yet.</p>
        )}
        {!loading && !error && campaigns.length > 0 && tab === 'email' && emailCampaigns.length === 0 && (
          <p className="text-sm text-gray-400 py-10 text-center">No email campaigns yet.</p>
        )}
      </main>
    </AppLayout>
  )
}
