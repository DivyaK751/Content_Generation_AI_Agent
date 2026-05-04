'use client'
import { FileText, ImageIcon, Palette, BookOpen, Users, AtSign, Mail, Camera } from 'lucide-react'
import { mockUser } from '@/lib/mock-data'

export type Section = 'summary' | 'logos' | 'colors' | 'guidelines' | 'audience' | 'instagram' | 'email' | 'photos'

export const BRAND_SECTIONS: { key: Section; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'summary',    label: 'Summary',    Icon: FileText  },
  { key: 'logos',      label: 'Logos',      Icon: ImageIcon },
  { key: 'colors',     label: 'Colors',     Icon: Palette   },
  { key: 'guidelines', label: 'Guidelines', Icon: BookOpen  },
  { key: 'audience',   label: 'Audience',   Icon: Users     },
  { key: 'instagram',  label: 'Instagram',  Icon: AtSign    },
  { key: 'email',      label: 'Email',      Icon: Mail      },
  { key: 'photos',     label: 'Products',   Icon: Camera    },
]

interface Props {
  open: boolean
  activeSection: Section | null
  onSectionSelect: (s: Section) => void
}

export default function ProfilePanel({ open, activeSection, onSectionSelect }: Props) {
  return (
    <div
      className="flex-shrink-0 overflow-hidden bg-white border-r border-gray-200 flex flex-col min-h-screen"
      style={{ width: open ? '220px' : '0px', minWidth: 0, transition: 'width 0.3s cubic-bezier(0.4,0,0.2,1)' }}
    >
      {open && (
        <>
          <div className="px-4 py-4 border-b border-gray-100 flex-shrink-0">
            <p className="text-sm font-semibold text-gray-900">Brand Kit</p>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{mockUser.businessName}</p>
          </div>
          <nav className="flex-1 overflow-y-auto py-2">
            {BRAND_SECTIONS.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => onSectionSelect(key)}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-all border-r-2 ${
                  activeSection === key
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-600'
                    : 'text-gray-600 hover:bg-gray-50 border-transparent'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </button>
            ))}
          </nav>
        </>
      )}
    </div>
  )
}
