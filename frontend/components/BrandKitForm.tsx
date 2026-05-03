'use client'
import { useState, useRef, useEffect } from 'react'
import { X, Upload, ImageIcon, Eye, EyeOff, Loader2, Trash2 } from 'lucide-react'
import { BRAND_SECTIONS, type Section } from './ProfilePanel'
import { apiUpload, apiGet, apiPatch, apiDelete } from '@/lib/api'
import { getToken } from '@/lib/auth'
import type { BrandKitData } from '@/lib/types'

// ── Shared primitives ─────────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{children}</p>
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full text-sm text-gray-800 border border-gray-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
    />
  )
}

function TextareaInput({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full text-sm text-gray-800 border border-gray-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none transition-all"
    />
  )
}

function SelectInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full text-sm text-gray-800 border border-gray-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-indigo-400 bg-white"
    >
      {options.map(o => <option key={o}>{o}</option>)}
    </select>
  )
}

function PasswordInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm text-gray-800 border border-gray-200 rounded-xl px-3.5 py-2.5 pr-10 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

function PillCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-xs font-medium transition-all select-none ${
      checked ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
    }`}>
      <input type="checkbox" checked={checked} onChange={onChange} className="hidden" />
      {label}
    </label>
  )
}

function FileUploadArea({ multiple, accept = 'image/*', hint, files, onAdd, onRemove }: {
  multiple?: boolean; accept?: string; hint: string
  files: File[]; onAdd: (f: File[]) => void; onRemove: (i: number) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="space-y-2">
      <div
        onClick={() => ref.current?.click()}
        className="flex flex-col items-center gap-2 border-2 border-dashed border-gray-200 rounded-xl p-6 hover:border-indigo-300 cursor-pointer group transition-colors"
      >
        <input
          ref={ref}
          type="file"
          multiple={multiple}
          accept={accept}
          className="hidden"
          onChange={e => {
            if (e.target.files) {
              const selected = Array.from(e.target.files)
              onAdd(selected)
              e.target.value = ''
            }
          }}
        />
        <Upload className="w-5 h-5 text-gray-400 group-hover:text-indigo-400 transition-colors" />
        <p className="text-sm text-gray-500 text-center">
          {hint}<br />
          <span className="text-xs text-gray-400">PNG, SVG, JPG · up to 5 MB each</span>
        </p>
      </div>
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-100">
              <ImageIcon className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate">{f.name}</p>
                <p className="text-xs text-gray-400">{(f.size / 1024).toFixed(1)} KB</p>
              </div>
              <button onClick={() => onRemove(i)} className="text-gray-300 hover:text-red-400 flex-shrink-0 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Confirm delete modal ──────────────────────────────────────────────────────
function ConfirmDeleteModal({ label, onConfirm, onCancel, deleting }: {
  label: string
  onConfirm: () => void
  onCancel: () => void
  deleting: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl px-7 py-6 max-w-sm w-full mx-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <Trash2 className="w-4 h-4 text-red-500" />
          </div>
          <p className="text-sm font-semibold text-gray-900">Delete {label}?</p>
        </div>
        <p className="text-sm text-gray-500 mb-5">
          This will permanently delete the file from your brand kit and storage. This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 bg-red-500 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Save button ───────────────────────────────────────────────────────────────
function SaveButton({ onClick, saving }: { onClick: () => void; saving: boolean }) {
  return (
    <div className="pt-6 mt-2 border-t border-gray-100">
      <button
        onClick={onClick}
        disabled={saving}
        className="bg-indigo-600 text-white text-sm font-medium px-6 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </div>
  )
}

// ── Convert legacy gs:// URLs to HTTPS ───────────────────────────────────────
function toHttpsUrl(url: string | undefined | null): string | null {
  if (!url) return null
  if (url.startsWith('https://')) return url
  return url.replace('gs://', 'https://storage.googleapis.com/')
}

// ── Helper to PATCH brand-kit ─────────────────────────────────────────────────
async function saveBrandKit(updates: Record<string, string>): Promise<void> {
  const token = getToken()
  if (!token) throw new Error('Not authenticated')
  await apiPatch('/brand-kit', updates, token)
}

// ── Section forms ─────────────────────────────────────────────────────────────
function SummarySection({ data }: { data: BrandKitData }) {
  const [form, setForm] = useState({
    businessName: data.business_name ?? '',
    industry: data.industry ?? '',
    description: data.description ?? '',
    location: data.location ?? '',
    website: data.website ?? '',
  })
  const [saving, setSaving] = useState(false)
  const s = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }))

  async function handleSave() {
    setSaving(true)
    try {
      await saveBrandKit({
        business_name: form.businessName,
        industry: form.industry,
        description: form.description,
        location: form.location,
        website: form.website,
      })
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <div><Label>Business Name</Label><TextInput value={form.businessName} onChange={s('businessName')} /></div>
      <div>
        <Label>Industry</Label>
        <select
          value={form.industry}
          onChange={e => s('industry')(e.target.value)}
          className="w-full text-sm text-gray-800 border border-gray-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-indigo-400 bg-white"
        >
          <option value="">Select industry…</option>
          {['Food & Beverage', 'Retail', 'Health & Wellness', 'Beauty & Skincare',
            'Fashion', 'Education', 'Real Estate', 'Technology', 'Other',
          ].map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <div><Label>Business Description</Label><TextareaInput value={form.description} onChange={s('description')} placeholder="What does your business do?" rows={4} /></div>
      <div><Label>Location</Label><TextInput value={form.location} onChange={s('location')} placeholder="City, Country" /></div>
      <div><Label>Website</Label><TextInput value={form.website} onChange={s('website')} placeholder="https://yourwebsite.com" /></div>
      <SaveButton onClick={handleSave} saving={saving} />
    </div>
  )
}

function LogosSection({ data }: { data: BrandKitData }) {
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [logos, setLogos] = useState<UserLogo[]>([])
  const [loadingLogos, setLoadingLogos] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<UserLogo | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const token = getToken()
    if (!token) { setLoadingLogos(false); return }
    apiGet<{ logos: UserLogo[] }>('/user-logos', token)
      .then(res => setLogos(res.logos))
      .catch(() => {})
      .finally(() => setLoadingLogos(false))
  }, [])

  async function handleSave() {
    const token = getToken()
    if (!token || files.length === 0) return
    setSaving(true)
    try {
      const uploaded: UserLogo[] = []
      for (const file of files) {
        const res = await apiUpload<{ logo_id: string; gcs_url: string }>('/logo-upload', file, token)
        uploaded.push({ logo_id: res.logo_id, gcs_url: res.gcs_url, filename: file.name })
      }
      setLogos(p => [...uploaded, ...p])
      setFiles([])
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!confirmDelete) return
    const token = getToken()
    if (!token) return
    setDeleting(true)
    try {
      await apiDelete(`/logo/${confirmDelete.logo_id}`, token)
      setLogos(p => p.filter(lg => lg.logo_id !== confirmDelete.logo_id))
      setConfirmDelete(null)
    } catch { /* leave modal open on error */ }
    finally { setDeleting(false) }
  }

  return (
    <div className="space-y-6">
      {confirmDelete && (
        <ConfirmDeleteModal
          label={`logo "${confirmDelete.filename}"`}
          onConfirm={handleDelete}
          onCancel={() => !deleting && setConfirmDelete(null)}
          deleting={deleting}
        />
      )}
      <p className="text-sm text-gray-500 leading-relaxed">All uploaded logos are kept — upload as many versions as you need.</p>
      <div>
        <Label>Uploaded Logos ({logos.length})</Label>
        {loadingLogos ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm mt-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : logos.length === 0 ? (
          <p className="text-sm text-gray-400 mt-2">No logos uploaded yet.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3 mt-2">
            {logos.map(lg => (
              <div key={lg.logo_id} className="aspect-square rounded-xl overflow-hidden bg-white border border-gray-200 relative group">
                <img
                  src={toHttpsUrl(lg.gcs_url) ?? ''}
                  alt={lg.filename}
                  className="w-full h-full object-contain p-2"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                <button
                  onClick={() => setConfirmDelete(lg)}
                  className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-sm"
                  title="Delete logo"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
                <p className="absolute bottom-0 left-0 right-0 text-xs text-white bg-black/40 px-2 py-1 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                  {lg.filename}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <Label>Upload More Logos</Label>
        <FileUploadArea multiple hint="Click to upload one or more logo files" files={files}
          onAdd={f => setFiles(p => [...p, ...f])} onRemove={i => setFiles(p => p.filter((_, j) => j !== i))} />
      </div>
      <div className="pt-6 mt-2 border-t border-gray-100">
        <button onClick={handleSave} disabled={saving || files.length === 0}
          className="bg-indigo-600 text-white text-sm font-medium px-6 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          {saving ? 'Uploading…' : 'Save Changes'}
        </button>
        {files.length === 0 && <p className="text-xs text-gray-400 mt-2">Upload a logo file to enable save.</p>}
      </div>
    </div>
  )
}

function ColorsSection({ data }: { data: BrandKitData }) {
  const parsed = (() => {
    try { return JSON.parse(data.brand_colors ?? '{}') } catch { return {} }
  })()

  const defaults = ['#4F46E5', '#E0E7FF', '#F59E0B', '#10B981']
  const initColors = (): [string, string, string, string] => {
    if (Array.isArray(parsed.colors) && parsed.colors.length >= 4) {
      return parsed.colors.slice(0, 4) as [string, string, string, string]
    }
    // migrate legacy primary/secondary
    return [parsed.primary ?? defaults[0], parsed.secondary ?? defaults[1], defaults[2], defaults[3]]
  }

  const [colors, setColors] = useState<[string, string, string, string]>(initColors)
  const [saving, setSaving] = useState(false)

  function setColor(index: number, value: string) {
    setColors(prev => { const next = [...prev] as [string, string, string, string]; next[index] = value; return next })
  }

  async function handleSave() {
    setSaving(true)
    try { await saveBrandKit({ brand_colors: JSON.stringify({ colors }) }) }
    finally { setSaving(false) }
  }

  const labels = ['Colour 1', 'Colour 2', 'Colour 3', 'Colour 4']

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">Add up to 4 brand colours. Each campaign will pick one as its palette anchor.</p>
      <div className="grid grid-cols-2 gap-4">
        {colors.map((value, i) => (
          <div key={i}>
            <Label>{labels[i]}</Label>
            <div className="flex items-center gap-3 mt-1">
              <input type="color" value={value} onChange={e => setColor(i, e.target.value)}
                className="w-12 h-12 rounded-xl border border-gray-200 cursor-pointer p-1 bg-white flex-shrink-0" />
              <TextInput value={value} onChange={v => setColor(i, v)} placeholder="#000000" />
            </div>
          </div>
        ))}
      </div>
      <div>
        <Label>Palette Preview</Label>
        <div className="flex h-14 rounded-xl overflow-hidden">
          {colors.map((c, i) => (
            <div key={i} className="flex-1" style={{ background: c }} />
          ))}
        </div>
      </div>
      <SaveButton onClick={handleSave} saving={saving} />
    </div>
  )
}

function GuidelinesSection({ data }: { data: BrandKitData }) {
  const contentOptions = ['Product showcases', 'Promotions & offers', 'Festive & seasonal', 'Behind the scenes', 'Educational / tips', 'Announcements']
  const [tagline, setTagline] = useState(data.tagline ?? '')
  const [tone, setTone] = useState(data.tone ?? 'Warm & Friendly')
  const [imageStyle, setImageStyle] = useState(data.image_style ?? 'Lifestyle Photography')
  const [language, setLanguage] = useState(data.language ?? 'English')
  const [brandFont, setBrandFont] = useState(data.brand_font ?? '')
  const [taglineFont, setTaglineFont] = useState(data.tagline_font ?? '')
  const [bodyFont, setBodyFont] = useState(data.body_font ?? '')
  const [contentTypes, setContentTypes] = useState<string[]>(
    data.content_types ? data.content_types.split(',').map(s => s.trim()).filter(Boolean) : []
  )
  const [avoidTopics, setAvoidTopics] = useState(data.guidelines ?? '')
  const [saving, setSaving] = useState(false)
  const toggleContent = (item: string) =>
    setContentTypes(p => p.includes(item) ? p.filter(x => x !== item) : [...p, item])

  async function handleSave() {
    setSaving(true)
    try {
      await saveBrandKit({
        tagline, tone, image_style: imageStyle, language,
        brand_font: brandFont, tagline_font: taglineFont, body_font: bodyFont,
        content_types: contentTypes.join(', '), guidelines: avoidTopics,
      })
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <div><Label>Brand Tagline</Label><TextInput value={tagline} onChange={setTagline} placeholder="Your brand's key message" /></div>
      <div>
        <Label>Brand Fonts</Label>
        <p className="text-xs text-gray-400 mb-2">These fonts will be used when generating images so your brand text looks consistent.</p>
        <div className="grid grid-cols-3 gap-3">
          {([
            ['Brand name font', brandFont, setBrandFont],
            ['Tagline font', taglineFont, setTaglineFont],
            ['Body / other text font', bodyFont, setBodyFont],
          ] as [string, string, (v: string) => void][]).map(([label, value, set]) => (
            <div key={label}>
              <Label>{label}</Label>
              <SelectInput value={value} onChange={set} options={[
                '',
                'Dancing Script', 'Great Vibes',
                'Cormorant Garamond', 'Playfair Display', 'Lora', 'Merriweather',
                'Montserrat Bold', 'Raleway', 'Lato Light', 'Open Sans', 'Roboto', 'Nunito',
                'Bebas Neue',
              ]} />
            </div>
          ))}
        </div>
      </div>
      <div><Label>Brand Tone</Label><SelectInput value={tone} onChange={setTone} options={['Professional', 'Playful & Fun', 'Warm & Friendly', 'Bold & Energetic', 'Luxurious & Premium', 'Minimal & Clean']} /></div>
      <div><Label>Image Style Preference</Label><SelectInput value={imageStyle} onChange={setImageStyle} options={['Photorealistic', 'Illustrated / Artistic', 'Bold text-heavy', 'Minimal & clean', 'Vibrant & colorful']} /></div>
      <div><Label>Content Language</Label><SelectInput value={language} onChange={setLanguage} options={['English', 'Hindi', 'Spanish', 'French', 'Arabic', 'Portuguese', 'Mandarin']} /></div>
      <div>
        <Label>Content Types to Generate</Label>
        <div className="flex flex-wrap gap-2 mt-1">
          {contentOptions.map(c => <PillCheckbox key={c} label={c} checked={contentTypes.includes(c)} onChange={() => toggleContent(c)} />)}
        </div>
      </div>
      <div><Label>Topics to Avoid</Label><TextareaInput value={avoidTopics} onChange={setAvoidTopics} placeholder="e.g. competitor mentions, politics…" rows={3} /></div>
      <SaveButton onClick={handleSave} saving={saving} />
    </div>
  )
}

function AudienceSection({ data }: { data: BrandKitData }) {
  const ageOptions = ['13–17', '18–24', '25–34', '35–44', '45–54', '55+']
  const [customer, setCustomer] = useState(data.target_audience ?? '')
  const [ageGroups, setAgeGroups] = useState<string[]>(
    data.age_group ? data.age_group.split(',').map(s => s.trim()).filter(Boolean) : []
  )
  const [genderSkew, setGenderSkew] = useState(data.gender ?? 'All genders')
  const [interests, setInterests] = useState(data.interests ?? '')
  const [saving, setSaving] = useState(false)
  const toggleAge = (a: string) => setAgeGroups(p => p.includes(a) ? p.filter(x => x !== a) : [...p, a])

  async function handleSave() {
    setSaving(true)
    try {
      await saveBrandKit({
        target_audience: customer, age_group: ageGroups.join(', '),
        gender: genderSkew, interests,
      })
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <div><Label>Target Customer Description</Label><TextareaInput value={customer} onChange={setCustomer} placeholder="Describe your ideal customer…" rows={3} /></div>
      <div>
        <Label>Age Groups</Label>
        <div className="flex flex-wrap gap-2 mt-1">
          {ageOptions.map(a => <PillCheckbox key={a} label={a} checked={ageGroups.includes(a)} onChange={() => toggleAge(a)} />)}
        </div>
      </div>
      <div>
        <Label>Gender Skew</Label>
        <div className="flex gap-5 mt-1">
          {['All genders', 'Mostly female', 'Mostly male'].map(g => (
            <label key={g} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={genderSkew === g} onChange={() => setGenderSkew(g)} className="accent-indigo-600" />
              <span className="text-sm text-gray-700">{g}</span>
            </label>
          ))}
        </div>
      </div>
      <div><Label>Interests & Hobbies</Label><TextareaInput value={interests} onChange={setInterests} placeholder="e.g. fitness, travel, cooking — comma-separated" rows={2} /></div>
      <SaveButton onClick={handleSave} saving={saving} />
    </div>
  )
}

function InstagramSection({ data }: { data: BrandKitData }) {
  const [handle, setHandle] = useState(data.instagram_handle ?? '')
  const [pageId, setPageId] = useState(data.instagram_page_id ?? '')
  const [token, setToken] = useState(data.instagram_access_token ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await saveBrandKit({ instagram_handle: handle, instagram_page_id: pageId, instagram_access_token: token })
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <div><Label>Instagram Handle</Label><TextInput value={handle} onChange={setHandle} placeholder="@yourhandle" /></div>
      <div><Label>Business Account ID</Label><TextInput value={pageId} onChange={setPageId} placeholder="Instagram Page / Account ID" /></div>
      <div>
        <Label>Page Access Token</Label>
        <PasswordInput value={token} onChange={setToken} placeholder="EAAxxxxxx…" />
        <p className="text-xs text-gray-400 mt-2">Generated in the Meta Developer Console. Required to post via the Graph API.</p>
      </div>
      <SaveButton onClick={handleSave} saving={saving} />
    </div>
  )
}

function EmailSection({ data }: { data: BrandKitData }) {
  const [senderName, setSenderName] = useState(data.sender_name ?? '')
  const [senderEmail, setSenderEmail] = useState(data.sender_email ?? '')
  const [sendgridKey, setSendgridKey] = useState(data.sendgrid_api_key ?? '')
  const [csvFiles, setCsvFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const token = getToken()
      if (csvFiles.length > 0 && token) {
        const { apiUpload: upload } = await import('@/lib/api')
        await upload('/email-list-upload', csvFiles[0], token)
      }
      await saveBrandKit({ sender_name: senderName, sender_email: senderEmail, sendgrid_api_key: sendgridKey })
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <div><Label>Sender Name</Label><TextInput value={senderName} onChange={setSenderName} placeholder="Your name or brand name" /></div>
      <div><Label>Sender Email</Label><TextInput value={senderEmail} onChange={setSenderEmail} placeholder="hello@yourbrand.com" /></div>
      <div>
        <Label>Email List (CSV)</Label>
        <FileUploadArea accept=".csv" hint="Upload your subscriber CSV file" files={csvFiles}
          onAdd={f => setCsvFiles(p => [...p, ...f])} onRemove={i => setCsvFiles(p => p.filter((_, j) => j !== i))} />
        <p className="text-xs text-gray-400 mt-2">CSV must have a column named <code className="bg-gray-100 px-1 rounded">email</code>.</p>
      </div>
      <div>
        <Label>SendGrid API Key</Label>
        <PasswordInput value={sendgridKey} onChange={setSendgridKey} placeholder="SG.xxxxxxxx…" />
      </div>
      <SaveButton onClick={handleSave} saving={saving} />
    </div>
  )
}

interface UserPhoto { photo_id: string; gcs_url: string; filename: string }
interface UserLogo { logo_id: string; gcs_url: string; filename: string }

function PhotosSection({ data }: { data: BrandKitData }) {
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [photos, setPhotos] = useState<UserPhoto[]>([])
  const [loadingPhotos, setLoadingPhotos] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<UserPhoto | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const token = getToken()
    if (!token) { setLoadingPhotos(false); return }
    apiGet<{ photos: UserPhoto[] }>('/user-photos', token)
      .then(res => setPhotos(res.photos))
      .catch(() => {})
      .finally(() => setLoadingPhotos(false))
  }, [])

  async function handleSave() {
    const token = getToken()
    if (!token || files.length === 0) return
    setSaving(true)
    try {
      const uploaded: UserPhoto[] = []
      for (const photo of files) {
        const res = await apiUpload<{ photo_id: string; gcs_url: string }>('/photos-upload', photo, token)
        uploaded.push({ photo_id: res.photo_id, gcs_url: res.gcs_url, filename: photo.name })
      }
      setPhotos(p => [...uploaded, ...p])
      setFiles([])
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!confirmDelete) return
    const token = getToken()
    if (!token) return
    setDeleting(true)
    try {
      await apiDelete(`/photo/${confirmDelete.photo_id}`, token)
      setPhotos(p => p.filter(ph => ph.photo_id !== confirmDelete.photo_id))
      setConfirmDelete(null)
    } catch { /* leave modal open on error */ }
    finally { setDeleting(false) }
  }

  return (
    <div className="space-y-6">
      {confirmDelete && (
        <ConfirmDeleteModal
          label={`photo "${confirmDelete.filename}"`}
          onConfirm={handleDelete}
          onCancel={() => !deleting && setConfirmDelete(null)}
          deleting={deleting}
        />
      )}
      <p className="text-sm text-gray-500 leading-relaxed">Brand photos are used as visual references when generating images.</p>
      <div>
        <Label>Uploaded Photos ({photos.length})</Label>
        {loadingPhotos ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm mt-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : photos.length === 0 ? (
          <p className="text-sm text-gray-400 mt-2">No photos uploaded yet.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3 mt-2">
            {photos.map(ph => (
              <div key={ph.photo_id} className="aspect-square rounded-xl overflow-hidden bg-gray-100 relative group">
                <img
                  src={toHttpsUrl(ph.gcs_url) ?? ''}
                  alt={ph.filename}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                <button
                  onClick={() => setConfirmDelete(ph)}
                  className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-sm"
                  title="Delete photo"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
                <p className="absolute bottom-0 left-0 right-0 text-xs text-white bg-black/40 px-2 py-1 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                  {ph.filename}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <Label>Upload More Photos</Label>
        <FileUploadArea multiple hint="Click to upload one or more brand photos" files={files}
          onAdd={f => setFiles(prev => [...prev, ...f])} onRemove={i => setFiles(p => p.filter((_, j) => j !== i))} />
      </div>
      <div className="pt-6 mt-2 border-t border-gray-100">
        <button onClick={handleSave} disabled={saving || files.length === 0}
          className="bg-indigo-600 text-white text-sm font-medium px-6 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          {saving ? 'Uploading…' : 'Save Changes'}
        </button>
        {files.length === 0 && <p className="text-xs text-gray-400 mt-2">Upload photos to enable save.</p>}
      </div>
    </div>
  )
}

function SectionContent({ s, data }: { s: Section; data: BrandKitData }) {
  switch (s) {
    case 'summary':    return <SummarySection data={data} />
    case 'logos':      return <LogosSection data={data} />
    case 'colors':     return <ColorsSection data={data} />
    case 'guidelines': return <GuidelinesSection data={data} />
    case 'audience':   return <AudienceSection data={data} />
    case 'instagram':  return <InstagramSection data={data} />
    case 'email':      return <EmailSection data={data} />
    case 'photos':     return <PhotosSection data={data} />
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function BrandKitForm({ section, onClose }: { section: Section; onClose: () => void }) {
  const label = BRAND_SECTIONS.find(s => s.key === section)?.label ?? ''
  const [data, setData] = useState<BrandKitData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const token = getToken()
    if (!token) { setLoading(false); setError('Not logged in'); return }
    apiGet<BrandKitData>('/brand-kit', token)
      .then(setData)
      .catch(() => setError('Failed to load brand kit data'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100 flex-shrink-0 bg-white">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Brand Kit</p>
          <p className="text-xl font-bold text-gray-900">{label}</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-auto px-8 py-8 bg-gray-50">
        <div className="max-w-xl">
          {loading && (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          {data && <SectionContent s={section} data={data} />}
        </div>
      </div>
    </div>
  )
}
