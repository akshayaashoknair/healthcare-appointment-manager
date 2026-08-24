'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import StatusBadge from '@/components/StatusBadge'

interface MedicationItem {
  id: string
  name: string
  dosage: string
  frequency: string
  instructions?: string | null
  startDate?: string | null
  endDate?: string | null
  reminderTime?: string | null
}

interface AppointmentItem {
  id: string
  startAt: string
  endAt: string
  status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'LEAVE_AFFECTED'
  doctor: {
    doctorProfile?: {
      firstName: string
      lastName: string
      specialisation: string
    } | null
  }
  symptomSubmission?: {
    symptoms: string
  } | null
  consultation?: {
    id: string
    clinicalNotes: string
    prescription?: {
      instructions?: string | null
      medications: MedicationItem[]
    } | null
    postVisitSummary?: {
      patientSummary?: string | null
      medicationSchedule?: string | null
    } | null
  } | null
}

export default function PatientDashboard() {
  const [appointments, setAppointments] = useState<AppointmentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
          setError(data.error || 'Failed to load appointments')
        }
      })
      .catch(() => setError('Failed to load appointments'))
      .finally(() => setLoading(false))

    fetchCalendarStatus()
  }, [])

  const upcomingAppointments = appointments.filter(
    (a) => a.status === 'CONFIRMED' && new Date(a.startAt) >= new Date(),
  )
  const pastAppointments = appointments.filter(
    (a) => a.status !== 'CONFIRMED' || new Date(a.startAt) < new Date(),
  )

  // Extract all active medications from completed consultations
  const activeMedications: {
    med: MedicationItem
    doctorName: string
    appointmentId: string
  }[] = []

  const now = new Date()
  for (const apt of appointments) {
    if (apt.consultation?.prescription?.medications) {
      const docName = apt.doctor.doctorProfile
        ? `Dr. ${apt.doctor.doctorProfile.firstName} ${apt.doctor.doctorProfile.lastName}`
        : 'Doctor'

      for (const m of apt.consultation.prescription.medications) {
        const isNotExpired = !m.endDate || new Date(m.endDate) >= now
        if (isNotExpired) {
          activeMedications.push({
            med: m,
            doctorName: docName,
            appointmentId: apt.id,
          })
        }
      }
    }
  }

  const formatDateTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Patient Portal</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage your health visits, prescriptions, and intake schedules</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/patient/doctors"
            className="inline-flex items-center justify-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-xs transition text-sm"
          >
            + Book New Appointment
          </Link>
        </div>
      </div>

      {/* Metrics Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex justify-between items-center text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <span>Upcoming Visits</span>
            <span className="text-base">📅</span>
          </div>
          <p className="text-3xl font-black text-blue-600">{upcomingAppointments.length}</p>
          <p className="text-[11px] text-slate-400">Next scheduled appointment</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex justify-between items-center text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <span>Active Medications</span>
            <span className="text-base">💊</span>
          </div>
          <p className="text-3xl font-black text-emerald-600">{activeMedications.length}</p>
          <p className="text-[11px] text-slate-400">Current prescribed regimens</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex justify-between items-center text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <span>Past Consultations</span>
            <span className="text-base">📋</span>
          </div>
          <p className="text-3xl font-black text-slate-900">{pastAppointments.length}</p>
          <p className="text-[11px] text-slate-400">Completed visit history</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex justify-between items-center text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <span>Calendar Sync</span>
            <span className="text-base">🔄</span>
          </div>
          <p className={`text-lg font-black mt-2 ${calendarConnected ? 'text-emerald-600' : 'text-slate-500'}`}>
            {calendarConnected ? 'Synchronized' : 'Not Connected'}
          </p>
          <p className="text-[11px] text-slate-400 truncate">
            {calendarEmail ? calendarEmail : 'Google Calendar'}
          </p>
        </div>
      </div>

      {/* Google Calendar Sync Widget */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-lg font-bold">
            📅
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">Google Calendar Synchronization</h3>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  calendarConnected
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                {calendarConnected ? 'Connected' : 'Not Connected'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {calendarConnected && calendarEmail
                ? `Syncing confirmed appointments and updates to ${calendarEmail}`
                : 'Connect your Google Calendar to synchronize scheduled consultations automatically.'}
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
              className="inline-block text-xs font-semibold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3.5 py-2 rounded-xl transition border border-blue-200"
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

      {loading ? (
        <div className="text-center py-16">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-slate-500 mt-3">Loading your healthcare records...</p>
        </div>
      ) : (
        <>
          {/* Active Medication Reminders & Schedules */}
          {activeMedications.length > 0 && (
            <section className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <span>💊 Active Medication Schedules & Reminders</span>
                  <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                    {activeMedications.length} Prescribed
                  </span>
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeMedications.map(({ med, doctorName, appointmentId }) => (
                  <div
                    key={med.id}
                    className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-xs space-y-3 relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500"></div>
                    <div className="flex justify-between items-start pt-1">
                      <div>
                        <h3 className="font-bold text-slate-900 text-base">{med.name}</h3>
                        <p className="text-xs font-semibold text-emerald-700">{med.dosage}</p>
                      </div>
                      {med.reminderTime && (
                        <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
                          ⏰ {med.reminderTime}
                        </span>
                      )}
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl text-xs space-y-1">
                      <div className="text-slate-700 font-medium">
                        <span className="font-bold">Frequency:</span> {med.frequency}
                      </div>
                      {med.instructions && (
                        <div className="text-slate-500">
                          <span className="font-bold text-slate-600">Instructions:</span> {med.instructions}
                        </div>
                      )}
                      <div className="text-slate-400 text-[11px] pt-1">
                        Prescribed by {doctorName}
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <Link
                        href={`/patient/appointments/${appointmentId}`}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                      >
                        View Full Prescription &rarr;
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Upcoming Section */}
          <section className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <span>Upcoming Appointments</span>
              <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full">
                {upcomingAppointments.length}
              </span>
            </h2>

            {upcomingAppointments.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                <p className="text-slate-500 text-sm">You have no upcoming appointments scheduled.</p>
                <Link
                  href="/patient/doctors"
                  className="mt-4 inline-block px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium text-sm rounded-lg transition"
                >
                  Find a Doctor &rarr;
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {upcomingAppointments.map((apt) => (
                  <div
                    key={apt.id}
                    className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:border-blue-300 transition space-y-4"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-slate-900">
                          Dr. {apt.doctor.doctorProfile?.firstName} {apt.doctor.doctorProfile?.lastName}
                        </h3>
                        <p className="text-xs text-blue-600 font-medium mt-0.5">
                          {apt.doctor.doctorProfile?.specialisation}
                        </p>
                      </div>
                      <StatusBadge status={apt.status} />
                    </div>

                    <div className="bg-slate-50 rounded-xl p-3 text-xs space-y-1">
                      <div className="text-slate-700 font-medium">
                        🕒 {formatDateTime(apt.startAt)}
                      </div>
                      {apt.symptomSubmission?.symptoms && (
                        <div className="text-slate-500 line-clamp-2">
                          📝 <span className="font-semibold text-slate-600">Symptoms:</span> {apt.symptomSubmission.symptoms}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                      <Link
                        href={`/patient/appointments/${apt.id}`}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
                      >
                        View & Manage &rarr;
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Past / History Section */}
          <section className="space-y-4 pt-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <span>Appointment History & Consultations</span>
              <span className="text-xs bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-full">
                {pastAppointments.length}
              </span>
            </h2>

            {pastAppointments.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-sm text-slate-400">
                No past appointment history.
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="divide-y divide-slate-100">
                  {pastAppointments.map((apt) => (
                    <div key={apt.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900">
                            Dr. {apt.doctor.doctorProfile?.firstName} {apt.doctor.doctorProfile?.lastName}
                          </span>
                          <span className="text-xs text-slate-500">
                            ({apt.doctor.doctorProfile?.specialisation})
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          {formatDateTime(apt.startAt)}
                        </p>
                        {apt.consultation?.postVisitSummary?.patientSummary && (
                          <p className="text-xs text-slate-600 line-clamp-1 italic">
                            ✨ {apt.consultation.postVisitSummary.patientSummary}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusBadge status={apt.status} />
                        <Link
                          href={`/patient/appointments/${apt.id}`}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold transition"
                        >
                          View Summary & Prescription &rarr;
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
