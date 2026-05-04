'use client'
import { useState } from 'react'
import Sidebar from './Sidebar'
import ProfilePanel, { type Section } from './ProfilePanel'
import BrandKitForm from './BrandKitForm'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [profileOpen, setProfileOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<Section | null>(null)
  const businessName = typeof window !== 'undefined'
    ? (localStorage.getItem('brandbuddy_business_name') ?? '')
    : ''

  const handleBrandKitToggle = () => {
    setProfileOpen(o => {
      if (o) setActiveSection(null)
      return !o
    })
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        onProfileClick={handleBrandKitToggle}
        profilePanelOpen={profileOpen}
      />
      <ProfilePanel
        open={profileOpen}
        activeSection={activeSection}
        onSectionSelect={setActiveSection}
        businessName={businessName}
      />
      <div className="flex-1 overflow-auto">
        {activeSection
          ? <BrandKitForm section={activeSection} onClose={() => setActiveSection(null)} />
          : children
        }
      </div>
    </div>
  )
}
