import type { UserContext, TrendItem, ImageOption, TaglineOption, EmailOption, CampaignRecord, SessionRecord } from './types'

export const mockUser: UserContext = {
  userId: 'usr_001',
  businessName: 'Crema Coffee Co.',
  industry: 'Food & Beverage',
  location: 'Bangalore, India',
  brandColors: { primary: '#4F46E5', secondary: '#E0E7FF' },
  logoInitial: 'CC',
  tagline: 'Every shot, crafted with care',
  tone: 'Warm & Friendly',
  targetAudience: 'Coffee lovers aged 22–40',
  instagramHandle: '@cremacoffee',
  senderEmail: 'hello@cremacoffee.com',
}

export const mockTrends: TrendItem[] = [
  {
    id: 'trend_1',
    title: 'Summer Cold Brew Season',
    context: 'Cold brew and iced coffee content is surging as temperatures rise. Brands leaning into refreshing, photogenic drinks are seeing 3× engagement spikes on Reels.',
    hashtags: ['#ColdBrew', '#SummerCoffee', '#IcedCoffee', '#CoffeeVibes'],
    sentiment: 'Positive',
    category: 'Seasonal',
  },
  {
    id: 'trend_2',
    title: 'International Coffee Day',
    context: 'Trending globally — brands are running limited drops, behind-the-scenes roast content, and community giveaways. High shareability across Instagram and WhatsApp.',
    hashtags: ['#InternationalCoffeeDay', '#CoffeeLovers', '#CoffeeCommunity', '#BrewDay'],
    sentiment: 'Celebratory',
    category: 'Seasonal Event',
  },
  {
    id: 'trend_3',
    title: 'Work From Café Culture',
    context: 'Remote workers are sharing their "third place" coffee moments. Cozy, productive café aesthetics are dominating Instagram Stories and Pinterest boards.',
    hashtags: ['#WorkFromCafé', '#CoffeeAndCode', '#ThirdPlace', '#CaféLife'],
    sentiment: 'Nostalgic',
    category: 'Lifestyle',
  },
  {
    id: 'trend_4',
    title: 'Sustainable Sourcing',
    context: 'Eco-conscious consumers are actively rewarding brands that highlight ethical bean sourcing and compostable packaging. Authenticity drives high engagement.',
    hashtags: ['#EthicalCoffee', '#SustainableSips', '#FarmToShot', '#GreenBrew'],
    sentiment: 'Purposeful',
    category: 'Sustainability',
  },
]

export const mockImageOptions: ImageOption[] = [
  {
    id: 'img_1',
    gradientFrom: '#92400E',
    gradientTo: '#F59E0B',
    headline: 'Cold. Bold. Brewed.',
    subtext: 'Summer Cold Brew Drop',
    approved: true,
  },
  {
    id: 'img_2',
    gradientFrom: '#1E3A5F',
    gradientTo: '#3B82F6',
    headline: 'Your Morning, Perfected',
    subtext: 'Single Origin. Every Shot.',
    approved: true,
  },
  {
    id: 'img_3',
    gradientFrom: '#374151',
    gradientTo: '#6B7280',
    headline: 'The Art of Espresso',
    subtext: 'Crafted for Coffee Lovers',
    approved: true,
  },
]

export const mockTaglines: TaglineOption[] = [
  {
    id: 'tag_1',
    text: 'Cold brew season is here. Are you ready?',
    hashtags: ['#ColdBrew', '#CremaCoffee', '#SummerSips'],
  },
  {
    id: 'tag_2',
    text: 'This summer, your best hour starts with one perfect shot.',
    hashtags: ['#EspressoSeason', '#CoffeeLover', '#CremaCoffee'],
  },
  {
    id: 'tag_3',
    text: 'Not all coffee is created equal. Yours shouldn\'t be either.',
    hashtags: ['#CraftCoffee', '#SingleOrigin', '#CremaCoffee'],
  },
]

export const mockEmailOptions: EmailOption[] = [
  {
    id: 'email_1',
    subject: 'Cold brew season is officially here ☀️',
    previewText: 'Our summer cold brew lineup is live — smooth, bold, and ready to pour.',
    body: `Hi {first_name},

Summer is here — and so is our cold brew season.

We've been slow-steeping our single-origin beans for 18 hours to bring you a lineup that's smooth, rich, and hits just right.

☕ Classic Dark Roast Cold Brew
☕ Vanilla Oat Cold Brew
☕ Nitro Concentrate (new this year)

Brewed in small batches. No additives. Just great coffee.

Order yours before we sell out →

Stay cool,
The Crema Coffee Team`,
  },
  {
    id: 'email_2',
    subject: 'Beat the heat with Crema Cold Brew',
    previewText: 'Three new summer blends dropped today. Here\'s what\'s new.',
    body: `Dear {first_name},

When it's 38°C outside, your coffee order matters more than ever.

That's why we've spent months perfecting our summer cold brew line — three blends that turn your daily ritual into the best part of your afternoon.

No bitterness. No compromise. Just excellent coffee, cold.

Shop the Summer Collection →

With love,
Crema Coffee Co.`,
  },
  {
    id: 'email_3',
    subject: 'New summer drops just hit the menu ☕',
    previewText: 'Limited batch. First come, first served.',
    body: `Hello {first_name},

We've got something new — and we wanted you to hear it first.

Our summer limited-batch drops are live today. Once these are gone, they're gone until next year.

🔥 What's new this season:
• Ethiopian Yirgacheffe Cold Brew
• Salted Caramel Latte (iced)
• Espresso Tonic Kit (DIY)

Grab yours before the batch sells out.

See you at the counter,
Crema Coffee Co.`,
  },
]

export const mockSessions: SessionRecord[] = [
  {
    id: 'session_1',
    title: 'Diwali Post Campaign',
    date: 'Apr 24, 2026',
    messages: [
      { from: 'user', text: 'Create a Diwali post for my coffee brand' },
      { from: 'ai', text: "Love it! To make this perfect — what's the main goal? (e.g. festive wishes, a product promo, or a seasonal launch?)" },
      { from: 'user', text: 'Festive wishes with a promo for our seasonal Diwali blend' },
      { from: 'ai', text: 'Got it! Any specific visual style? Bold & vibrant, minimal & clean, or warm & cozy?' },
      { from: 'user', text: 'Warm and cozy, lots of gold and amber tones' },
      { from: 'ai', text: 'Perfect! Generating your content with Imagen 4.0 and Gemini 2.5 Pro... 🎨', isContentGeneration: true },
    ],
  },
  {
    id: 'session_2',
    title: 'Cold Brew Summer Launch',
    date: 'Apr 18, 2026',
    messages: [
      { from: 'user', text: 'I want to launch our cold brew summer collection' },
      { from: 'ai', text: "Exciting! What's the main message — a new product drop, a limited batch, or a seasonal push?" },
      { from: 'user', text: 'New product drop — 3 new cold brew flavours' },
      { from: 'ai', text: 'Great! Visual direction — cool & refreshing, bold & energetic, or lifestyle & casual?' },
      { from: 'user', text: 'Cool and refreshing, summer vibes all the way' },
      { from: 'ai', text: 'On it! Generating your cold brew campaign visuals... 🎨', isContentGeneration: true },
    ],
  },
  {
    id: 'session_3',
    title: 'International Coffee Day',
    date: 'Apr 8, 2026',
    messages: [
      { from: 'user', text: 'Create something for International Coffee Day' },
      { from: 'ai', text: "Perfect timing! What angle — celebrating the day, promoting a deal, or sharing your brand story?" },
      { from: 'user', text: 'Celebrating with a community feel and a giveaway mention' },
      { from: 'ai', text: 'Love it! Bold and celebratory, or warm and personal?' },
      { from: 'user', text: 'Warm and personal — talking to our regulars' },
      { from: 'ai', text: 'Generating your International Coffee Day content... ☕', isContentGeneration: true },
    ],
  },
  {
    id: 'session_4',
    title: 'Work From Café Lifestyle',
    date: 'Mar 28, 2026',
    messages: [
      { from: 'user', text: 'I want a lifestyle post about working from our café' },
      { from: 'ai', text: "Love the vibe! Who's the audience — remote workers, students, or a broader lifestyle crowd?" },
      { from: 'user', text: 'Remote workers and freelancers, 25–35 age group' },
      { from: 'ai', text: 'Got it! Aesthetic direction — cozy & moody, bright & productive, or artsy café vibes?' },
      { from: 'user', text: 'Cozy and moody, evening light vibes' },
      { from: 'ai', text: 'Crafting your work-from-café lifestyle campaign... 🌙', isContentGeneration: true },
    ],
  },
]

export const mockRecentCampaigns = [
  { id: 'camp_1', title: 'Diwali Special', date: '2025-10-20', platform: 'Instagram + Email', status: 'Published', reach: '2,400' },
  { id: 'camp_2', title: 'Winter Warmers Launch', date: '2025-11-15', platform: 'Instagram', status: 'Published', reach: '1,890' },
  { id: 'camp_3', title: 'New Year New Blends', date: '2026-01-01', platform: 'Instagram + Email', status: 'Published', reach: '3,100' },
]

export const mockCampaignHistory: CampaignRecord[] = [
  {
    id: 'camp_1',
    title: 'Diwali Special',
    date: 'Oct 20, 2025',
    platform: 'Instagram + Email',
    reach: '2,400',
    image: { gradientFrom: '#F59E0B', gradientTo: '#EF4444', headline: 'Light Up the Season', subtext: 'Diwali Special Edition' },
    tagline: 'This Diwali, let every cup shine as bright as the diyas. ✨',
    hashtags: ['#Diwali2025', '#CremaCoffee', '#FestiveSips'],
    emailSubject: 'Wishing you a bright Diwali from Crema ✨',
    emailPreview: 'Celebrate the festival of lights with our limited Diwali blend.',
    emailBody: `Hi {first_name},

This Diwali, we wanted to share something special with you.

We've crafted a limited-edition festive blend — warm, spiced, and made for celebrations. Available only this week.

🪔 Diwali Spice Latte
🪔 Cardamom Cold Brew
🪔 Saffron Cortado

Wishing you and your loved ones a bright and joyful Diwali.

With warmth,
The Crema Coffee Team`,
  },
  {
    id: 'camp_2',
    title: 'Winter Warmers Launch',
    date: 'Nov 15, 2025',
    platform: 'Instagram',
    reach: '1,890',
    image: { gradientFrom: '#1E3A5F', gradientTo: '#3B82F6', headline: 'Stay Warm. Brew Bold.', subtext: 'Winter Collection is Here' },
    tagline: 'Cold outside. Bold inside. Our Winter Warmers are here.',
    hashtags: ['#WinterCoffee', '#CremaCoffee', '#StayWarm'],
  },
  {
    id: 'camp_3',
    title: 'New Year New Blends',
    date: 'Jan 1, 2026',
    platform: 'Instagram + Email',
    reach: '3,100',
    image: { gradientFrom: '#374151', gradientTo: '#6B7280', headline: 'New Year, New Roasts', subtext: '2026 Collection Drops Today' },
    tagline: 'Start 2026 right — with a shot that means business. ☕',
    hashtags: ['#NewYear2026', '#CremaCoffee', '#FreshRoast'],
    emailSubject: 'Happy New Year — and our biggest drop yet 🎉',
    emailPreview: 'Six new single-origin roasts, dropping today.',
    emailBody: `Dear {first_name},

Happy New Year from all of us at Crema Coffee Co.!

As we head into 2026, we're launching six new single-origin roasts — our most exciting lineup yet.

☕ Ethiopian Yirgacheffe (Natural)
☕ Colombian Pink Bourbon
☕ Guatemala Antigua
☕ Brazilian Yellow Bourbon
☕ Kenyan AA
☕ Costa Rica Honey Process

Each available in 250g and 1kg. Early access for our subscribers only — shop before 6 AM.

Here's to a great year ahead,
Crema Coffee Co.`,
  },
  {
    id: 'camp_4',
    title: 'Summer Cold Brew Launch',
    date: 'Apr 10, 2026',
    platform: 'Instagram',
    reach: '2,200',
    image: { gradientFrom: '#92400E', gradientTo: '#F59E0B', headline: 'Cold. Bold. Brewed.', subtext: 'Summer Cold Brew Drop' },
    tagline: 'Cold brew season is here. Are you ready? ☀️',
    hashtags: ['#ColdBrew', '#CremaCoffee', '#SummerSips'],
  },
  {
    id: 'camp_5',
    title: 'International Coffee Day',
    date: 'Mar 1, 2026',
    platform: 'Instagram + Email',
    reach: '4,050',
    image: { gradientFrom: '#4F46E5', gradientTo: '#7C3AED', headline: 'Happy Coffee Day!', subtext: 'From Our Beans to Your Cup' },
    tagline: 'Today we celebrate the drink that fuels the world. ☕ Happy International Coffee Day!',
    hashtags: ['#InternationalCoffeeDay', '#CremaCoffee', '#CoffeeCommunity'],
    emailSubject: 'It\'s our favourite day of the year ☕',
    emailPreview: 'Free coffee for our subscribers — one day only.',
    emailBody: `Hello {first_name},

Today is International Coffee Day — and we can't think of a better excuse to celebrate with you.

As a thank-you to our subscribers, we're offering free shipping on all orders placed today.

No minimum. No code needed. Just great coffee.

Shop today →

Thank you for being part of the Crema family.

With love,
The Crema Coffee Team`,
  },
  {
    id: 'camp_6',
    title: 'Sustainable Packaging Drop',
    date: 'Feb 14, 2026',
    platform: 'Email',
    reach: '1,400',
    emailSubject: 'We\'ve gone fully compostable 🌱',
    emailPreview: 'Our new packaging is here — and it\'s better for the planet.',
    emailBody: `Hi {first_name},

We've been working on this for over a year, and we're finally ready to share it with you.

Starting today, every Crema Coffee order ships in 100% compostable packaging.

🌿 Compostable bags (home-compostable in 26 weeks)
🌿 Recycled cardboard mailers
🌿 Soy-based ink labels

Same great coffee. Better for the planet.

Thank you for being part of this journey with us.

The Crema Coffee Team`,
  },
]
