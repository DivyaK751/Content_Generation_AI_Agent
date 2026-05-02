'use client'
import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AppLayout from '@/components/AppLayout'
import { mockUser } from '@/lib/mock-data'
import { CheckCircle2, Mail, ExternalLink, ArrowRight, Copy, Loader2 } from 'lucide-react'
import InstagramIcon from '@/components/InstagramIcon'

function PublishedContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const platforms = searchParams.get('platforms') ?? 'both'

  const showInstagram = platforms === 'instagram' || platforms === 'both'
  const showEmail = platforms === 'email' || platforms === 'both'

  const platformLabel = platforms === 'both'
    ? 'Instagram + Email'
    : platforms === 'instagram'
    ? 'Instagram'
    : 'Email'

  return (
    <AppLayout>
      <main className="max-w-2xl mx-auto px-6 py-14">
        {/* Success hero */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-9 h-9 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Campaign Published!</h1>
          <p className="text-gray-500 text-sm">
            {showInstagram && showEmail
              ? 'Your post is live on Instagram and emails are on their way.'
              : showInstagram
              ? 'Your post is live on Instagram.'
              : 'Your emails are on their way to your list.'}
          </p>
        </div>

        {/* Results */}
        <div className="space-y-4 mb-8">

          {/* Instagram result */}
          {showInstagram && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-purple-600 rounded-xl flex items-center justify-center">
                    <InstagramIcon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">Instagram</p>
                    <p className="text-xs text-gray-400 mt-0.5">{mockUser.instagramHandle}</p>
                  </div>
                </div>
                <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">Live</span>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-xs text-gray-500 flex-1 truncate font-mono">
                    https://instagram.com/p/mock_post_id_xyz
                  </span>
                  <button className="text-gray-400 hover:text-gray-600 transition-colors">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button className="text-indigo-600 hover:text-indigo-700 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Email result */}
          {showEmail && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
                    <Mail className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">Email Campaign</p>
                    <p className="text-xs text-gray-400 mt-0.5">Sent via SendGrid · {mockUser.senderEmail}</p>
                  </div>
                </div>
                <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">Delivered</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 pt-4 border-t border-gray-100">
                {[
                  { label: 'Recipients', value: '1,240' },
                  { label: 'Delivered', value: '1,238' },
                  { label: 'Delivery rate', value: '99.8%' },
                ].map(stat => (
                  <div key={stat.label} className="text-center">
                    <p className="text-lg font-bold text-gray-900">{stat.value}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Campaign summary */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-8">
          <h2 className="font-semibold text-gray-900 text-sm mb-3">Campaign Summary</h2>
          <div className="space-y-0">
            {[
              { label: 'Business', value: mockUser.businessName },
              { label: 'Theme', value: 'Summer Cold Brew Season' },
              { label: 'Published at', value: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) },
              { label: 'Platforms', value: platformLabel },
            ].map(row => (
              <div key={row.label} className="flex justify-between py-2.5 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-500">{row.label}</span>
                <span className="text-sm text-gray-900 font-medium">{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Back to Dashboard <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => router.push('/campaign/new?mode=occasion')}
            className="flex-1 border border-gray-200 text-gray-700 py-3 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Create Another Campaign
          </button>
        </div>
      </main>
    </AppLayout>
  )
}

export default function PublishedPage() {
  return (
    <Suspense fallback={
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      </AppLayout>
    }>
      <PublishedContent />
    </Suspense>
  )
}
