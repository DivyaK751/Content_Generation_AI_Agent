'use client'
import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AppLayout from '@/components/AppLayout'
import { Mail, Check, Loader2, ArrowRight } from 'lucide-react'
import InstagramIcon from '@/components/InstagramIcon'

type Platform = 'instagram' | 'email'

function PlatformCard({
  id,
  icon,
  title,
  description,
  features,
  selected,
  onClick,
}: {
  id: Platform
  icon: React.ReactNode
  title: string
  description: string
  features: string[]
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`relative w-full text-left rounded-2xl border-2 p-6 transition-all hover:shadow-md ${
        selected
          ? 'border-indigo-500 bg-indigo-50 shadow-sm'
          : 'border-gray-200 bg-white hover:border-indigo-200'
      }`}
    >
      {/* Selection indicator */}
      <div
        className={`absolute top-4 right-4 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
          selected ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300 bg-white'
        }`}
      >
        {selected && <Check className="w-3.5 h-3.5 text-white" />}
      </div>

      {/* Icon */}
      <div
        className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
          id === 'instagram'
            ? 'bg-gradient-to-br from-pink-500 to-purple-600'
            : 'bg-indigo-600'
        }`}
      >
        {icon}
      </div>

      <h3 className="font-semibold text-gray-900 text-base mb-1">{title}</h3>
      <p className="text-sm text-gray-500 mb-4 leading-relaxed">{description}</p>

      <ul className="space-y-1.5">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-xs text-gray-500">
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${selected ? 'bg-indigo-500' : 'bg-gray-300'}`} />
            {f}
          </li>
        ))}
      </ul>
    </button>
  )
}

function PlatformContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode') ?? 'occasion'
  const topic = searchParams.get('topic') ?? ''

  const [selected, setSelected] = useState<Set<Platform>>(new Set())
  const [generating, setGenerating] = useState(false)

  const toggle = (p: Platform) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(p) ? next.delete(p) : next.add(p)
      return next
    })
  }

  const handleGenerate = () => {
    if (selected.size === 0) return
    setGenerating(true)
    const platforms = selected.has('instagram') && selected.has('email')
      ? 'both'
      : selected.has('instagram')
      ? 'instagram'
      : 'email'
    setTimeout(() => {
      router.push(`/campaign/review?platforms=${platforms}`)
    }, 2200)
  }

  if (generating) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-screen gap-5 px-4">
          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
            <Loader2 className="w-7 h-7 text-indigo-600 animate-spin" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-gray-900 mb-1">Generating your content…</p>
            <p className="text-sm text-gray-400">
              {selected.has('instagram') && selected.has('email')
                ? 'Crafting images with Imagen 4.0 and email copy with Gemini'
                : selected.has('instagram')
                ? 'Crafting branded images with Imagen 4.0'
                : 'Writing email copy with Gemini 2.5 Pro'}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400 mt-2">
            <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <main className="max-w-3xl mx-auto px-8 py-10">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <span className="hover:text-gray-600 cursor-pointer" onClick={() => router.push('/dashboard')}>Dashboard</span>
          <span>/</span>
          <span className="hover:text-gray-600 cursor-pointer" onClick={() => router.back()}>New Campaign</span>
          <span>/</span>
          <span className="text-gray-700 font-medium">Choose Platforms</span>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mt-4 mb-1">Where would you like to publish?</h1>
        <p className="text-gray-500 text-sm mb-7">
          {topic
            ? <>Content theme: <span className="text-gray-700 font-medium">{topic}</span> · Select one or both platforms.</>
            : 'Select one or both platforms. You can always publish to the other later.'}
        </p>

        {/* Platform cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <PlatformCard
            id="instagram"
            icon={<InstagramIcon className="w-6 h-6 text-white" />}
            title="Instagram"
            description="A branded image post with caption and hashtags, optimised for your feed."
            features={['3 image options (Imagen 4.0)', 'Caption + hashtag suggestions', '1:1 or 4:5 aspect ratio']}
            selected={selected.has('instagram')}
            onClick={() => toggle('instagram')}
          />
          <PlatformCard
            id="email"
            icon={<Mail className="w-6 h-6 text-white" />}
            title="Email Campaign"
            description="A subject line and full email body tailored to your tone and audience."
            features={['3 subject line options', 'Full email body copy', 'Personalised for your list']}
            selected={selected.has('email')}
            onClick={() => toggle('email')}
          />
        </div>

        {/* Selection summary */}
        {selected.size > 0 && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 text-sm text-indigo-700 mb-6">
            {selected.size === 2
              ? 'Publishing to Instagram + Email — we\'ll generate content for both.'
              : selected.has('instagram')
              ? 'Publishing to Instagram — we\'ll generate 3 image options and captions.'
              : 'Publishing by Email — we\'ll generate 3 subject lines and email body options.'}
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={selected.size === 0}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Generate Content <ArrowRight className="w-4 h-4" />
        </button>
      </main>
    </AppLayout>
  )
}

export default function PlatformPage() {
  return (
    <Suspense fallback={
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      </AppLayout>
    }>
      <PlatformContent />
    </Suspense>
  )
}
