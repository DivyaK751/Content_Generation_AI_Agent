'use client'
import { Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import AppLayout from '@/components/AppLayout'
import { mockImageOptions, mockTaglines, mockUser } from '@/lib/mock-data'
import { Heart, MessageCircle, Send as ShareIcon, Bookmark, MoreHorizontal, ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react'

function PreviewContent() {
  const params = useSearchParams()
  const router = useRouter()

  const imageId = params.get('imageId') ?? 'img_1'
  const taglineId = params.get('taglineId') ?? 'tag_1'

  const image = mockImageOptions.find(i => i.id === imageId) ?? mockImageOptions[0]
  const tagline = mockTaglines.find(t => t.id === taglineId) ?? mockTaglines[0]

  const handle = mockUser.instagramHandle.replace('@', '')

  return (
    <main className="max-w-md mx-auto px-6 py-10">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to edit
        </button>
        <h1 className="text-xl font-bold text-gray-900">Post Preview</h1>
        <p className="text-sm text-gray-400 mt-1">This is how your post will appear on Instagram.</p>
      </div>

      {/* Instagram post card */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">

        {/* Post header */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">{mockUser.logoInitial}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 leading-tight">{handle}</p>
              <p className="text-xs text-gray-400">Sponsored</p>
            </div>
          </div>
          <MoreHorizontal className="w-5 h-5 text-gray-400" />
        </div>

        {/* Image — 4:5 Instagram ratio */}
        <div
          className="w-full"
          style={{
            aspectRatio: '4/5',
            background: `linear-gradient(135deg, ${image.gradientFrom}, ${image.gradientTo})`,
          }}
        >
          <div className="w-full h-full flex flex-col items-center justify-center p-8 text-white text-center">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-5 backdrop-blur-sm">
              <span className="text-white font-bold text-xl">{mockUser.logoInitial}</span>
            </div>
            <p className="font-bold text-2xl leading-tight">{image.headline}</p>
            <p className="text-sm text-white/80 mt-2">{image.subtext}</p>
            <p className="text-sm font-semibold mt-5 text-white/90">{mockUser.businessName}</p>
          </div>
        </div>

        {/* Action icons */}
        <div className="px-4 pt-3 pb-1">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-4">
              <Heart className="w-6 h-6 text-gray-700" />
              <MessageCircle className="w-6 h-6 text-gray-700" />
              <ShareIcon className="w-6 h-6 text-gray-700" />
            </div>
            <Bookmark className="w-6 h-6 text-gray-700" />
          </div>
          <p className="text-sm font-semibold text-gray-900 mb-1">1,240 likes</p>
          <p className="text-sm text-gray-800 leading-relaxed">
            <span className="font-semibold">{handle}</span>{' '}
            {tagline.text}
          </p>
          <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 mt-1.5">
            {tagline.hashtags.map(h => (
              <span key={h} className="text-sm text-indigo-500">{h}</span>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">View all 48 comments</p>
        </div>

        {/* Comment input mock */}
        <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-3">
          <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-indigo-700 font-bold text-xs">{mockUser.logoInitial}</span>
          </div>
          <p className="text-sm text-gray-400 flex-1">Add a comment…</p>
        </div>
      </div>

      {/* Approval note */}
      <div className="mt-4 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5">
        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
        AI quality checks passed — logo, brand colours, and content relevance verified
      </div>

      {/* CTA */}
      <div className="mt-8 flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          ← Make changes
        </button>
        <button
          onClick={() => router.push('/campaign/published?platforms=instagram')}
          className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
        >
          Continue <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </main>
  )
}

export default function PreviewPage() {
  return (
    <AppLayout>
      <Suspense fallback={
        <div className="flex items-center justify-center py-40 text-gray-400 text-sm">
          Loading preview…
        </div>
      }>
        <PreviewContent />
      </Suspense>
    </AppLayout>
  )
}
