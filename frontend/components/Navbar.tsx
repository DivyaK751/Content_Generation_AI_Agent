'use client'
import { useRouter } from 'next/navigation'
import { Sparkles, LogOut, ChevronDown } from 'lucide-react'
import { mockUser } from '@/lib/mock-data'

export default function Navbar() {
  const router = useRouter()

  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <button
        onClick={() => router.push('/dashboard')}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-gray-900 text-sm">ContentAI</span>
      </button>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 cursor-pointer group">
          <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
            <span className="text-indigo-700 font-semibold text-xs">{mockUser.logoInitial}</span>
          </div>
          <span className="text-sm font-medium text-gray-700">{mockUser.businessName}</span>
          <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
        </div>

        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </nav>
  )
}
