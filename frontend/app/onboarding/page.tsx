'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, ChevronRight, ChevronLeft, Check, Upload, ImageIcon, X } from 'lucide-react'
import { getToken } from '@/lib/auth'
import { apiPost, apiUpload } from '@/lib/api'

const STEPS = [
  'Business Basics',
  'Brand Identity',
  'Target Audience',
  'Content Preferences',
  'Product Photos',
  'Instagram Setup',
  'Email Setup',
]

const INDUSTRIES = ['Food & Beverage', 'Retail', 'Health & Wellness', 'Beauty & Skincare', 'Fashion', 'Education', 'Real Estate', 'Technology', 'Other']
const TONES = ['Professional', 'Playful & Fun', 'Warm & Friendly', 'Bold & Energetic', 'Luxurious & Premium', 'Minimal & Clean']
const AGE_GROUPS = ['13–17', '18–24', '25–34', '35–44', '45–54', '55+']
const INTERESTS = ['Food', 'Fashion', 'Tech', 'Fitness', 'Travel', 'Beauty', 'Education', 'Home & Garden']
const CONTENT_TYPES = ['Product showcases', 'Promotions & offers', 'Festive & seasonal', 'Behind the scenes', 'Educational / tips', 'Announcements']
const IMAGE_STYLES = ['Photorealistic', 'Illustrated / Artistic', 'Bold text-heavy', 'Minimal & clean', 'Vibrant & colorful']

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
              i < current
                ? 'bg-indigo-600 text-white'
                : i === current
                ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
                : 'bg-gray-100 text-gray-400'
            }`}
          >
            {i < current ? <Check className="w-4 h-4" /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={`h-0.5 w-8 ${i < current ? 'bg-indigo-600' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

function ToggleChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all ${
        selected
          ? 'bg-indigo-600 text-white border-indigo-600'
          : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
      }`}
    >
      {label}
    </button>
  )
}

function InputField({ label, placeholder, value, onChange, type = 'text', optional = false }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void; type?: string; optional?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label} {optional && <span className="text-gray-400 font-normal">(optional)</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
      />
    </div>
  )
}

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [logoFiles, setLogoFiles] = useState<File[]>([])
  const [emailListFile, setEmailListFile] = useState<File | null>(null)
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const logoInputRef = useRef<HTMLInputElement>(null)
  const emailListInputRef = useRef<HTMLInputElement>(null)
  const photosInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    businessName: '', industry: '', description: '', location: '', website: '',
    primaryColor: '#4F46E5', secondaryColor: '#E0E7FF', brandTagline: '', tone: '',
    targetCustomer: '', ageGroups: [] as string[], genderSkew: 'All genders', interests: [] as string[],
    contentTypes: [] as string[], imageStyle: '', language: 'English', avoidTopics: '',
    instagramHandle: '', instagramPageId: '', instagramToken: '',
    senderName: '', senderEmail: '', sendgridKey: '',
  })

  useEffect(() => {
    if (!getToken()) router.replace('/')
  }, [router])

  const set = (field: string, value: string | string[]) => setForm(prev => ({ ...prev, [field]: value }))
  const toggle = (field: string, value: string) => {
    const arr = form[field as keyof typeof form] as string[]
    set(field, arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value])
  }

  async function handleFinish() {
    const token = getToken()
    if (!token) { router.replace('/'); return }
    setSubmitting(true)
    setError('')
    try {
      for (const logo of logoFiles) {
        await apiUpload('/logo-upload', logo, token)
      }
      if (emailListFile) {
        await apiUpload('/email-list-upload', emailListFile, token)
      }
      for (const photo of photoFiles) {
        await apiUpload('/photos-upload', photo, token)
      }
      console.log('Submitting onboarding form…', form)
      await apiPost('/onboarding', {
        business_name: form.businessName,
        industry: form.industry,
        description: form.description,
        location: form.location,
        website: form.website,
        brand_colors: JSON.stringify({ primary: form.primaryColor, secondary: form.secondaryColor }),
        tagline: form.brandTagline,
        tone: form.tone,
        target_audience: form.targetCustomer,
        age_group: form.ageGroups.join(', '),
        gender: form.genderSkew,
        interests: form.interests.join(', '),
        content_types: form.contentTypes.join(', '),
        image_style: form.imageStyle,
        language: form.language,
        guidelines: form.avoidTopics,
        instagram_handle: form.instagramHandle,
        instagram_page_id: form.instagramPageId,
        instagram_access_token: form.instagramToken,
        sender_name: form.senderName,
        sender_email: form.senderEmail,
        sendgrid_api_key: form.sendgridKey,
      }, token)
      router.push('/campaign/new')
    } catch (err) {
      console.error('Onboarding error:', err)
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const stepContent = [
    // Step 0 — Business Basics
    <div key={0} className="space-y-5">
      <InputField label="Business name" placeholder="e.g. Crema Coffee Co." value={form.businessName} onChange={v => set('businessName', v)} />
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Industry / category</label>
        <select
          value={form.industry}
          onChange={e => set('industry', e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          <option value="">Select industry…</option>
          {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Short business description</label>
        <textarea
          value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder="2–3 sentences about your business…"
          rows={3}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
      </div>
      <InputField label="Business location" placeholder="City, Country — e.g. Mumbai, India" value={form.location} onChange={v => set('location', v)} />
      <InputField label="Website URL" placeholder="https://yoursite.com" value={form.website} onChange={v => set('website', v)} optional />
    </div>,

    // Step 1 — Brand Identity
    <div key={1} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Logo upload</label>
        <div
          onClick={() => logoInputRef.current?.click()}
          className="border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center gap-2 hover:border-indigo-300 cursor-pointer transition-colors"
        >
          <Upload className="w-6 h-6 text-gray-400" />
          {logoFiles.length > 0
            ? <span className="text-sm text-indigo-600 font-medium">{logoFiles.length} file{logoFiles.length > 1 ? 's' : ''} selected</span>
            : <span className="text-sm text-gray-500">Drop your logos here or <span className="text-indigo-600 font-medium">browse</span></span>
          }
          <span className="text-xs text-gray-400">PNG with transparent background preferred · multiple allowed</span>
        </div>
        {logoFiles.length > 0 && (
          <ul className="mt-2 space-y-1">
            {logoFiles.map((f, i) => (
              <li key={i} className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-1.5">
                <span className="truncate">{f.name}</span>
                <button type="button" onClick={() => setLogoFiles(p => p.filter((_, j) => j !== i))} className="ml-2 text-gray-400 hover:text-red-400">✕</button>
              </li>
            ))}
          </ul>
        )}
        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg"
          multiple
          className="hidden"
          onChange={e => {
            if (e.target.files) {
              const selected = Array.from(e.target.files)
              setLogoFiles(p => [...p, ...selected])
              e.target.value = ''
            }
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Primary brand color</label>
          <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-2.5">
            <input type="color" value={form.primaryColor} onChange={e => set('primaryColor', e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" />
            <span className="text-sm text-gray-600 font-mono">{form.primaryColor}</span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Secondary color <span className="text-gray-400 font-normal">(optional)</span></label>
          <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-2.5">
            <input type="color" value={form.secondaryColor} onChange={e => set('secondaryColor', e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" />
            <span className="text-sm text-gray-600 font-mono">{form.secondaryColor}</span>
          </div>
        </div>
      </div>
      <InputField label="Brand tagline / slogan" placeholder="e.g. Every cup tells a story" value={form.brandTagline} onChange={v => set('brandTagline', v)} optional />
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Tone of voice</label>
        <div className="flex flex-wrap gap-2">
          {TONES.map(t => (
            <ToggleChip key={t} label={t} selected={form.tone === t} onClick={() => set('tone', t)} />
          ))}
        </div>
      </div>
    </div>,

    // Step 2 — Target Audience
    <div key={2} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Who is your typical customer?</label>
        <textarea
          value={form.targetCustomer}
          onChange={e => set('targetCustomer', e.target.value)}
          placeholder="e.g. Health-conscious working professionals aged 25–40 who value quality…"
          rows={3}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Age group <span className="text-gray-400 font-normal">(select all that apply)</span></label>
        <div className="flex flex-wrap gap-2">
          {AGE_GROUPS.map(a => (
            <ToggleChip key={a} label={a} selected={form.ageGroups.includes(a)} onClick={() => toggle('ageGroups', a)} />
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Gender skew</label>
        <div className="flex gap-2">
          {['All genders', 'Mostly female', 'Mostly male'].map(g => (
            <ToggleChip key={g} label={g} selected={form.genderSkew === g} onClick={() => set('genderSkew', g)} />
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Customer interests</label>
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map(i => (
            <ToggleChip key={i} label={i} selected={form.interests.includes(i)} onClick={() => toggle('interests', i)} />
          ))}
        </div>
      </div>
    </div>,

    // Step 3 — Content Preferences
    <div key={3} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Content types <span className="text-gray-400 font-normal">(select all that apply)</span></label>
        <div className="flex flex-wrap gap-2">
          {CONTENT_TYPES.map(c => (
            <ToggleChip key={c} label={c} selected={form.contentTypes.includes(c)} onClick={() => toggle('contentTypes', c)} />
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Preferred image style</label>
        <div className="flex flex-wrap gap-2">
          {IMAGE_STYLES.map(s => (
            <ToggleChip key={s} label={s} selected={form.imageStyle === s} onClick={() => set('imageStyle', s)} />
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Preferred language</label>
        <select
          value={form.language}
          onChange={e => set('language', e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          {['English', 'Hindi', 'Spanish', 'French', 'Arabic', 'Portuguese', 'Mandarin'].map(l => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Topics / guidelines <span className="text-gray-400 font-normal">(optional)</span></label>
        <input
          type="text"
          value={form.avoidTopics}
          onChange={e => set('avoidTopics', e.target.value)}
          placeholder="e.g. avoid politics, religion, competitor mentions…"
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
    </div>,

    // Step 4 — Product Photos
    <div key={4} className="space-y-5">
      <p className="text-sm text-gray-500 leading-relaxed">
        Upload product shots, store photos, or lifestyle images. These are used as visual references when generating campaign images.
      </p>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Product photos <span className="text-gray-400 font-normal">(optional — select multiple)</span>
        </label>
        <div
          onClick={() => photosInputRef.current?.click()}
          className="border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center gap-2 hover:border-indigo-300 cursor-pointer transition-colors"
        >
          <Upload className="w-5 h-5 text-gray-400" />
          <span className="text-sm text-gray-500">
            Drop photos here or <span className="text-indigo-600 font-medium">browse</span>
          </span>
          <span className="text-xs text-gray-400">PNG, JPG · up to 10 MB each</span>
        </div>
        <input
          ref={photosInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => {
            if (e.target.files) {
              const selected = Array.from(e.target.files)
              setPhotoFiles(p => [...p, ...selected])
              e.target.value = ''
            }
          }}
        />
        {photoFiles.length > 0 && (
          <div className="mt-3 space-y-2">
            {photoFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-100">
                <ImageIcon className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{f.name}</p>
                  <p className="text-xs text-gray-400">{(f.size / 1024).toFixed(1)} KB</p>
                </div>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setPhotoFiles(p => p.filter((_, j) => j !== i)) }}
                  className="text-gray-300 hover:text-red-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,

    // Step 5 — Instagram Setup
    <div key={5} className="space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
        You&apos;ll need an Instagram Business Account and a Meta Developer App to get these credentials.
      </div>
      <InputField label="Instagram handle" placeholder="@yourbusiness" value={form.instagramHandle} onChange={v => set('instagramHandle', v)} />
      <InputField label="Instagram Business Account ID" placeholder="e.g. 17841400000000000" value={form.instagramPageId} onChange={v => set('instagramPageId', v)} />
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Instagram Page Access Token</label>
        <input
          type="password"
          value={form.instagramToken}
          onChange={e => set('instagramToken', e.target.value)}
          placeholder="EAAxxxx… (from Meta Developer App)"
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
    </div>,

    // Step 6 — Email Setup
    <div key={6} className="space-y-5">
      <InputField label="Sender name" placeholder="e.g. Crema Coffee Co." value={form.senderName} onChange={v => set('senderName', v)} />
      <InputField label="Sender email address" placeholder="hello@yourbusiness.com" value={form.senderEmail} onChange={v => set('senderEmail', v)} type="email" />
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Email list upload</label>
        <div
          onClick={() => emailListInputRef.current?.click()}
          className="border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center gap-2 hover:border-indigo-300 cursor-pointer transition-colors"
        >
          <Upload className="w-5 h-5 text-gray-400" />
          {emailListFile
            ? <span className="text-sm text-indigo-600 font-medium">{emailListFile.name}</span>
            : <span className="text-sm text-gray-500">Upload CSV <span className="text-indigo-600 font-medium">browse</span></span>
          }
          <span className="text-xs text-gray-400">Format: email, first_name</span>
        </div>
        <input
          ref={emailListInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={e => setEmailListFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">SendGrid API key</label>
        <input
          type="password"
          value={form.sendgridKey}
          onChange={e => set('sendgridKey', e.target.value)}
          placeholder="SG.xxxx…"
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
    </div>,

  ]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-xl">
        {/* Header */}
        <div className="px-8 pt-8 pb-6 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-gray-700">ContentAI — Onboarding</span>
          </div>
          <StepIndicator current={step} total={STEPS.length} />
          <h2 className="text-xl font-bold text-gray-900">{STEPS[step]}</h2>
          <p className="text-sm text-gray-500 mt-1">Step {step + 1} of {STEPS.length}</p>
        </div>

        {/* Form content */}
        <div className="px-8 py-6">
          {stepContent[step]}
        </div>

        {/* Error */}
        {error && (
          <div className="px-8 pb-2">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Navigation */}
        <div className="px-8 pb-8 flex items-center justify-between">
          <button
            onClick={() => step > 0 ? setStep(s => s - 1) : router.push('/')}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 0 ? 'Back to login' : 'Back'}
          </button>

          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={submitting}
              className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-60"
            >
              {submitting ? 'Saving…' : <><Check className="w-4 h-4" /> Finish Setup</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
