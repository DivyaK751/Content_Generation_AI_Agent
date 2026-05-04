'use client'
import { Activity } from 'lucide-react'
import { loginWithGoogle } from '@/lib/auth'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 w-full max-w-sm text-center">
        {/* Logo */}
        <div className="w-14 h-14 bg-indigo-600 rounded-2xl mx-auto mb-5 flex items-center justify-center">
          <Activity className="text-white w-7 h-7" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">BrandBuddy</h1>
        <p className="text-gray-500 text-sm mb-8 leading-relaxed">
          AI-powered Instagram &amp; email content<br />for your small business
        </p>

        {/* Buttons */}
        <div className="space-y-3">
          <button
            onClick={loginWithGoogle}
            className="w-full flex items-center justify-center gap-3 bg-indigo-600 text-white py-3 px-5 rounded-xl font-medium hover:bg-indigo-700 transition-colors text-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 48 48" fill="none">
              <path fill="#4285F4" d="M43.6 24.5c0-1.5-.1-3-.4-4.4H24v8.4h11c-.5 2.5-1.9 4.7-4 6.1v5h6.5c3.8-3.5 6.1-8.7 6.1-15.1z"/>
              <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.5-5c-1.8 1.2-4.2 1.9-7 1.9-5.4 0-9.9-3.6-11.5-8.5H5.8v5.2C9.1 39.6 16 44 24 44z"/>
              <path fill="#FBBC05" d="M12.5 27.5c-.4-1.2-.7-2.6-.7-4s.2-2.7.7-4v-5.2H5.8C4.3 17.3 3.5 20.5 3.5 24s.8 6.7 2.3 9.7l6.7-5.2z"/>
              <path fill="#EA4335" d="M24 11.5c3 0 5.7 1 7.8 3l5.8-5.8C34.1 5.4 29.4 3.5 24 3.5c-8 0-14.9 4.4-18.2 10.8l6.7 5.2c1.6-4.9 6.1-8 11.5-8z"/>
            </svg>
            Log In with Google
          </button>

          <button
            onClick={loginWithGoogle}
            className="w-full border border-gray-200 text-gray-700 py-3 px-5 rounded-xl font-medium hover:bg-gray-50 transition-colors text-sm"
          >
            Get Started — Create Account
          </button>
        </div>

        <p className="text-xs text-gray-400 mt-6">
          Powered by Google Vertex AI &amp; Gemini
        </p>
      </div>
    </div>
  )
}
