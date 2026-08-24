'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'

interface UserState {
  id: string
  email: string
  role: 'PATIENT' | 'DOCTOR' | 'ADMIN'
  patientProfile?: { firstName: string; lastName: string } | null
  doctorProfile?: { firstName: string; lastName: string; specialisation: string } | null
}

export default function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<UserState | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data?.data?.user) {
          setUser(data.data.user)
        } else {
          setUser(null)
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [pathname])

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      setUser(null)
      router.push('/login')
      router.refresh()
    } catch (e) {
      console.error(e)
    }
  }

  const getDisplayName = () => {
    if (!user) return ''
    if (user.doctorProfile) {
      return `Dr. ${user.doctorProfile.firstName} ${user.doctorProfile.lastName}`
    }
    if (user.patientProfile) {
      return `${user.patientProfile.firstName} ${user.patientProfile.lastName}`
    }
    return user.email
  }

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center space-x-8">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-sm">
                +
              </div>
              <span className="text-xl font-bold text-slate-900 tracking-tight">CareFlow</span>
            </Link>

            {user && (
              <nav className="hidden md:flex space-x-1">
                {user.role === 'PATIENT' && (
                  <>
                    <Link
                      href="/patient"
                      className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                        pathname === '/patient' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      Dashboard
                    </Link>
                    <Link
                      href="/patient/doctors"
                      className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                        pathname.startsWith('/patient/doctors') || pathname.startsWith('/patient/book')
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      Find Doctors
                    </Link>
                  </>
                )}

                {user.role === 'DOCTOR' && (
                  <>
                    <Link
                      href="/doctor"
                      className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                        pathname === '/doctor' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      Doctor Schedule
                    </Link>
                  </>
                )}

                {user.role === 'ADMIN' && (
                  <>
                    <Link
                      href="/admin"
                      className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                        pathname === '/admin' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      Admin Dashboard
                    </Link>
                    <Link
                      href="/admin/doctors/new"
                      className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                        pathname === '/admin/doctors/new' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      + Add Doctor
                    </Link>
                  </>
                )}
              </nav>
            )}
          </div>

          <div className="flex items-center space-x-4">
            {loading ? (
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            ) : user ? (
              <div className="flex items-center space-x-3">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-slate-800">{getDisplayName()}</p>
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">{user.role}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-red-600 hover:bg-red-50 border border-slate-200 rounded-md transition"
                >
                  Log out
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <Link
                  href="/login"
                  className="px-3.5 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-md transition"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="px-3.5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition shadow-sm"
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
