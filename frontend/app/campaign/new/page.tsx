'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import ProfilePanel, { type Section } from '@/components/ProfilePanel'
import BrandKitForm from '@/components/BrandKitForm'
import { apiPost, apiGet } from '@/lib/api'
import { getToken, sessionsKey } from '@/lib/auth'
import type { StoredSession } from '@/lib/types'
import {
  Send, Loader2, X, ShieldCheck, Check, Wand2, TrendingUp,
  Calendar, RefreshCw, Mail, ExternalLink, ChevronDown, ChevronUp, ArrowRight,
  Heart, MessageCircle, Bookmark, ArrowUpCircle,
} from 'lucide-react'
import InstagramIcon from '@/components/InstagramIcon'

// ── Types ─────────────────────────────────────────────────────────────────────
interface TrendOption {
  title: string
  description: string
  hashtags: string[]
  relevance?: string
}
interface EmailOption { subject: string; body: string }
interface ContentData {
  images: string[]
  captions: string[]
  emails: EmailOption[]
}
interface PublishResult {
  campaign_id?: string
  status?: string
  channels?: string[]
  theme?: string
  instagram?: { post_id?: string; skipped?: boolean; error?: string; reason?: string }
  email?: { message_id?: string; recipient_count?: number; skipped?: boolean; error?: string; reason?: string }
  image_url?: string
  all_image_urls?: string[]
  caption?: string
  email_subject?: string
  email_body?: string
}
interface InterruptData {
  type: 'follow_up' | 'trend_selection' | 'human_review'
  question?: string
  trend_options?: TrendOption[]
  generated_images?: string[]
  generated_captions?: string[]
  generated_emails?: EmailOption[]
  approval_result?: object
  chat_response?: string
}
interface ApiResponse {
  thread_id?: string
  status: 'waiting' | 'complete'
  next_node: string[]
  data?: InterruptData | PublishResult
}
interface SelectedContent {
  image_url: string
  caption: string
  email?: EmailOption
}

// ── Chat message types ────────────────────────────────────────────────────────
type MsgKind = 'text' | 'trends' | 'content' | 'finalize'
interface ChatMsg {
  id: string
  from: 'user' | 'ai'
  kind: MsgKind
  text?: string
  trendOptions?: TrendOption[]
  contentData?: ContentData
  publishResult?: PublishResult
  isActiveTrendMsg?: boolean  // only latest trend message is interactive
}

// ── Trend cards ───────────────────────────────────────────────────────────────
function TrendMessage({ trends, onPick, onFetchMore, locked, loading }: {
  trends: TrendOption[]
  onPick: (t: TrendOption) => void
  onFetchMore: () => void
  locked: boolean
  loading: boolean
}) {
  const [selected, setSelected] = useState<TrendOption | null>(null)

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Here are the top trends right now — select one to build your campaign around
      </p>
      <div className="space-y-2">
        {trends.map((trend, i) => {
          const isPicked = selected?.title === trend.title
          return (
            <button
              key={i}
              onClick={() => !locked && setSelected(trend)}
              disabled={locked}
              className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                isPicked
                  ? 'border-indigo-500 bg-indigo-50'
                  : locked
                  ? 'border-gray-200 bg-white opacity-40'
                  : 'border-gray-200 bg-white hover:border-indigo-200 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{trend.title}</p>
                  <p className="text-xs text-gray-500 leading-relaxed mt-0.5">{trend.description}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {trend.hashtags.slice(0, 3).map(h => (
                      <span key={h} className="text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{h}</span>
                    ))}
                  </div>
                </div>
                {isPicked && (
                  <div className="w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
      {!locked && (
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={onFetchMore}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 transition-colors disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Fetch more trends
          </button>
          <button
            onClick={() => selected && onPick(selected)}
            disabled={!selected || loading}
            className="flex items-center gap-1.5 text-xs font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Proceed
          </button>
        </div>
      )}
    </div>
  )
}

// ── Content cards ─────────────────────────────────────────────────────────────
function ContentMessage({ contentData, onSelect, selectedUrl, selectedEmailSubject }: {
  contentData: ContentData
  onSelect: (c: SelectedContent) => void
  selectedUrl: string | null
  selectedEmailSubject: string | null
}) {
  const hasImages = contentData.images.length > 0
  const hasEmails = contentData.emails.length > 0

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        {!hasImages && !hasEmails
          ? 'No content was generated — the image prompt may have been filtered. Please try a new campaign.'
          : hasImages && hasEmails
          ? 'Here are your options — click any card to preview.'
          : hasImages
          ? 'Here are your image options — click any to preview.'
          : 'Here are your email options — click any to preview.'}
      </p>

      {/* Instagram image cards */}
      {hasImages && (
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <InstagramIcon className="w-3.5 h-3.5" /> Instagram
          </p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {contentData.images.map((url, i) => {
              const isSelected = url === selectedUrl
              return (
                <button
                  key={i}
                  onClick={() => onSelect({
                    image_url: url,
                    caption: contentData.captions[i] ?? contentData.captions[0] ?? '',
                    email: contentData.emails[0],
                  })}
                  className={`relative flex-shrink-0 w-40 h-40 rounded-xl overflow-hidden border-2 transition-all hover:scale-105 bg-gray-100 ${
                    isSelected ? 'border-indigo-500 ring-4 ring-indigo-100' : 'border-transparent hover:border-gray-300'
                  }`}
                >
                  <img src={url} alt={`option ${i + 1}`} className="w-full h-full object-cover" />
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Email cards */}
      {hasEmails && (
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5" /> Email
          </p>
          <div className="space-y-2">
            {contentData.emails.map((em, i) => {
              const isSelected = em.subject === selectedEmailSubject
              const bodyPreview = em.body.replace(/\n+/g, ' ').slice(0, 110)
              return (
                <button
                  key={i}
                  onClick={() => onSelect({
                    image_url: contentData.images[0] ?? '',
                    caption: contentData.captions[0] ?? '',
                    email: em,
                  })}
                  className={`w-full text-left p-3.5 rounded-xl border-2 transition-all ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 bg-white hover:border-indigo-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-900 leading-snug">{em.subject}</p>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                        {bodyPreview.length < em.body.length ? bodyPreview + '…' : bodyPreview}
                      </p>
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 flex items-center gap-1 pt-1">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
        All content passed the AI quality check
      </p>
    </div>
  )
}

// ── Image panel ───────────────────────────────────────────────────────────────
// ── Preview & Publish modal ───────────────────────────────────────────────────
function PreviewPublishModal({
  selected, onCancel, onConfirmPublish, publishing, businessName,
}: {
  selected: SelectedContent
  onCancel: () => void
  onConfirmPublish: () => void
  publishing: boolean
  businessName: string
}) {
  const hasImage = !!selected.image_url
  const hasEmail = !!selected.email
  const hasBoth = hasImage && hasEmail

  // When both channels, show Instagram first then Email as separate steps
  const [step, setStep] = useState<'instagram' | 'email'>(hasImage ? 'instagram' : 'email')
  const showingEmail = step === 'email' || (!hasImage && hasEmail)
  const isWide = showingEmail && hasEmail

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`bg-white rounded-2xl shadow-2xl w-full max-h-[92vh] flex flex-col transition-all duration-300 ${isWide ? 'max-w-2xl' : 'max-w-sm'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Preview &amp; Publish</h2>
            {hasBoth && (
              <p className="text-xs text-gray-400 mt-0.5">
                {step === 'instagram' ? 'Step 1 of 2 — Instagram' : 'Step 2 of 2 — Email'}
              </p>
            )}
          </div>
          <button onClick={onCancel} disabled={publishing} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable preview */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Instagram post mockup — show on instagram step */}
          {step === 'instagram' && hasImage && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <InstagramIcon className="w-3.5 h-3.5" /> Instagram Preview
              </p>
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                {/* Profile header */}
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 p-0.5 flex-shrink-0">
                    <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
                      <span className="text-[10px] font-bold text-pink-600">{businessName ? businessName[0].toUpperCase() : 'P'}</span>
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-gray-900">{businessName || 'your_business'}</p>
                </div>
                {/* Image */}
                <div className="aspect-square w-full overflow-hidden">
                  <img src={selected.image_url} alt="Post preview" className="w-full h-full object-cover" />
                </div>
                {/* Action row */}
                <div className="flex items-center gap-3.5 px-3 pt-2.5 pb-1">
                  <Heart className="w-5 h-5 text-gray-700" />
                  <MessageCircle className="w-5 h-5 text-gray-700" />
                  <Send className="w-5 h-5 text-gray-700 -rotate-45" />
                  <Bookmark className="w-5 h-5 text-gray-700 ml-auto" />
                </div>
                {/* Caption — full text, scrollable */}
                {selected.caption && (
                  <div className="px-3 pb-3 pt-1 max-h-32 overflow-y-auto">
                    <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">
                      <span className="font-semibold">{businessName || 'your_business'}</span>{' '}
                      {selected.caption}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Email mockup — show on email step */}
          {step === 'email' && hasEmail && selected.email && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> Email Preview
              </p>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-100">
                  <p className="text-[10px] text-gray-400 mb-0.5 uppercase tracking-wide">Subject</p>
                  <p className="text-sm font-semibold text-gray-900">{selected.email.subject}</p>
                </div>
                <div className="px-4 py-4 max-h-72 overflow-y-auto">
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{selected.email.body}</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            Passed AI quality check — ready to publish
          </div>
        </div>

        {/* Confirm actions */}
        <div className="px-4 pb-4 pt-3 grid grid-cols-2 gap-3 flex-shrink-0 border-t border-gray-100">
          <button
            onClick={() => {
              if (hasBoth && step === 'email') {
                setStep('instagram')
              } else {
                onCancel()
              }
            }}
            disabled={publishing}
            className="border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            {hasBoth && step === 'email' ? '← Instagram' : '← Back'}
          </button>
          {hasBoth && step === 'instagram' ? (
            <button
              onClick={() => setStep('email')}
              className="flex items-center justify-center gap-1.5 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              Email Preview →
            </button>
          ) : (
            <button
              onClick={onConfirmPublish}
              disabled={publishing}
              className="flex items-center justify-center gap-1.5 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {publishing ? 'Publishing…' : 'Publish Now'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ImagePanel({ content, allCaptions, allEmails, onClose, onRefine, onPreview }: {
  content: SelectedContent
  allCaptions: string[]
  allEmails: EmailOption[]
  onClose: () => void
  onRefine: (imageUrl: string) => void
  onPreview: (selected: SelectedContent) => void
}) {
  const hasImage = !!content.image_url
  const hasCaptions = allCaptions.length > 0
  const emailOnly = !hasImage && allEmails.length > 0

  const [activeCaption, setActiveCaption] = useState(content.caption)
  const [activeEmail, setActiveEmail] = useState<EmailOption | undefined>(content.email)
  const [emailExpanded, setEmailExpanded] = useState(true)

  useEffect(() => {
    setActiveCaption(content.caption)
    setActiveEmail(content.email)
    setEmailExpanded(true)
  }, [content.image_url, content.email?.subject])

  const selected: SelectedContent = {
    image_url: content.image_url,
    caption: activeCaption,
    email: activeEmail,
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          {emailOnly
            ? <Mail className="w-4 h-4 text-indigo-500" />
            : <InstagramIcon className="w-4 h-4 text-pink-500" />}
          <span className="text-sm font-semibold text-gray-900">Preview</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Image — only when present */}
        {hasImage && (
          <div className="w-full aspect-square rounded-2xl overflow-hidden shadow-md bg-gray-100">
            <img src={content.image_url} alt="generated" className="w-full h-full object-cover" />
          </div>
        )}

        {/* Caption picker — only when captions exist */}
        {hasCaptions && (
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Caption</p>
            {allCaptions.length > 1 ? (
              <div className="space-y-2">
                {allCaptions.map((cap, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveCaption(cap)}
                    className={`w-full text-left text-xs leading-relaxed p-2.5 rounded-lg border transition-all ${
                      activeCaption === cap
                        ? 'border-indigo-400 bg-indigo-50 text-gray-800'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <span className="font-medium text-gray-400 mr-1.5">#{i + 1}</span>
                    {cap}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-800 leading-relaxed">{activeCaption}</p>
            )}
          </div>
        )}

        {/* Email — shown for all email cases; auto-expanded for email-only */}
        {allEmails.length > 0 && (
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> Email
              </p>
              {!emailOnly && (
                <button
                  onClick={() => setEmailExpanded(e => !e)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  {emailExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
            {allEmails.length > 1 ? (
              <div className="space-y-2">
                {allEmails.map((em, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveEmail(em)}
                    className={`w-full text-left text-xs p-2.5 rounded-lg border transition-all ${
                      activeEmail?.subject === em.subject
                        ? 'border-indigo-400 bg-indigo-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <p className="font-medium text-gray-700">{em.subject}</p>
                    {(emailExpanded || emailOnly) && (
                      <p className="text-gray-500 mt-1 leading-relaxed whitespace-pre-line">{em.body}</p>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-800 font-medium">{activeEmail?.subject}</p>
                {(emailExpanded || emailOnly) && activeEmail && (
                  <p className="text-xs text-gray-600 mt-2 leading-relaxed whitespace-pre-line">{activeEmail.body}</p>
                )}
              </>
            )}
          </div>
        )}

        {/* Approval badge */}
        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
          <ShieldCheck className="w-3.5 h-3.5" />
          Passed AI quality check — logo, brand colours, content relevance verified
        </div>
      </div>

      {/* Actions */}
      <div className="px-5 pb-5 pt-4 border-t border-gray-100 grid grid-cols-2 gap-3 flex-shrink-0">
        <button
          onClick={() => onRefine(content.image_url)}
          className="flex items-center justify-center gap-1.5 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          <Wand2 className="w-4 h-4" /> Refine it
        </button>
        <button
          onClick={() => onPreview(selected)}
          className="flex items-center justify-center gap-1.5 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          Preview &amp; Publish
        </button>
      </div>
    </div>
  )
}

// ── Publish result ────────────────────────────────────────────────────────────
function PublishSuccess({ result, onNewCampaign }: { result: PublishResult; onNewCampaign: () => void }) {
  const igPosted = result.instagram?.post_id
  const igError = result.instagram?.error
  const emailSent = result.email?.recipient_count
  const emailError = result.email?.error
  const igSkipped = result.instagram?.skipped
  const emailSkipped = result.email?.skipped

  return (
    <div className="space-y-3 max-w-xs">
      {/* Published image thumbnail */}
      {result.image_url && (
        <div className="rounded-xl overflow-hidden aspect-square w-40 shadow-sm border border-gray-100">
          <img src={result.image_url} alt="Published post" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
          <Check className="w-3 h-3 text-emerald-600" />
        </div>
        <p className="text-sm font-semibold text-gray-900">
          {result.theme ? `"${result.theme}" published!` : 'Campaign published!'}
        </p>
      </div>

      <div className="space-y-1.5">
        {igPosted && (
          <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
            <InstagramIcon className="w-3.5 h-3.5" />
            Instagram post live
          </div>
        )}
        {igError && (
          <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            <InstagramIcon className="w-3.5 h-3.5" />
            Instagram error: {igError}
          </div>
        )}
        {igSkipped && (
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <InstagramIcon className="w-3.5 h-3.5" />
            Instagram skipped — {result.instagram?.reason || 'no credentials'}
          </div>
        )}
        {typeof emailSent === 'number' && (
          <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
            <Mail className="w-3.5 h-3.5" />
            Email sent to {emailSent} recipient{emailSent !== 1 ? 's' : ''}
          </div>
        )}
        {emailError && (
          <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            <Mail className="w-3.5 h-3.5" />
            Email error: {emailError}
          </div>
        )}
        {emailSkipped && (
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <Mail className="w-3.5 h-3.5" />
            Email skipped — {result.email?.reason || 'no credentials'}
          </div>
        )}
      </div>

      <button
        onClick={onNewCampaign}
        className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
      >
        <ExternalLink className="w-3.5 h-3.5" /> Start a new campaign
      </button>
    </div>
  )
}

// ── Typing indicator ──────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
          <span className="text-indigo-700 font-bold text-xs">P</span>
        </div>
        <div className="bg-white border border-gray-200 px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-1.5">
          {[0, 150, 300].map(d => (
            <div key={d} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg, onSelect, selectedContent, onTrendPick, onFetchMore, loading, onNewCampaign }: {
  msg: ChatMsg
  onSelect: (c: SelectedContent) => void
  selectedContent: SelectedContent | null
  onTrendPick: (t: TrendOption) => void
  onFetchMore: () => void
  loading: boolean
  onNewCampaign: () => void
}) {
  if (msg.from === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-indigo-600 text-white px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed max-w-[70%]">
          {msg.text}
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div className="flex items-start gap-2.5 max-w-[90%]">
        <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-indigo-700 font-bold text-xs">P</span>
        </div>
        <div className="bg-white border border-gray-200 px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm">
          {msg.kind === 'text' && <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">{msg.text}</p>}
          {msg.kind === 'trends' && msg.trendOptions && (
            <TrendMessage
              trends={msg.trendOptions}
              onPick={onTrendPick}
              onFetchMore={onFetchMore}
              locked={!msg.isActiveTrendMsg}
              loading={loading}
            />
          )}
          {msg.kind === 'content' && msg.contentData && (
            <ContentMessage
              contentData={msg.contentData}
              onSelect={onSelect}
              selectedUrl={selectedContent?.image_url ?? null}
              selectedEmailSubject={selectedContent?.email?.subject ?? null}
            />
          )}
          {msg.kind === 'finalize' && msg.publishResult && (
            <PublishSuccess result={msg.publishResult} onNewCampaign={onNewCampaign} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Session persistence ───────────────────────────────────────────────────────
function saveSessionToStorage(threadId: string, msgs: ChatMsg[], contextTitle?: string) {
  try {
    let title = contextTitle
      ? contextTitle.charAt(0).toUpperCase() + contextTitle.slice(1)
      : null
    if (!title) {
      const firstUserMsg = msgs.find(m => m.from === 'user')?.text ?? 'Campaign'
      title = firstUserMsg.length > 50 ? firstUserMsg.slice(0, 50) + '…' : firstUserMsg
    }
    const session: StoredSession = {
      id: threadId,
      title,
      date: new Date().toISOString(),
      messages: msgs as object[],
    }
    const key = sessionsKey()
    const existing: StoredSession[] = JSON.parse(localStorage.getItem(key) ?? '[]')
    const updated = [session, ...existing.filter(s => s.id !== threadId)].slice(0, 20)
    localStorage.setItem(key, JSON.stringify(updated))
    window.dispatchEvent(new Event('storage'))
  } catch {
    // localStorage unavailable — ignore
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function NewCampaignPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [threadId, setThreadId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [chatMode, setChatMode] = useState<'convo' | 'refining'>('convo')
  const [stage, setStage] = useState<'chatting' | 'content-shown' | 'finalizing'>('chatting')
  const [selectedContent, setSelectedContent] = useState<SelectedContent | null>(null)
  const [refineImageUrl, setRefineImageUrl] = useState<string | null>(null)
  // ID of the most recently added trend message — only that one is interactive
  const [activeTrendMsgId, setActiveTrendMsgId] = useState<string | null>(null)
  // All captions/emails from the latest human_review for the panel picker
  const [panelCaptions, setPanelCaptions] = useState<string[]>([])
  const [panelEmails, setPanelEmails] = useState<EmailOption[]>([])
  const [previewContent, setPreviewContent] = useState<SelectedContent | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [activeBrandSection, setActiveBrandSection] = useState<Section | null>(null)
  const [businessName, setBusinessName] = useState('')
  const [upgradePrompt, setUpgradePrompt] = useState<'instagram' | 'quota' | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const token = getToken()
    if (token) {
      apiGet<{ business_name?: string }>('/brand-kit', token)
        .then(kit => { if (kit.business_name) setBusinessName(kit.business_name) })
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const addMsg = (msg: Omit<ChatMsg, 'id'>) => {
    const id = crypto.randomUUID()
    setMessages(prev => [...prev, { ...msg, id }])
    return id
  }

  const handleResponse = (res: ApiResponse) => {
    if (res.status === 'complete') {
      const pr = (res.data as PublishResult) ?? {}
      addMsg({ from: 'ai', kind: 'finalize', publishResult: pr })
      setStage('finalizing')
      return
    }
    if (!res.data) return
    const data = res.data as InterruptData
    if (data.type === 'follow_up') {
      addMsg({ from: 'ai', kind: 'text', text: data.question })
    } else if (data.type === 'trend_selection') {
      // Deactivate any previous trend message, mark new one active
      setMessages(prev => prev.map(m => m.kind === 'trends' ? { ...m, isActiveTrendMsg: false } : m))
      const msgId = addMsg({ from: 'ai', kind: 'trends', trendOptions: data.trend_options, isActiveTrendMsg: true })
      setActiveTrendMsgId(msgId)
    } else if (data.type === 'human_review') {
      if (data.chat_response) {
        // Bot answered a chat question — just show the reply, keep the content panel as-is
        addMsg({ from: 'ai', kind: 'text', text: data.chat_response })
      } else {
        // Fresh content (first run or after refine) — show content cards and update panel
        addMsg({
          from: 'ai', kind: 'content',
          contentData: {
            images: data.generated_images ?? [],
            captions: data.generated_captions ?? [],
            emails: data.generated_emails ?? [],
          },
        })
        setPanelCaptions(data.generated_captions ?? [])
        setPanelEmails(data.generated_emails ?? [])
        setStage('content-shown')
      }
    }
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    addMsg({ from: 'user', kind: 'text', text })
    setLoading(true)
    try {
      const token = getToken()
      if (!token) { router.replace('/'); return }
      let res: ApiResponse
      let currentThreadId = threadId
      if (!threadId) {
        res = await apiPost<ApiResponse>('/campaign/start', { message: text }, token)
        currentThreadId = res.thread_id!
        setThreadId(res.thread_id!)
      } else if (chatMode === 'refining') {
        res = await apiPost<ApiResponse>('/campaign/refine', {
          thread_id: threadId,
          instruction: text,
          selected_image_url: refineImageUrl,
        }, token)
        setChatMode('convo')
        setSelectedContent(null)
        setRefineImageUrl(null)
      } else if (stage === 'content-shown') {
        // Content is displayed — send as a chat question, not a plain reply (which would trigger publish)
        res = await apiPost<ApiResponse>('/campaign/chat', { thread_id: threadId, message: text }, token)
      } else {
        res = await apiPost<ApiResponse>('/campaign/reply', { thread_id: threadId, reply: text }, token)
      }
      handleResponse(res)
      // Save after every AI response so session persists even without publishing
      setMessages(prev => {
        if (currentThreadId && prev.length > 0) saveSessionToStorage(currentThreadId, prev)
        return prev
      })
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : ''
      try {
        const parsed = JSON.parse(raw)
        const code = parsed?.detail?.code
        if (code === 'instagram_not_available') { setUpgradePrompt('instagram'); return }
        if (code === 'quota_exceeded') { setUpgradePrompt('quota'); return }
      } catch {}
      addMsg({ from: 'ai', kind: 'text', text: 'Something went wrong. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  const handleTrendPick = async (trend: TrendOption) => {
    if (loading) return
    addMsg({ from: 'user', kind: 'text', text: `Let's build around "${trend.title}"` })
    // Lock immediately so the Proceed button spinner disappears right away
    // instead of spinning for the full content-generation duration (30-60s)
    setMessages(prev => prev.map(m =>
      m.id === activeTrendMsgId ? { ...m, isActiveTrendMsg: false } : m
    ))
    setActiveTrendMsgId(null)
    setLoading(true)
    try {
      const token = getToken()!
      const res = await apiPost<ApiResponse>('/campaign/reply', {
        thread_id: threadId,
        reply: JSON.stringify(trend),
      }, token)
      handleResponse(res)
      setMessages(prev => {
        if (threadId && prev.length > 0) saveSessionToStorage(threadId, prev)
        return prev
      })
    } catch {
      addMsg({ from: 'ai', kind: 'text', text: 'Something went wrong. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  const handleFetchMore = async () => {
    if (loading) return
    addMsg({ from: 'user', kind: 'text', text: 'Fetch more trends' })
    setLoading(true)
    try {
      const token = getToken()!
      const res = await apiPost<ApiResponse>('/campaign/reply', {
        thread_id: threadId,
        reply: 'fetch more trends',
      }, token)
      handleResponse(res)
      setMessages(prev => {
        if (threadId && prev.length > 0) saveSessionToStorage(threadId, prev)
        return prev
      })
    } catch {
      addMsg({ from: 'ai', kind: 'text', text: 'Something went wrong. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  const handleRefine = (imageUrl: string) => {
    setRefineImageUrl(imageUrl)
    setChatMode('refining')
    setSelectedContent(null)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const handlePublish = async (finalSelected: SelectedContent) => {
    if (!threadId) return
    // Guard: preview modal must be open (previewContent set) before we can publish.
    // If somehow publish is triggered without the modal, open it instead.
    if (!previewContent) {
      setPreviewContent(finalSelected)
      return
    }
    setPublishing(true)
    try {
      const token = getToken()!
      const res = await apiPost<ApiResponse>('/campaign/publish', {
        thread_id: threadId,
        selected: finalSelected,
      }, token)
      const publishData = res.data as PublishResult
      const contextTitle = publishData?.theme ?? undefined
      handleResponse(res)
      setSelectedContent(null)
      setMessages(prev => {
        saveSessionToStorage(threadId, prev, contextTitle)
        return prev
      })
    } catch {
      addMsg({ from: 'ai', kind: 'text', text: 'Publish failed. Please try again.' })
    } finally {
      setPublishing(false)
      setPreviewContent(null)
    }
  }

  const handlePreview = (content: SelectedContent) => {
    setPreviewContent(content)
  }

  const handleNewCampaign = () => {
    // Save current session before clearing so it appears in Recent Sessions
    setMessages(prev => {
      if (threadId && prev.length > 0) saveSessionToStorage(threadId, prev)
      return []
    })
    setInput('')
    setThreadId(null)
    setLoading(false)
    setPublishing(false)
    setChatMode('convo')
    setStage('chatting')
    setSelectedContent(null)
    setRefineImageUrl(null)
    setActiveTrendMsgId(null)
    setPanelCaptions([])
    setPanelEmails([])
  }

  const panelOpen = selectedContent !== null && stage === 'content-shown'

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Preview & Publish modal */}
      {previewContent && (
        <PreviewPublishModal
          selected={previewContent}
          onCancel={() => setPreviewContent(null)}
          onConfirmPublish={() => handlePublish(previewContent)}
          publishing={publishing}
          businessName={businessName}
        />
      )}

      <Sidebar
        onProfileClick={() => { if (profileOpen) setActiveBrandSection(null); setProfileOpen(o => !o) }}
        profilePanelOpen={profileOpen}
      />
      <ProfilePanel open={profileOpen} activeSection={activeBrandSection} onSectionSelect={setActiveBrandSection} businessName={businessName} />

      {activeBrandSection ? (
        <div className="flex-1 overflow-auto">
          <BrandKitForm section={activeBrandSection} onClose={() => setActiveBrandSection(null)} />
        </div>
      ) : (
        <div className="flex flex-1 h-full overflow-hidden">

          {/* ── Chat panel ── */}
          <div
            className="flex flex-col h-full overflow-hidden"
            style={{ width: panelOpen ? '50%' : '100%', transition: 'width 0.3s ease' }}
          >
            {messages.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center px-8">
                <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center mb-6">
                  <Wand2 className="w-6 h-6 text-indigo-600" />
                </div>
                <h1 className="text-3xl font-bold text-gray-900 mb-3 text-center">What do you want to create today?</h1>
                <p className="text-gray-400 text-sm text-center max-w-md leading-relaxed mb-8">
                  Describe a specific occasion or ask me what&apos;s trending — I&apos;ll generate the right content for your brand.
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs text-gray-500">
                    <Calendar className="w-3.5 h-3.5 text-indigo-400" /> Occasion mode
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs text-gray-500">
                    <TrendingUp className="w-3.5 h-3.5 text-pink-400" /> Trend mode
                  </div>
                </div>
              </div>
            )}

            {messages.length > 0 && (
              <div className="flex-1 overflow-y-auto">
                <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">
                  {messages.map(msg => (
                    <MessageBubble
                      key={msg.id}
                      msg={msg}
                      onSelect={setSelectedContent}
                      selectedContent={selectedContent}
                      onTrendPick={handleTrendPick}
                      onFetchMore={handleFetchMore}
                      loading={loading}
                      onNewCampaign={handleNewCampaign}
                    />
                  ))}
                  {loading && <TypingIndicator />}

                  {/* Upgrade prompts */}
                  {upgradePrompt === 'quota' && (
                    <div className="flex justify-start">
                      <div className="flex items-start gap-2.5 max-w-[90%]">
                        <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-indigo-700 font-bold text-xs">P</span>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 px-4 py-4 rounded-2xl rounded-tl-sm space-y-3">
                          <p className="text-sm font-semibold text-amber-800">Image quota reached</p>
                          <p className="text-sm text-amber-700">You&apos;ve used all your images for this period. Upgrade to keep generating.</p>
                          <button
                            onClick={() => router.push('/pricing')}
                            className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
                          >
                            <ArrowUpCircle className="w-4 h-4" />
                            Upgrade your plan
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {upgradePrompt === 'instagram' && (
                    <div className="flex justify-start">
                      <div className="flex items-start gap-2.5 max-w-[90%]">
                        <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-indigo-700 font-bold text-xs">P</span>
                        </div>
                        <div className="bg-indigo-50 border border-indigo-200 px-4 py-4 rounded-2xl rounded-tl-sm space-y-3">
                          <p className="text-sm font-semibold text-indigo-800">Instagram posting not available</p>
                          <p className="text-sm text-indigo-700">Auto-posting to Instagram requires the Starter plan or above.</p>
                          <button
                            onClick={() => router.push('/pricing')}
                            className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
                          >
                            <ArrowUpCircle className="w-4 h-4" />
                            See pricing
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={bottomRef} />
                </div>
              </div>
            )}

            {stage !== 'finalizing' && (
              <div className="flex-shrink-0 bg-white border-t border-gray-100">
                <div className="max-w-2xl mx-auto px-6 py-4">
                  {chatMode === 'refining' && (
                    <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-xl w-fit">
                      <Wand2 className="w-4 h-4 text-indigo-500" />
                      <p className="text-xs text-indigo-600 font-medium">Refine mode — describe your changes</p>
                      <button onClick={() => setChatMode('convo')} className="text-indigo-300 hover:text-indigo-500 ml-1">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                    <input
                      ref={inputRef}
                      type="text"
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                      placeholder={
                        chatMode === 'refining'
                          ? 'Describe what to change — e.g. Make it brighter, change the headline…'
                          : messages.length === 0
                          ? "e.g. 'Create a Diwali post' or 'What’s trending I can use?'"
                          : 'Type your reply…'
                      }
                      disabled={loading}
                      className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none disabled:opacity-50"
                    />
                    <button
                      onClick={handleSend}
                      disabled={!input.trim() || loading}
                      className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center text-white hover:bg-indigo-700 transition-colors disabled:opacity-40 flex-shrink-0"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Preview panel (right 50%) ── */}
          <div
            className="bg-white border-l border-gray-200 flex flex-col overflow-hidden flex-shrink-0"
            style={{ width: panelOpen ? '50%' : '0%', transition: 'width 0.3s ease' }}
          >
            {panelOpen && selectedContent && (
              <ImagePanel
                content={selectedContent}
                allCaptions={panelCaptions}
                allEmails={panelEmails}
                onClose={() => setSelectedContent(null)}
                onRefine={handleRefine}
                onPreview={handlePreview}
              />
            )}
          </div>

        </div>
      )}
    </div>
  )
}
