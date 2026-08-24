'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface DoctorAdminItem {
  id: string
  email: string
  doctorProfile?: {
    firstName: string
    lastName: string
    specialisation: string
    slotDurationMinutes: number
    isActive: boolean
    workingHours: Array<{ weekday: number; startTime: string; endTime: string }>
  } | null
}

export default function AdminDashboard() {
  const [doctors, setDoctors] = useState<DoctorAdminItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const fetchDoctors = () => {
    setLoading(true)
    fetch('/api/admin/doctors')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setDoctors(data.data.doctors)
        } else {
          setError(data.error || 'Failed to load doctors')
        }
      })
      .catch(() => setError('Failed to load doctors list'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchDoctors()
  }, [])

  const handleToggleActive = async (doctor: DoctorAdminItem) => {
    if (!doctor.doctorProfile) return
    const newStatus = !doctor.doctorProfile.isActive
    setTogglingId(doctor.id)

    try {
      const res = await fetch(`/api/admin/doctors/${doctor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newStatus }),
      })

      const data = await res.json()
      if (data.success) {
        setDoctors((prev) =>
          prev.map((d) =>
            d.id === doctor.id && d.doctorProfile
              ? { ...d, doctorProfile: { ...d.doctorProfile, isActive: newStatus } }
              : d,
          ),
        )
      } else {
        setError(data.error || 'Failed to update status')
      }
    } catch {
      setError('An error occurred updating doctor status')
    } finally {
      setTogglingId(null)
    }
  }

  const filteredDoctors = doctors.filter((doc) => {
    const p = doc.doctorProfile
    if (!p) return false
    const matchName = `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchQuery.toLowerCase())
    const matchSpec = p.specialisation.toLowerCase().includes(searchQuery.toLowerCase())
    const matchEmail = doc.email.toLowerCase().includes(searchQuery.toLowerCase())
    return matchName || matchSpec || matchEmail
  })

  const activeDoctorsCount = doctors.filter((d) => d.doctorProfile?.isActive).length
  const uniqueSpecialisations = new Set(doctors.map((d) => d.doctorProfile?.specialisation).filter(Boolean)).size

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Admin Operations Console</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage doctor profiles, schedules, working hours, and clinic leave conflicts</p>
        </div>
        <Link
          href="/admin/doctors/new"
          className="inline-flex items-center justify-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-xs transition text-sm"
        >
          + Onboard New Doctor
        </Link>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Doctors</span>
          <p className="text-3xl font-black text-slate-900 mt-1">{doctors.length}</p>
          <p className="text-[11px] text-slate-400">{activeDoctorsCount} currently active</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Clinical Specialties</span>
          <p className="text-3xl font-black text-blue-600 mt-1">{uniqueSpecialisations}</p>
          <p className="text-[11px] text-slate-400">Departments represented</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Concurrency Engine</span>
          <p className="text-lg font-black text-emerald-600 mt-2">Active Protection</p>
          <p className="text-[11px] text-slate-400">PostgreSQL Exclusion Constraints</p>
        </div>
      </div>

      {/* Conflict & Concurrency Architecture Banner */}
      <div className="bg-gradient-to-r from-blue-50/80 to-indigo-50/80 p-5 rounded-2xl border border-blue-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-blue-900 flex items-center gap-2">
            <span>🛡️ Automated Leave Conflict Resolution</span>
          </h3>
          <p className="text-xs text-slate-600 max-w-2xl">
            When you schedule leave for a doctor, CareFlow automatically identifies overlapping confirmed appointments in a single database transaction, releases slot reservations, dispatches patient notification emails, and deletes linked Google Calendar events.
          </p>
        </div>
        <div className="text-xs text-blue-700 bg-white px-3 py-1.5 rounded-lg border border-blue-200 font-semibold shrink-0">
          Clinic Timezone: Asia/Kolkata
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">
          {error}
        </div>
      )}

      {/* Doctor Management Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Doctor Directory & Schedules</h3>
            <p className="text-xs text-slate-500">Configure weekly operating hours, slot durations, and leave calendars</p>
          </div>
          <div className="w-full sm:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, specialty..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-sm text-slate-500 mt-3">Loading doctors...</p>
          </div>
        ) : filteredDoctors.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            {searchQuery ? 'No doctors match your search query.' : 'No doctors found. Click "+ Onboard New Doctor" to add the first doctor.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Doctor</th>
                  <th className="px-6 py-4">Specialisation</th>
                  <th className="px-6 py-4">Slot Duration</th>
                  <th className="px-6 py-4">Operating Days</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDoctors.map((doc) => {
                  const profile = doc.doctorProfile
                  if (!profile) return null

                  const workingDaysCount = new Set(profile.workingHours?.map((w) => w.weekday)).size

                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900">
                          Dr. {profile.firstName} {profile.lastName}
                        </div>
                        <div className="text-xs text-slate-400">{doc.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                          {profile.specialisation}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-700 font-medium text-xs">
                        {profile.slotDurationMinutes} mins
                      </td>
                      <td className="px-6 py-4 text-slate-600 text-xs">
                        {workingDaysCount > 0 ? `${workingDaysCount} days / week` : 'No hours set'}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleToggleActive(doc)}
                          disabled={togglingId === doc.id}
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold transition ${
                            profile.isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                              profile.isActive ? 'bg-emerald-500' : 'bg-slate-400'
                            }`}
                          ></span>
                          {togglingId === doc.id
                            ? 'Updating...'
                            : profile.isActive
                              ? 'Active'
                              : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <Link
                          href={`/admin/doctors/${doc.id}`}
                          className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition inline-block border border-slate-200"
                        >
                          Configure & Schedule &rarr;
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
