'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to log in')
        setLoading(false)
        return
      }

      // Redirect according to user role
      const role = data.data.user.role
      if (role === 'ADMIN') {
        router.push('/admin')
      } else if (role === 'DOCTOR') {
        router.push('/doctor')
      } else {
        router.push('/patient')
      }
      router.refresh()
    } catch {
      setError('An unexpected network error occurred')
      setLoading(false)
    }
  }

  const fillDemoAccount = (demoEmail: string) => {
    setEmail(demoEmail)
    setPassword('CareFlowDev123!')
  }

  return (
    <div className="max-w-md mx-auto my-8 bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Sign in to CareFlow</h2>
        <p className="text-sm text-slate-500 mt-1">Access your healthcare portal</p>
      </div>

      {error && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Email address</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold rounded-lg shadow-sm transition text-sm flex justify-center items-center"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            'Sign in'
          )}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-slate-500">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="font-semibold text-blue-600 hover:text-blue-700">
          Register as Patient
        </Link>
      </div>

      {/* Demo Account Fillers for Evaluation */}
      <div className="mt-8 pt-6 border-t border-slate-100">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-center mb-3">
          Quick Demo Login
        </p>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => fillDemoAccount('patient.one@careflow.test')}
            className="px-2 py-1.5 text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-slate-700 font-medium transition"
          >
            Patient 1
          </button>
          <button
            type="button"
            onClick={() => fillDemoAccount('dr.mehta@careflow.test')}
            className="px-2 py-1.5 text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-slate-700 font-medium transition"
          >
            Dr. Mehta
          </button>
          <button
            type="button"
            onClick={() => fillDemoAccount('admin@careflow.test')}
            className="px-2 py-1.5 text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-slate-700 font-medium transition"
          >
            Admin
          </button>
        </div>
      </div>
    </div>
  )
}
