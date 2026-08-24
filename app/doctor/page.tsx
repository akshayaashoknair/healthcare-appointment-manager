'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import StatusBadge from '@/components/StatusBadge'

interface DoctorAppointmentItem {
  id: string
  startAt: string
  endAt: string
  status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'LEAVE_AFFECTED'
  patient: {
    email: string
    patientProfile?: {
      firstName: string
      lastName: string
      phone?: string | null
    } | null
  }
  symptomSubmission?: {
    symptoms: string
  } | null
}

export default function DoctorDashboard() {
  const [appointments, setAppointments] = useState<DoctorAppointmentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'today' | 'upcoming' | 'all'>('today')

  // Calendar sync state
  const [calendarConnected, setCalendarConnected] = useState(false)
  const [calendarEmail, setCalendarEmail] = useState<string | null>(null)
  const [calendarLoading, setCalendarLoading] = useState(false)

  const fetchCalendarStatus = () => {
    fetch('/api/calendar/status')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setCalendarConnected(data.data.connected)
          setCalendarEmail(data.data.connection?.googleAccountEmail || null)
        }
      })
      .catch(() => {})
  }

  const handleDisconnectCalendar = async () => {
    setCalendarLoading(true)
    try {
      await fetch('/api/calendar/disconnect', { method: 'POST' })
      setCalendarConnected(false)
      setCalendarEmail(null)
    } finally {
      setCalendarLoading(false)
    }
  }

  useEffect(() => {
    fetch('/api/appointments')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setAppointments(data.data.appointments)
        } else {
          setError(data.error || 'Failed to load schedule')
        }
      })
      .catch(() => setError('Failed to load appointments'))
      .finally(() => setLoading(false))

    fetchCalendarStatus()
  }, [])

  const isToday = (iso: string) => {
    const d = new Date(iso)
    const today = new Date()
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    )
  }

  const todayAppointments = appointments.filter((a) => isToday(a.startAt) && a.status === 'CONFIRMED')
  const upcomingAppointments = appointments.filter((a) => new Date(a.startAt) > new Date() && a.status === 'CONFIRMED')

  const displayedAppointments =
    tab === 'today'
      ? todayAppointments
      : tab === 'upcoming'
        ? upcomingAppointments
        : appointments

  const formatTime = (isoStart: string, isoEnd: string) => {
    const s = new Date(isoStart)
    const e = new Date(isoEnd)
    return `${s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })} - ${e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`
  }

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Doctor Schedule & Consultations</h1>
          <p className="text-sm text-slate-500 mt-1">Review booked patients, pre-visit symptoms, and consultation history</p>
        </div>
      </div>

      {/* Google Calendar Sync Widget */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-lg font-bold">
            📅
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">Doctor Google Calendar Integration</h3>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  calendarConnected
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {calendarConnected ? 'Connected' : 'Not Connected'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {calendarConnected && calendarEmail
                ? `Syncing consultations to ${calendarEmail}`
                : 'Connect your Google Calendar to automatically synchronize patient appointments and consultations.'}
            </p>
          </div>
        </div>

        <div>
          {calendarConnected ? (
            <button
              onClick={handleDisconnectCalendar}
              disabled={calendarLoading}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-3.5 py-2 rounded-xl transition"
            >
              {calendarLoading ? 'Disconnecting...' : 'Disconnect'}
            </button>
          ) : (
            <a
              href="/api/calendar/connect"
              className="inline-block text-xs font-semibold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3.5 py-2 rounded-xl transition"
            >
              🔗 Connect Google Calendar
            </a>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">
          {error}
        </div>
      )}

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Today&apos;s Bookings</span>
          <p className="text-3xl font-black text-blue-600 mt-1">{todayAppointments.length}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Upcoming Schedule</span>
          <p className="text-3xl font-black text-slate-900 mt-1">{upcomingAppointments.length}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Patients Seen</span>
          <p className="text-3xl font-black text-slate-900 mt-1">{appointments.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setTab('today')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            tab === 'today'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Today ({todayAppointments.length})
        </button>
        <button
          onClick={() => setTab('upcoming')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            tab === 'upcoming'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Upcoming ({upcomingAppointments.length})
        </button>
        <button
          onClick={() => setTab('all')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            tab === 'all'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          All Appointments ({appointments.length})
        </button>
      </div>

      {/* Appointments List */}
      {loading ? (
        <div className="text-center py-16">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-slate-500 mt-3">Loading schedule...</p>
        </div>
      ) : displayedAppointments.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-sm text-slate-500">
          No appointments found in this view.
        </div>
      ) : (
        <div className="space-y-3">
          {displayedAppointments.map((apt) => (
            <div
              key={apt.id}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-blue-300 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-base text-slate-900">
                    {apt.patient.patientProfile
                      ? `${apt.patient.patientProfile.firstName} ${apt.patient.patientProfile.lastName}`
                      : apt.patient.email}
                  </span>
                  <StatusBadge status={apt.status} />
                </div>

                <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                  <span>📅 {formatDate(apt.startAt)}</span>
                  <span>⏰ {formatTime(apt.startAt, apt.endAt)}</span>
                  {apt.patient.patientProfile?.phone && (
                    <span>📞 {apt.patient.patientProfile.phone}</span>
                  )}
                </div>

                {apt.symptomSubmission?.symptoms && (
                  <div className="mt-2 text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg">
                    <span className="font-semibold text-slate-700">Pre-Visit Symptoms:</span>{' '}
                    {apt.symptomSubmission.symptoms}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end">
                <Link
                  href={`/doctor/appointments/${apt.id}`}
                  className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-xl transition"
                >
                  View Details &rarr;
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
