'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface WorkingHour {
  id?: string
  weekday: number
  startTime: string
  endTime: string
}

interface LeaveDay {
  id: string
  startAt: string
  endAt: string
  reason?: string | null
}

interface DoctorProfileData {
  id: string
  email: string
  doctorProfile: {
    id: string
    firstName: string
    lastName: string
    specialisation: string
    slotDurationMinutes: number
    isActive: boolean
    workingHours: WorkingHour[]
    leaveDays: LeaveDay[]
  }
}

const WEEKDAYS = [
  { index: 0, label: 'Sunday' },
  { index: 1, label: 'Monday' },
  { index: 2, label: 'Tuesday' },
  { index: 3, label: 'Wednesday' },
  { index: 4, label: 'Thursday' },
  { index: 5, label: 'Friday' },
  { index: 6, label: 'Saturday' },
]

export default function AdminDoctorDetailPage() {
  const params = useParams()
  const doctorId = params.id as string

  const [doctor, setDoctor] = useState<DoctorProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<'profile' | 'hours' | 'leave'>('profile')

  // Profile Form State
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    specialisation: '',
    slotDurationMinutes: 30,
    isActive: true,
  })
  const [savingProfile, setSavingProfile] = useState(false)

  // Working Hours State
  const [workingHoursState, setWorkingHoursState] = useState<Record<number, { active: boolean; startTime: string; endTime: string }>>({
    0: { active: false, startTime: '09:00', endTime: '17:00' },
    1: { active: true, startTime: '09:00', endTime: '17:00' },
    2: { active: true, startTime: '09:00', endTime: '17:00' },
    3: { active: true, startTime: '09:00', endTime: '17:00' },
    4: { active: true, startTime: '09:00', endTime: '17:00' },
    5: { active: true, startTime: '09:00', endTime: '17:00' },
    6: { active: false, startTime: '09:00', endTime: '17:00' },
  })
  const [savingHours, setSavingHours] = useState(false)

  // Leave Form State
  const [leaveForm, setLeaveForm] = useState({
    startDate: new Date().toISOString().split('T')[0],
    startTime: '00:00',
    endDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    endTime: '23:59',
    reason: '',
  })
  const [savingLeave, setSavingLeave] = useState(false)
  const [affectedCount, setAffectedCount] = useState<number | null>(null)

  const fetchDoctor = useCallback(() => {
    setLoading(true)
    fetch(`/api/admin/doctors/${doctorId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data.doctor) {
          const doc: DoctorProfileData = data.data.doctor
          setDoctor(doc)
          setProfileForm({
            firstName: doc.doctorProfile.firstName,
            lastName: doc.doctorProfile.lastName,
            specialisation: doc.doctorProfile.specialisation,
            slotDurationMinutes: doc.doctorProfile.slotDurationMinutes,
            isActive: doc.doctorProfile.isActive,
          })

          // Populate working hours state
          const hoursMap: Record<number, { active: boolean; startTime: string; endTime: string }> = {
            0: { active: false, startTime: '09:00', endTime: '17:00' },
            1: { active: false, startTime: '09:00', endTime: '17:00' },
            2: { active: false, startTime: '09:00', endTime: '17:00' },
            3: { active: false, startTime: '09:00', endTime: '17:00' },
            4: { active: false, startTime: '09:00', endTime: '17:00' },
            5: { active: false, startTime: '09:00', endTime: '17:00' },
            6: { active: false, startTime: '09:00', endTime: '17:00' },
          }

          doc.doctorProfile.workingHours.forEach((wh) => {
            hoursMap[wh.weekday] = {
              active: true,
              startTime: wh.startTime,
              endTime: wh.endTime,
            }
          })
          setWorkingHoursState(hoursMap)
        } else {
          setError(data.error || 'Failed to load doctor profile')
        }
      })
      .catch(() => setError('Failed to load doctor details'))
      .finally(() => setLoading(false))
  }, [doctorId])

  useEffect(() => {
    fetchDoctor()
  }, [fetchDoctor])

  // Save Profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    setError(null)
    setSuccessMsg(null)

    try {
      const res = await fetch(`/api/admin/doctors/${doctorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to update profile')
      } else {
        setSuccessMsg('Doctor profile updated successfully!')
        fetchDoctor()
      }
    } catch {
      setError('An error occurred saving profile')
    } finally {
      setSavingProfile(false)
    }
  }

  // Save Working Hours
  const handleSaveHours = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingHours(true)
    setError(null)
    setSuccessMsg(null)

    const hoursPayload: WorkingHour[] = []
    Object.entries(workingHoursState).forEach(([weekdayStr, val]) => {
      if (val.active) {
        hoursPayload.push({
          weekday: Number(weekdayStr),
          startTime: val.startTime,
          endTime: val.endTime,
        })
      }
    })

    try {
      const res = await fetch(`/api/admin/doctors/${doctorId}/working-hours`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hoursPayload),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to update working hours')
      } else {
        setSuccessMsg('Working hours updated successfully!')
        fetchDoctor()
      }
    } catch {
      setError('An error occurred saving working hours')
    } finally {
      setSavingHours(false)
    }
  }

  // Schedule Leave
  const handleAddLeave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingLeave(true)
    setError(null)
    setSuccessMsg(null)
    setAffectedCount(null)

    const startAt = new Date(`${leaveForm.startDate}T${leaveForm.startTime}:00`).toISOString()
    const endAt = new Date(`${leaveForm.endDate}T${leaveForm.endTime}:00`).toISOString()

    try {
      const res = await fetch(`/api/admin/doctors/${doctorId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startAt,
          endAt,
          reason: leaveForm.reason || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to schedule doctor leave')
      } else {
        setAffectedCount(data.data.affectedAppointmentsCount)
        setSuccessMsg('Leave scheduled successfully!')
        setLeaveForm({ ...leaveForm, reason: '' })
        fetchDoctor()
      }
    } catch {
      setError('An error occurred scheduling leave')
    } finally {
      setSavingLeave(false)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-sm text-slate-500 mt-3">Loading doctor details...</p>
      </div>
    )
  }

  if (!doctor) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
        <p className="text-red-600 font-semibold">{error || 'Doctor not found'}</p>
        <Link href="/admin" className="text-blue-600 text-sm mt-3 inline-block font-medium">
          &larr; Back to Admin Dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link href="/admin" className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-block mb-3">
          &larr; Back to Admin Dashboard
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Dr. {doctor.doctorProfile.firstName} {doctor.doctorProfile.lastName}
            </h1>
            <p className="text-xs text-slate-500">{doctor.email} • Specialisation: {doctor.doctorProfile.specialisation}</p>
          </div>
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
              doctor.doctorProfile.isActive
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-slate-100 text-slate-500 border border-slate-200'
            }`}
          >
            ● {doctor.doctorProfile.isActive ? 'Active Doctor' : 'Inactive'}
          </span>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl">
          {successMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('profile')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'profile'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Profile & Specialty
        </button>
        <button
          onClick={() => setActiveTab('hours')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'hours'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Working Hours Intervals
        </button>
        <button
          onClick={() => setActiveTab('leave')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'leave'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Leave Management
        </button>
      </div>

      {/* TAB 1: Profile */}
      {activeTab === 'profile' && (
        <form onSubmit={handleSaveProfile} className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">First Name</label>
              <input
                type="text"
                required
                value={profileForm.firstName}
                onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Last Name</label>
              <input
                type="text"
                required
                value={profileForm.lastName}
                onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Specialisation</label>
              <input
                type="text"
                required
                value={profileForm.specialisation}
                onChange={(e) => setProfileForm({ ...profileForm, specialisation: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Slot Duration (Minutes)</label>
              <select
                value={profileForm.slotDurationMinutes}
                onChange={(e) => setProfileForm({ ...profileForm, slotDurationMinutes: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value={15}>15 Minutes</option>
                <option value={20}>20 Minutes</option>
                <option value={30}>30 Minutes</option>
                <option value={45}>45 Minutes</option>
                <option value={60}>60 Minutes</option>
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-3 pt-2">
            <input
              type="checkbox"
              id="isActiveToggle"
              checked={profileForm.isActive}
              onChange={(e) => setProfileForm({ ...profileForm, isActive: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <label htmlFor="isActiveToggle" className="text-sm font-semibold text-slate-800">
              Doctor is Active and Accepting Appointments
            </label>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              type="submit"
              disabled={savingProfile}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold rounded-xl text-sm shadow-sm transition"
            >
              {savingProfile ? 'Saving...' : 'Save Profile Changes'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: Working Hours */}
      {activeTab === 'hours' && (
        <form onSubmit={handleSaveHours} className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900">Weekly Working Schedule</h3>
            <p className="text-xs text-slate-500">Configure the operating hours for each day of the week.</p>
          </div>

          <div className="space-y-3">
            {WEEKDAYS.map((day) => {
              const state = workingHoursState[day.index]
              return (
                <div
                  key={day.index}
                  className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                    state.active ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200/50 opacity-60'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-[140px]">
                    <input
                      type="checkbox"
                      id={`day-${day.index}`}
                      checked={state.active}
                      onChange={(e) =>
                        setWorkingHoursState({
                          ...workingHoursState,
                          [day.index]: { ...state, active: e.target.checked },
                        })
                      }
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <label htmlFor={`day-${day.index}`} className="text-sm font-bold text-slate-800 cursor-pointer">
                      {day.label}
                    </label>
                  </div>

                  {state.active ? (
                    <div className="flex items-center space-x-2 text-xs font-semibold text-slate-600">
                      <span>From:</span>
                      <input
                        type="time"
                        value={state.startTime}
                        onChange={(e) =>
                          setWorkingHoursState({
                            ...workingHoursState,
                            [day.index]: { ...state, startTime: e.target.value },
                          })
                        }
                        className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs"
                      />
                      <span>To:</span>
                      <input
                        type="time"
                        value={state.endTime}
                        onChange={(e) =>
                          setWorkingHoursState({
                            ...workingHoursState,
                            [day.index]: { ...state, endTime: e.target.value },
                          })
                        }
                        className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 font-medium">Off Day / Closed</span>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              type="submit"
              disabled={savingHours}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold rounded-xl text-sm shadow-sm transition"
            >
              {savingHours ? 'Saving Schedule...' : 'Save Working Hours'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: Leave Management */}
      {activeTab === 'leave' && (
        <div className="space-y-6">
          {/* Leave Conflict Warning Banner if any */}
          {affectedCount !== null && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
              <span className="font-bold uppercase tracking-wider">Automated Conflict Resolution:</span>
              <p>
                Leave recorded. <strong>{affectedCount} conflicting patient appointment(s)</strong> were automatically cancelled and durable notification jobs were queued for affected patients.
              </p>
            </div>
          )}

          {/* Schedule Leave Form */}
          <form onSubmit={handleAddLeave} className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-900">Record Doctor Leave</h3>
              <p className="text-xs text-slate-500">
                Mark dates when the doctor will be absent. Any conflicting confirmed bookings will be safely cancelled and notified.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Leave Start Date & Time</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    required
                    value={leaveForm.startDate}
                    onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                  <input
                    type="time"
                    required
                    value={leaveForm.startTime}
                    onChange={(e) => setLeaveForm({ ...leaveForm, startTime: e.target.value })}
                    className="w-24 px-2 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Leave End Date & Time</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    required
                    value={leaveForm.endDate}
                    onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                  <input
                    type="time"
                    required
                    value={leaveForm.endTime}
                    onChange={(e) => setLeaveForm({ ...leaveForm, endTime: e.target.value })}
                    className="w-24 px-2 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Reason for Leave (Optional)</label>
              <input
                type="text"
                value={leaveForm.reason}
                onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                placeholder="E.g., Medical Conference, Annual Leave..."
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button
                type="submit"
                disabled={savingLeave}
                className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white font-semibold rounded-xl text-sm shadow-sm transition"
              >
                {savingLeave ? 'Recording Leave...' : 'Schedule Leave Period'}
              </button>
            </div>
          </form>

          {/* Leave History Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Scheduled Leave Periods</h4>
            </div>
            {doctor.doctorProfile.leaveDays.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No active or upcoming leave days recorded for this doctor.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {doctor.doctorProfile.leaveDays.map((leave) => (
                  <div key={leave.id} className="p-4 text-xs flex flex-col sm:flex-row justify-between gap-2">
                    <div>
                      <span className="font-bold text-slate-800">
                        {new Date(leave.startAt).toLocaleDateString()} {new Date(leave.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &rarr;{' '}
                        {new Date(leave.endAt).toLocaleDateString()} {new Date(leave.endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {leave.reason && (
                        <p className="text-slate-500 mt-0.5">Reason: {leave.reason}</p>
                      )}
                    </div>
                    <span className="inline-flex self-start px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                      Leave Active
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
