'use client'
import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AppLayout from '@/components/AppLayout'
import { mockImageOptions, mockTaglines, mockEmailOptions, mockUser } from '@/lib/mock-data'
import { Check, ChevronDown, ChevronUp, Mail, Loader2, ShieldCheck } from 'lucide-react'
import InstagramIcon from '@/components/InstagramIcon'

// ── Mock post card ────────────────────────────────────────────────────────────
function MockPostCard({ gradientFrom, gradientTo, headline, subtext, businessName, logoInitial, selected, onClick }: {
  gradientFrom: string; gradientTo: string; headline: string; subtext: string
  businessName: string; logoInitial: string; selected: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex-shrink-0 w-56 h-56 rounded-2xl overflow-hidden border-2 transition-all hover:scale-105 ${
        selected ? 'border-indigo-500 ring-4 ring-indigo-100' : 'border-transparent'
      }`}
      style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-white text-center">
        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3 backdrop-blur-sm">
          <span className="text-white font-bold text-sm">{logoInitial}</span>
        </div>
        <p className="font-bold text-base leading-tight">{headline}</p>
        <p className="text-xs text-white/80 mt-1">{subtext}</p>
        <p className="text-xs font-semibold mt-3 text-white/90">{businessName}</p>
      </div>
      {selected && (
        <div className="absolute top-2 right-2 w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center">
          <Check className="w-3.5 h-3.5 text-white" />
        </div>
      )}
      <div className="absolute bottom-2 left-2">
        <span className="flex items-center gap-1 text-xs bg-white/20 backdrop-blur-sm text-white px-2 py-0.5 rounded-full">
          <ShieldCheck className="w-3 h-3" /> Approved
        </span>
      </div>
    </button>
  )
}

// ── Tagline card ──────────────────────────────────────────────────────────────
function TaglineCard({ text, hashtags, selected, onClick }: {
  text: string; hashtags: string[]; selected: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
        selected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white hover:border-indigo-200'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all ${
          selected ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300'
        }`}>
          {selected && <Check className="w-3 h-3 text-white" />}
        </div>
        <div>
          <p className="text-sm text-gray-900 font-medium leading-relaxed">{text}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {hashtags.map(h => <span key={h} className="text-xs text-indigo-600">{h}</span>)}
          </div>
        </div>
      </div>
    </button>
  )
}

// ── Email card ────────────────────────────────────────────────────────────────
function EmailCard({ subject, previewText, body, selected, onClick }: {
  subject: string; previewText: string; body: string; selected: boolean; onClick: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className={`border-2 rounded-xl transition-all ${selected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white'}`}>
      <button onClick={onClick} className="w-full text-left p-4">
        <div className="flex items-start gap-3">
          <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all ${
            selected ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300'
          }`}>
            {selected && <Check className="w-3 h-3 text-white" />}
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">{subject}</p>
            <p className="text-xs text-gray-400 mt-0.5">{previewText}</p>
          </div>
        </div>
      </button>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-center gap-1 text-xs text-indigo-600 pb-3 hover:text-indigo-700"
      >
        {expanded ? <><ChevronUp className="w-3.5 h-3.5" /> Hide preview</> : <><ChevronDown className="w-3.5 h-3.5" /> Preview email body</>}
      </button>
      {expanded && (
        <div className="mx-4 mb-4 p-4 bg-white rounded-lg border border-gray-100 text-xs text-gray-600 leading-relaxed whitespace-pre-line font-mono">
          {body}
        </div>
      )}
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ icon, title, count }: { icon: React.ReactNode; title: string; count: number }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="font-semibold text-gray-900 flex items-center gap-2">
        {icon}
        {title}
      </h2>
      <span className="text-xs text-gray-400">{count} options</span>
    </div>
  )
}

// ── Main review content ───────────────────────────────────────────────────────
function ReviewContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const platforms = searchParams.get('platforms') ?? 'both'

  const showInstagram = platforms === 'instagram' || platforms === 'both'
  const showEmail = platforms === 'email' || platforms === 'both'

  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [selectedTagline, setSelectedTagline] = useState<string | null>(null)
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)

  const allSelected =
    (!showInstagram || (selectedImage && selectedTagline)) &&
    (!showEmail || selectedEmail)

  const handlePublish = () => {
    setPublishing(true)
    setTimeout(() => router.push(`/campaign/published?platforms=${platforms}`), 2000)
  }

  const platformLabel = platforms === 'both'
    ? 'Instagram + Email'
    : platforms === 'instagram'
    ? 'Instagram'
    : 'Email'

  return (
    <AppLayout>
      <main className="max-w-3xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
            <span className="hover:text-gray-600 cursor-pointer" onClick={() => router.push('/dashboard')}>Dashboard</span>
            <span>/</span>
            <span className="text-gray-700 font-medium">Review &amp; Publish</span>
          </div>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Review Your Content</h1>
              <p className="text-gray-500 text-sm mt-1">
                Publishing to <span className="font-medium text-gray-700">{platformLabel}</span>. Pick one of each option below.
              </p>
            </div>
            <span className="text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-full mt-1">
              {platformLabel}
            </span>
          </div>
        </div>

        {/* Approval notice */}
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 mb-7">
          <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          Approval agent verified all content for brand alignment and quality.
        </div>

        {/* ── Instagram section ── */}
        {showInstagram && (
          <section className="mb-8">
            <SectionHeader
              icon={<InstagramIcon className="w-4 h-4 text-pink-500" />}
              title="Instagram Image"
              count={mockImageOptions.length}
            />
            <div className="flex gap-4 overflow-x-auto pb-2">
              {mockImageOptions.map(img => (
                <MockPostCard
                  key={img.id}
                  gradientFrom={img.gradientFrom}
                  gradientTo={img.gradientTo}
                  headline={img.headline}
                  subtext={img.subtext}
                  businessName={mockUser.businessName}
                  logoInitial={mockUser.logoInitial}
                  selected={selectedImage === img.id}
                  onClick={() => setSelectedImage(img.id)}
                />
              ))}
            </div>

            <div className="mt-5">
              <SectionHeader icon={null} title="Caption / Tagline" count={mockTaglines.length} />
              <div className="space-y-3">
                {mockTaglines.map(t => (
                  <TaglineCard
                    key={t.id}
                    text={t.text}
                    hashtags={t.hashtags}
                    selected={selectedTagline === t.id}
                    onClick={() => setSelectedTagline(t.id)}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Divider when both are shown */}
        {showInstagram && showEmail && (
          <div className="border-t border-gray-100 mb-8" />
        )}

        {/* ── Email section ── */}
        {showEmail && (
          <section className="mb-10">
            <SectionHeader
              icon={<Mail className="w-4 h-4 text-indigo-500" />}
              title="Email Campaign"
              count={mockEmailOptions.length}
            />
            <div className="space-y-3">
              {mockEmailOptions.map(e => (
                <EmailCard
                  key={e.id}
                  subject={e.subject}
                  previewText={e.previewText}
                  body={e.body}
                  selected={selectedEmail === e.id}
                  onClick={() => setSelectedEmail(e.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Sticky publish bar */}
        <div className={`sticky bottom-6 bg-white border border-gray-200 rounded-2xl px-6 py-4 shadow-lg flex items-center justify-between transition-all ${allSelected ? 'shadow-indigo-100' : ''}`}>
          <div className="text-sm">
            {allSelected ? (
              <p className="text-gray-700 font-medium">Ready to publish to {platformLabel}</p>
            ) : (
              <p className="text-gray-400">
                {showInstagram && !selectedImage
                  ? 'Select an image to continue'
                  : showInstagram && !selectedTagline
                  ? 'Select a caption to continue'
                  : 'Select an email option to continue'}
              </p>
            )}
          </div>
          <button
            onClick={handlePublish}
            disabled={!allSelected || publishing}
            className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {publishing ? <><Loader2 className="w-4 h-4 animate-spin" /> Publishing…</> : 'Publish Now'}
          </button>
        </div>
      </main>
    </AppLayout>
  )
}

export default function ReviewPage() {
  return (
    <Suspense fallback={
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      </AppLayout>
    }>
      <ReviewContent />
    </Suspense>
  )
}
