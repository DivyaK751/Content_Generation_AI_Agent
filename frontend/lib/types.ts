// ── Subscription / Plan types ──────────────────────────────────────────────────

export type PlanName = 'free' | 'starter' | 'growth' | 'pro'

export const PLAN_LIMITS: Record<PlanName, number> = {
  free: 30,
  starter: 150,
  growth: 400,
  pro: 1000,
}

export const PLAN_PRICES: Record<PlanName, number> = {
  free: 0,
  starter: 19,
  growth: 49,
  pro: 99,
}

export interface PlanFeature {
  label: string
  included: boolean
}

export const PLAN_FEATURES: Record<PlanName, PlanFeature[]> = {
  free: [
    { label: '30 images lifetime', included: true },
    { label: 'Caption + hashtag generation', included: false },
    { label: 'Auto-post to Instagram', included: false },
    { label: 'Brand kit', included: false },
    { label: 'Post scheduling', included: false },
    { label: 'Analytics', included: false },
    { label: 'Competitor insights', included: false },
    { label: 'Credit protection', included: false },
  ],
  starter: [
    { label: '150 images / month', included: true },
    { label: 'Caption + hashtag generation', included: true },
    { label: 'Auto-post to Instagram', included: true },
    { label: 'Brand kit', included: true },
    { label: 'Basic analytics', included: true },
    { label: 'Post scheduling', included: false },
    { label: 'Full analytics', included: false },
    { label: 'Competitor insights', included: false },
    { label: 'Credit protection', included: false },
  ],
  growth: [
    { label: '400 images / month', included: true },
    { label: 'Caption + hashtag generation', included: true },
    { label: 'Auto-post to Instagram', included: true },
    { label: 'Brand kit', included: true },
    { label: 'Basic analytics', included: true },
    { label: 'Post scheduling', included: true },
    { label: 'Full analytics', included: true },
    { label: 'Competitor insights', included: false },
    { label: 'Credit protection', included: false },
  ],
  pro: [
    { label: '1,000 images / month', included: true },
    { label: 'Caption + hashtag generation', included: true },
    { label: 'Auto-post to Instagram', included: true },
    { label: 'Brand kit', included: true },
    { label: 'Full analytics', included: true },
    { label: 'Post scheduling', included: true },
    { label: 'Competitor insights', included: true },
    { label: 'Credit protection (bad image refund)', included: true },
  ],
}

export interface SubscriptionStatus {
  plan: PlanName
  plan_status: string
  images_used: number
  images_limit: number
  billing_cycle_start: string | null
  can_post_instagram: boolean
  can_schedule: boolean
}

// ── Domain types ───────────────────────────────────────────────────────────────

export interface Product {
  product_id: string
  product_name: string
  image_url: string
  product_theme: string
}

export interface UserContext {
  userId: string
  businessName: string
  industry: string
  location: string
  brandColors: { primary: string; secondary: string }
  logoInitial: string
  tagline: string
  tone: string
  targetAudience: string
  instagramHandle: string
  senderEmail: string
  products?: Product[]
}

export interface TrendItem {
  id: string
  title: string
  context: string
  hashtags: string[]
  sentiment: string
  category: string
}

export interface ImageOption {
  id: string
  gradientFrom: string
  gradientTo: string
  headline: string
  subtext: string
  approved: boolean
}

export interface TaglineOption {
  id: string
  text: string
  hashtags: string[]
}

export interface EmailOption {
  id: string
  subject: string
  previewText: string
  body: string
}

export interface CampaignRecord {
  id: string
  title: string
  date: string
  platform: 'Instagram' | 'Email' | 'Instagram + Email'
  reach: string
  image?: { gradientFrom: string; gradientTo: string; headline: string; subtext: string }
  tagline?: string
  hashtags?: string[]
  emailSubject?: string
  emailPreview?: string
  emailBody?: string
}

export interface SessionMessage {
  from: 'user' | 'ai'
  text: string
  isContentGeneration?: boolean
}

export interface SessionRecord {
  id: string
  title: string
  date: string
  messages: SessionMessage[]
}

export interface StoredSession {
  id: string          // threadId
  title: string       // first user message (truncated)
  date: string        // ISO date string
  messages: object[]  // ChatMsg array — typed loosely to avoid circular import
}

export interface BrandKitData {
  user_id: string
  email: string
  business_name?: string
  industry?: string
  description?: string
  location?: string
  website?: string
  brand_colors?: string        // JSON string: {"primary":"#...","secondary":"#..."}
  logo_gcs_url?: string
  image_url?: string
  tagline?: string
  tone?: string
  brand_font?: string
  tagline_font?: string
  body_font?: string
  target_audience?: string
  age_group?: string           // comma-separated e.g. "25–34, 35–44"
  gender?: string
  interests?: string           // comma-separated
  content_types?: string       // comma-separated
  image_style?: string
  language?: string
  guidelines?: string
  instagram_handle?: string
  instagram_page_id?: string
  instagram_access_token?: string
  sender_name?: string
  sender_email?: string
  sendgrid_api_key?: string
  products?: Product[]
}

export interface OnboardingData {
  businessName: string
  industry: string
  description: string
  location: string
  website: string
  primaryColor: string
  secondaryColor: string
  brandTagline: string
  tone: string
  targetCustomer: string
  ageGroups: string[]
  genderSkew: string
  interests: string[]
  contentTypes: string[]
  imageStyle: string
  language: string
  avoidTopics: string
  instagramHandle: string
  instagramPageId: string
  instagramToken: string
  senderName: string
  senderEmail: string
  sendgridKey: string
}
