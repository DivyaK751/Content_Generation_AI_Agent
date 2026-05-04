'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AppLayout from '@/components/AppLayout'
import { ArrowLeft, Calendar, Mail, Check, TrendingUp } from 'lucide-react'
import InstagramIcon from '@/components/InstagramIcon'
import type { StoredSession } from '@/lib/types'
import { sessionsKey } from '@/lib/auth'

type ChatMsg = {
  id: string
  from: 'user' | 'ai'
  kind: string
  text?: string
  trendOptions?: { title: string; description?: string }[]
  contentData?: { images: string[]; captions: string[]; emails: { subject: string; body: string }[] }
  publishResult?: {
    channels?: string[]
    image_url?: string
    all_image_urls?: string[]
    caption?: string
    email_subject?: string
    email_body?: string
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function SessionDetailPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const [session, setSession] = useState<StoredSession | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    // Static export serves /_/index.html for all /sessions/<uuid> paths via nginx
    // catch-all, so useParams() may return '_' instead of the real UUID.
    // Read the actual id from the URL as the authoritative source.
    const urlId = window.location.pathname.split('/sessions/')[1]?.replace(/\/$/, '') || id
    try {
      const all: StoredSession[] = JSON.parse(localStorage.getItem(sessionsKey()) ?? '[]')
      const found = all.find(s => s.id === urlId)
      if (found) setSession(found)
      else setNotFound(true)
    } catch {
      setNotFound(true)
    }
  }, [id])

  if (notFound) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full text-gray-400 text-sm py-40">Session not found.</div>
      </AppLayout>
    )
  }

  if (!session) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full text-gray-400 text-sm py-40">Loading…</div>
      </AppLayout>
    )
  }

  const msgs = session.messages as ChatMsg[]
  const finalizeMsg = msgs.find(m => m.kind === 'finalize')
  const publishResult = finalizeMsg?.publishResult

  // Use channels array for accurate badge determination — avoids falsy {} objects
  const channels: string[] = (publishResult?.channels ?? []) as string[]
  const hasInstagram = channels.includes('instagram')
  const hasEmail = channels.includes('email')

  // Only show images for Instagram campaigns
  const allImages: string[] = hasInstagram
    ? (publishResult?.all_image_urls?.length
        ? publishResult.all_image_urls
        : publishResult?.image_url
          ? [publishResult.image_url]
          : (msgs.find(m => m.kind === 'content')?.contentData?.images ?? []))
    : []

  const publishedImageUrl = publishResult?.image_url ?? allImages[0] ?? null

  const publishedText = hasInstagram && hasEmail
    ? 'Published to Instagram & Email'
    : hasInstagram
      ? 'Published to Instagram'
      : 'Email sent'

  return (
    <AppLayout>
      <main className="max-w-2xl mx-auto px-8 py-10">
        {/* Back */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 break-words">{session.title}</h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="flex items-center gap-1.5 text-sm text-gray-400">
              <Calendar className="w-3.5 h-3.5" /> {formatDate(session.date)}
            </span>
            {hasInstagram && (
              <span className="flex items-center gap-1.5 text-xs bg-pink-50 text-pink-700 border border-pink-100 px-2.5 py-0.5 rounded-full font-medium">
                <InstagramIcon className="w-3 h-3" /> Instagram
              </span>
            )}
            {hasEmail && (
              <span className="flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-0.5 rounded-full font-medium">
                <Mail className="w-3 h-3" /> Email
              </span>
            )}
          </div>
        </div>

        {/* ── Conversation (chat order) ── */}
        <div className="space-y-4">
          {msgs
            .filter(m => m.kind === 'text' || m.kind === 'trends')
            .map((msg, i) => (
              msg.from === 'user' ? (
                <div key={i} className="flex justify-end">
                  <div className="bg-indigo-600 text-white px-4 py-2.5 rounded-2xl rounded-tr-sm max-w-[70%] text-sm leading-relaxed">
                    {msg.text}
                  </div>
                </div>
              ) : msg.kind === 'trends' && msg.trendOptions ? (
                /* Trend options shown as a static read-only list */
                <div key={i} className="flex justify-start">
                  <div className="flex items-start gap-2.5 max-w-[85%]">
                    <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-indigo-700 font-bold text-xs">P</span>
                    </div>
                    <div className="bg-white border border-gray-200 px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm">
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5" /> Trend options
                      </p>
                      <div className="space-y-1.5">
                        {msg.trendOptions.map((t, ti) => (
                          <div key={ti} className="text-xs text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
                            <span className="font-semibold">{t.title}</span>
                            {t.description && (
                              <span className="text-gray-500 ml-1">— {t.description.slice(0, 80)}{t.description.length > 80 ? '…' : ''}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div key={i} className="flex justify-start">
                  <div className="flex items-start gap-2.5 max-w-[85%]">
                    <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-indigo-700 font-bold text-xs">P</span>
                    </div>
                    <div className="bg-white border border-gray-200 px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm">
                      <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">{msg.text}</p>
                    </div>
                  </div>
                </div>
              )
            ))}

          {/* Instagram caption — after conversation */}
          {publishResult?.caption && (
            <div className="flex justify-start">
              <div className="flex items-start gap-2.5 w-full max-w-[90%]">
                <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-indigo-700 font-bold text-xs">P</span>
                </div>
                <div className="bg-white border border-gray-200 px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm flex-1">
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <InstagramIcon className="w-3 h-3" /> Caption
                  </p>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{publishResult.caption}</p>
                </div>
              </div>
            </div>
          )}

          {/* Generated images — at bottom, after conversation and caption */}
          {allImages.length > 0 && (
            <div className="flex justify-start">
              <div className="flex items-start gap-2.5 w-full max-w-[90%]">
                <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-indigo-700 font-bold text-xs">P</span>
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <InstagramIcon className="w-3 h-3" /> Generated Images
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {allImages.slice(0, 3).map((url, i) => (
                      <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200">
                        <img src={url} alt={`Generated image ${i + 1}`} className="w-full h-full object-cover" />
                        {url === publishedImageUrl && (
                          <div className="absolute bottom-1.5 left-1.5 bg-emerald-500 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-1">
                            <Check className="w-2.5 h-2.5" /> Published
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Email subject + body — at bottom */}
          {(publishResult?.email_subject || publishResult?.email_body) && (
            <div className="flex justify-start">
              <div className="flex items-start gap-2.5 w-full max-w-[90%]">
                <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-indigo-700 font-bold text-xs">P</span>
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm shadow-sm flex-1 overflow-hidden">
                  <div className="bg-indigo-50 border-b border-indigo-100 px-4 py-3">
                    <p className="text-[10px] font-medium text-indigo-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Mail className="w-3 h-3" /> Email sent
                    </p>
                    <p className="text-sm font-semibold text-gray-900">{publishResult.email_subject}</p>
                  </div>
                  {publishResult.email_body && (
                    <div className="px-4 py-3">
                      <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{publishResult.email_body}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Published badge */}
          {publishResult && (
            <div className="flex justify-center pt-2">
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 text-emerald-700 px-4 py-2 rounded-full text-xs font-medium">
                <Check className="w-3.5 h-3.5" />
                {publishedText}
              </div>
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="mt-10 pt-8 border-t border-gray-100">
          <button
            onClick={() => router.push('/campaign/new')}
            className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Start New Campaign
          </button>
        </div>
      </main>
    </AppLayout>
  )
}
