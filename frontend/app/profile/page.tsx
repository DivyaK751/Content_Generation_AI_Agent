'use client'
import AppLayout from '@/components/AppLayout'
import { mockUser } from '@/lib/mock-data'
import { CheckCircle2, Settings, Mail } from 'lucide-react'
import InstagramIcon from '@/components/InstagramIcon'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-5">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 text-sm">{title}</h2>
        <button className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium transition-colors">
          <Settings className="w-3.5 h-3.5" /> Edit
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm text-gray-900 font-medium">{value}</span>
    </div>
  )
}

export default function ProfilePage() {
  return (
    <AppLayout>
      <main className="max-w-2xl mx-auto px-8 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
          <p className="text-gray-500 text-sm mt-1">Your business info and brand settings.</p>
        </div>

        {/* Avatar + name */}
        <div className="bg-white border border-gray-200 rounded-2xl px-6 py-5 mb-5 flex items-center gap-5">
          <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center flex-shrink-0">
            <span className="text-indigo-700 font-bold text-xl">{mockUser.logoInitial}</span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">{mockUser.businessName}</h2>
            <p className="text-sm text-gray-500">{mockUser.industry} · {mockUser.location}</p>
            <p className="text-xs text-indigo-600 mt-1">{mockUser.tagline}</p>
          </div>
        </div>

        <Section title="Business Details">
          <Row label="Business name" value={mockUser.businessName} />
          <Row label="Industry" value={mockUser.industry} />
          <Row label="Location" value={mockUser.location} />
          <Row label="Tone of voice" value={mockUser.tone} />
          <Row label="Target audience" value={mockUser.targetAudience} />
        </Section>

        <Section title="Brand Colors">
          <div className="flex gap-5">
            {[
              { label: 'Primary', color: mockUser.brandColors.primary },
              { label: 'Secondary', color: mockUser.brandColors.secondary },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg border border-gray-200" style={{ background: color }} />
                <div>
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="text-sm font-mono text-gray-700">{color}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Instagram">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-pink-500 to-purple-600 rounded-xl flex items-center justify-center">
                <InstagramIcon className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{mockUser.instagramHandle}</p>
                <p className="text-xs text-gray-400">Business Account connected</p>
              </div>
            </div>
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
              <CheckCircle2 className="w-3 h-3" /> Connected
            </span>
          </div>
        </Section>

        <Section title="Email">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
                <Mail className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{mockUser.senderEmail}</p>
                <p className="text-xs text-gray-400">SendGrid · 1,240 subscribers</p>
              </div>
            </div>
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
              <CheckCircle2 className="w-3 h-3" /> Connected
            </span>
          </div>
        </Section>
      </main>
    </AppLayout>
  )
}
