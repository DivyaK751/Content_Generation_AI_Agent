'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, CheckCircle2, Circle, Loader2, ArrowRight, ChevronLeft } from 'lucide-react'

const ONBOARDING_STEPS = [
  'Business Basics',
  'Brand Identity',
  'Target Audience',
  'Content Preferences',
  'Instagram Setup',
  'Email Setup',
]

type Stage = 'signup' | 'authenticating' | 'ready'

export default function RegisterPage() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('signup')

  const handleGoogleAuth = () => {
    setStage('authenticating')
    setTimeout(() => setStage('ready'), 1800)
  }

  if (stage === 'signup') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 w-full max-w-sm">
          {/* Header */}
          <div className="flex items-center gap-2.5 mb-7">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Activity className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900">BrandBuddy</span>
          </div>

          <h1 className="text-xl font-bold text-gray-900 mb-1">Create your account</h1>
          <p className="text-sm text-gray-500 mb-7 leading-relaxed">
            Sign up with Google to get started. No password needed.
          </p>

          <button
            onClick={handleGoogleAuth}
            className="w-full flex items-center justify-center gap-3 border border-gray-200 bg-white text-gray-700 py-3 px-5 rounded-xl font-medium hover:bg-gray-50 transition-colors text-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 48 48" fill="none">
              <path fill="#4285F4" d="M43.6 24.5c0-1.5-.1-3-.4-4.4H24v8.4h11c-.5 2.5-1.9 4.7-4 6.1v5h6.5c3.8-3.5 6.1-8.7 6.1-15.1z"/>
              <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.5-5c-1.8 1.2-4.2 1.9-7 1.9-5.4 0-9.9-3.6-11.5-8.5H5.8v5.2C9.1 39.6 16 44 24 44z"/>
              <path fill="#FBBC05" d="M12.5 27.5c-.4-1.2-.7-2.6-.7-4s.2-2.7.7-4v-5.2H5.8C4.3 17.3 3.5 20.5 3.5 24s.8 6.7 2.3 9.7l6.7-5.2z"/>
              <path fill="#EA4335" d="M24 11.5c3 0 5.7 1 7.8 3l5.8-5.8C34.1 5.4 29.4 3.5 24 3.5c-8 0-14.9 4.4-18.2 10.8l6.7 5.2c1.6-4.9 6.1-8 11.5-8z"/>
            </svg>
            Continue with Google
          </button>

          <p className="text-xs text-gray-400 text-center mt-5">
            Already have an account?{' '}
            <button onClick={() => router.push('/')} className="text-indigo-600 hover:underline font-medium">
              Log in
            </button>
          </p>
        </div>

        <button
          onClick={() => router.push('/')}
          className="mt-5 flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back to home
        </button>
      </div>
    )
  }

  if (stage === 'authenticating') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-sm text-gray-500">Signing you in with Google…</p>
      </div>
    )
  }

  // stage === 'ready'
  const completedSteps = 0
  const progressPct = (completedSteps / ONBOARDING_STEPS.length) * 100

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-md">
        {/* Top */}
        <div className="px-8 pt-8 pb-6 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">Account created!</p>
              <p className="text-xs text-gray-400">Welcome to BrandBuddy</p>
            </div>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Set up your workspace</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            Complete your business profile so BrandBuddy can generate content tailored to your brand.
          </p>
        </div>

        {/* Progress */}
        <div className="px-8 py-5 border-b border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-600">Onboarding progress</span>
            <span className="text-xs font-semibold text-indigo-600">{completedSteps}/{ONBOARDING_STEPS.length} steps</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 mb-4">
            <div
              className="bg-indigo-600 h-1.5 rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <ul className="space-y-2">
            {ONBOARDING_STEPS.map((step, i) => (
              <li key={step} className="flex items-center gap-2.5">
                {i < completedSteps ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-gray-300 flex-shrink-0" />
                )}
                <span className={`text-sm ${i < completedSteps ? 'text-gray-500 line-through' : 'text-gray-700'}`}>
                  {step}
                </span>
                {i === completedSteps && (
                  <span className="text-xs text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded-full ml-auto">
                    Up next
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="px-8 py-6 flex flex-col gap-3">
          <button
            onClick={() => router.push('/onboarding')}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Start Onboarding <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className="w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors py-1"
          >
            Skip for now — go to dashboard
          </button>
        </div>
      </div>
    </div>
  )
}
