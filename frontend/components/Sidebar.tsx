'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Activity, LayoutDashboard, FolderOpen, User, LogOut, PlusCircle, Clock, CreditCard } from 'lucide-react'
import { apiGet } from '@/lib/api'
import { getToken, sessionsKey, clearToken } from '@/lib/auth'
import type { StoredSession } from '@/lib/types'
import UsageBar from '@/components/UsageBar'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

const NAV_ITEMS = [
  { label: 'New Campaign', icon: PlusCircle, href: '/campaign/new' },
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Previous Projects', icon: FolderOpen, href: '/projects' },
]

interface SidebarProps {
  onProfileClick?: () => void
  profilePanelOpen?: boolean
}

export default function Sidebar({ onProfileClick, profilePanelOpen }: SidebarProps = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const [sessions, setSessions] = useState<StoredSession[]>([])
  const [businessName, setBusinessName] = useState<string>(
    () => { try { return localStorage.getItem('brandbuddy_business_name') ?? '' } catch { return '' } }
  )
  const [industry, setIndustry] = useState<string>(
    () => { try { return localStorage.getItem('brandbuddy_business_industry') ?? '' } catch { return '' } }
  )

  useEffect(() => {
    function load() {
      try {
        setSessions(JSON.parse(localStorage.getItem(sessionsKey()) ?? '[]'))
      } catch { setSessions([]) }
    }
    load()
    window.addEventListener('storage', load)
    window.addEventListener('focus', load)
    return () => {
      window.removeEventListener('storage', load)
      window.removeEventListener('focus', load)
    }
  }, [])

  useEffect(() => {
    const token = getToken()
    if (!token) return
    apiGet<{ business_name?: string; industry?: string }>('/brand-kit', token)
      .then(kit => {
        if (kit.business_name) {
          setBusinessName(kit.business_name)
          try { localStorage.setItem('brandbuddy_business_name', kit.business_name) } catch {}
        }
        if (kit.industry) {
          setIndustry(kit.industry)
          try { localStorage.setItem('brandbuddy_business_industry', kit.industry) } catch {}
        }
      })
      .catch(() => {})
  }, [])

  const isActive = (href: string) => {
    const base = href.split('?')[0]
    return pathname === base || (base !== '/dashboard' && pathname.startsWith(base))
  }

  return (
    <aside className="w-60 h-screen bg-white border-r border-gray-100 flex flex-col flex-shrink-0 overflow-hidden">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100 flex-shrink-0">
        <button
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
        >
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-gray-900 text-base tracking-tight">BrandBuddy</span>
        </button>
      </div>

      {/* Business badge */}
      <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2.5 px-2 py-2 bg-gray-50 rounded-lg">
          <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-indigo-700 font-semibold text-xs">{businessName ? initials(businessName) : '?'}</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-800 truncate">{businessName || '—'}</p>
            <p className="text-xs text-gray-400 truncate">{industry || ''}</p>
          </div>
        </div>
      </div>

      {/* Scrollable nav area */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-5">
        {/* Main nav */}
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider px-3 mb-2">Menu</p>
          <div className="space-y-0.5">
            {NAV_ITEMS.map(({ label, icon: Icon, href }) => (
              <button
                key={href}
                onClick={() => router.push(href)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive(href)
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Recent sessions */}
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider px-3 mb-2">Recent Sessions</p>
          <div className="space-y-0.5">
            {sessions.length === 0 ? (
              <p className="text-xs text-gray-400 px-3 py-1">No sessions yet</p>
            ) : sessions.map(session => (
              <button
                key={session.id}
                onClick={() => router.push(`/sessions/${session.id}`)}
                className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-lg text-left transition-all ${
                  pathname === `/sessions/${session.id}`
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'hover:bg-gray-50'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-700 truncate leading-snug">{session.title}</p>
                  <p className="text-xs text-gray-400">{new Date(session.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Bottom nav */}
      <div className="px-3 py-4 border-t border-gray-100 space-y-2 flex-shrink-0">
        <UsageBar />
        <button
          onClick={() => onProfileClick ? onProfileClick() : router.push('/profile')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
            profilePanelOpen || (!onProfileClick && isActive('/profile'))
              ? 'bg-indigo-600 text-white'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          <User className="w-4 h-4 flex-shrink-0" />
          Brand Kit
        </button>
        <button
          onClick={() => router.push('/billing')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
            isActive('/billing')
              ? 'bg-indigo-600 text-white'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          <CreditCard className="w-4 h-4 flex-shrink-0" />
          Billing
        </button>
        <button
          onClick={() => { clearToken(); router.push('/') }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-all"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
