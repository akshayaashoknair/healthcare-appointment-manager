'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import StatusBadge from '@/components/StatusBadge'

interface MedicationItem {
  id: string
  name: string
  dosage: string
  frequency: string
  instructions?: string | null
}

interface ConsultationData {
  id: string
  clinicalNotes: string
  createdAt: string
  prescription?: {
    instructions?: string | null
    followUpInformation?: string | null
    medications: MedicationItem[]
  } | null
  postVisitSummary?: {
    patientSummary?: string | null
    medicationSchedule?: string | null
    followUpSteps?: string | null
    generationStatus: 'PENDING' | 'COMPLETED' | 'FAILED'
    errorMetadata?: { message?: string } | null
  } | null
}

interface AppointmentDetail {
  id: string
  startAt: string
  endAt: string
  status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'LEAVE_AFFECTED'
  cancellationReason?: string | null
  cancelledAt?: string | null
  doctor: {
    id: string
    doctorProfile?: {
      firstName: string
      lastName: string
      specialisation: string
      slotDurationMinutes: number
    } | null
  }
  symptomSubmission?: {
    symptoms: string
  } | null
  consultation?: ConsultationData | null
}

interface SlotItem {
  startAt: string
  endAt: string
  available: boolean
}

export default function PatientAppointmentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const appointmentId = params.id as string

  const [appointment, setAppointment] = useState<AppointmentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Cancel state
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)

  // Reschedule state
  const [showRescheduleModal, setShowRescheduleModal] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState(() => new Date().toISOString().split('T')[0])
  const [availableSlots, setAvailableSlots] = useState<SlotItem[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedRescheduleSlot, setSelectedRescheduleSlot] = useState<SlotItem | null>(null)
  const [rescheduling, setRescheduling] = useState(false)
  const [rescheduleError, setRescheduleError] = useState<string | null>(null)

  const fetchAppointment = useCallback(() => {
    setLoading(true)
    fetch(`/api/appointments/${appointmentId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setAppointment(data.data.appointment)
        } else {
          setError(data.error || 'Failed to load appointment')
        }
      })
      .catch(() => setError('Failed to load appointment details'))
      .finally(() => setLoading(false))
  }, [appointmentId])

  useEffect(() => {
    fetchAppointment()
  }, [fetchAppointment])

  // Load slots for reschedule
  useEffect(() => {
    if (!showRescheduleModal || !appointment?.doctor.id || !rescheduleDate) return
    setSlotsLoading(true)
    setRescheduleError(null)
    setSelectedRescheduleSlot(null)

    fetch(`/api/doctors/${appointment.doctor.id}/slots?date=${rescheduleDate}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setAvailableSlots(data.data.slots)
        } else {
          setRescheduleError(data.error || 'Failed to load slots')
        }
      })
      .catch(() => setRescheduleError('Failed to load slots'))
      .finally(() => setSlotsLoading(false))
  }, [showRescheduleModal, appointment?.doctor.id, rescheduleDate])

  const handleCancel = async () => {
    setCancelling(true)
    setError(null)
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason || 'Cancelled by patient' }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to cancel appointment')
      } else {
        setShowCancelModal(false)
        fetchAppointment()
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setCancelling(false)
    }
  }

  const handleReschedule = async () => {
    if (!selectedRescheduleSlot || !appointment) return
    setRescheduling(true)
    setRescheduleError(null)

    try {
      // 1. Create temporary hold for new slot
      const holdRes = await fetch('/api/appointments/holds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId: appointment.doctor.id,
          startAt: selectedRescheduleSlot.startAt,
          endAt: selectedRescheduleSlot.endAt,
          symptoms: appointment.symptomSubmission?.symptoms || 'Rescheduled appointment',
        }),
      })

      const holdData = await holdRes.json()
      if (!holdRes.ok || !holdData.success) {
        setRescheduleError(holdData.error || 'Could not hold new slot. Please choose another.')
        setRescheduling(false)
        return
      }

      // 2. Perform atomic reschedule
      const res = await fetch(`/api/appointments/${appointmentId}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newHoldId: holdData.data.hold.id }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        setRescheduleError(data.error || 'Failed to reschedule appointment')
      } else {
        setShowRescheduleModal(false)
        router.push(`/patient/appointments/${data.data.appointment.id}`)
      }
    } catch {
      setRescheduleError('An error occurred during rescheduling')
    } finally {
      setRescheduling(false)
    }
  }

  const formatDateTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  }

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-sm text-slate-500 mt-3">Loading appointment details...</p>
      </div>
    )
  }

  if (!appointment) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
        <p className="text-red-600 font-semibold">{error || 'Appointment not found'}</p>
        <Link href="/patient" className="text-blue-600 text-sm mt-3 inline-block font-medium">
          &larr; Back to Dashboard
        </Link>
      </div>
    )
  }

  const isConfirmed = appointment.status === 'CONFIRMED'
  const isCompleted = appointment.status === 'COMPLETED'
  const isFuture = new Date(appointment.startAt) > new Date()
  const canModify = isConfirmed && isFuture
  const consultation = appointment.consultation
  const postVisitAI = consultation?.postVisitSummary

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/patient" className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-block mb-3">
          &larr; Back to Dashboard
        </Link>
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-slate-900">Appointment Details</h1>
          <StatusBadge status={appointment.status} />
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">
          {error}
        </div>
      )}

      {/* Main Details Card */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center space-x-4 pb-6 border-b border-slate-100">
          <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center font-bold text-xl border border-blue-100">
            Dr
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Dr. {appointment.doctor.doctorProfile?.firstName} {appointment.doctor.doctorProfile?.lastName}
            </h2>
            <p className="text-sm text-blue-600 font-medium">{appointment.doctor.doctorProfile?.specialisation}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="bg-slate-50 p-4 rounded-xl space-y-1">
            <span className="text-xs text-slate-400 font-medium">Date & Time</span>
            <p className="font-semibold text-slate-800">{formatDateTime(appointment.startAt)}</p>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl space-y-1">
            <span className="text-xs text-slate-400 font-medium">Slot Duration</span>
            <p className="font-semibold text-slate-800">{appointment.doctor.doctorProfile?.slotDurationMinutes} Minutes</p>
          </div>
        </div>

        {appointment.symptomSubmission?.symptoms && (
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900">Your Submitted Pre-Visit Symptoms:</h3>
            <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl text-sm text-slate-700 whitespace-pre-wrap">
              {appointment.symptomSubmission.symptoms}
            </div>
          </div>
        )}

        {appointment.cancellationReason && (
          <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-sm text-rose-800 space-y-1">
            <span className="font-bold text-xs uppercase tracking-wider">Cancellation Information:</span>
            <p>{appointment.cancellationReason}</p>
            {appointment.cancelledAt && (
              <p className="text-xs text-rose-500">Cancelled on: {new Date(appointment.cancelledAt).toLocaleString()}</p>
            )}
          </div>
        )}

        {canModify && (
          <div className="pt-6 border-t border-slate-100 flex flex-wrap gap-3 justify-end">
            <button
              onClick={() => setShowRescheduleModal(true)}
              className="px-4 py-2.5 bg-blue-50 text-blue-700 hover:bg-blue-100 text-sm font-semibold rounded-xl transition"
            >
              🗓️ Reschedule Slot
            </button>
            <button
              onClick={() => setShowCancelModal(true)}
              className="px-4 py-2.5 bg-rose-50 text-rose-700 hover:bg-rose-100 text-sm font-semibold rounded-xl transition"
            >
              ✕ Cancel Appointment
            </button>
          </div>
        )}
      </div>

      {/* COMPLETED VISIT: Doctor Consultation & Prescription Details */}
      {isCompleted && consultation && (
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex justify-between items-center pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Post-Visit Consultation Summary</h3>
              <p className="text-xs text-slate-500">Consultation notes and official prescription from your doctor</p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
              Visit Completed
            </span>
          </div>

          {/* Patient-Friendly AI Post-Visit Summary */}
          {postVisitAI && postVisitAI.generationStatus === 'COMPLETED' ? (
            <div className="p-5 bg-gradient-to-br from-blue-50/70 to-indigo-50/70 border border-blue-200 rounded-2xl space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-base">✨</span>
                <h4 className="text-sm font-bold text-slate-900">Patient-Friendly Care Summary</h4>
              </div>
              <p className="text-sm text-slate-800 leading-relaxed">{postVisitAI.patientSummary}</p>

              {postVisitAI.medicationSchedule && (
                <div className="bg-white/80 p-3 rounded-xl border border-blue-100 text-xs space-y-1">
                  <span className="font-bold text-blue-900 uppercase tracking-wider block">Medication Schedule:</span>
                  <p className="text-slate-700">{postVisitAI.medicationSchedule}</p>
                </div>
              )}

              {postVisitAI.followUpSteps && (
                <div className="bg-white/80 p-3 rounded-xl border border-blue-100 text-xs space-y-1">
                  <span className="font-bold text-indigo-900 uppercase tracking-wider block">Follow-up & Next Steps:</span>
                  <p className="text-slate-700">{postVisitAI.followUpSteps}</p>
                </div>
              )}
            </div>
          ) : postVisitAI?.generationStatus === 'FAILED' ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
              ℹ️ Automated post-visit AI summary is currently unavailable. Your official doctor clinical notes and verified prescription are displayed below.
            </div>
          ) : null}

          {/* Official Doctor Prescription & Medications */}
          {consultation.prescription && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>💊 Doctor&apos;s Verified Prescription</span>
              </h4>

              {consultation.prescription.medications.length > 0 ? (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
                      <tr>
                        <th className="p-3">Medication</th>
                        <th className="p-3">Dosage</th>
                        <th className="p-3">Frequency</th>
                        <th className="p-3">Instructions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {consultation.prescription.medications.map((m) => (
                        <tr key={m.id} className="hover:bg-slate-50">
                          <td className="p-3 font-bold text-slate-900">{m.name}</td>
                          <td className="p-3 text-slate-700">{m.dosage}</td>
                          <td className="p-3 text-blue-600 font-semibold">{m.frequency}</td>
                          <td className="p-3 text-slate-600">{m.instructions || 'As prescribed'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No specific medications prescribed during this visit.</p>
              )}

              {consultation.prescription.instructions && (
                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-700 space-y-1">
                  <span className="font-bold text-slate-900">Doctor&apos;s Care Instructions:</span>
                  <p>{consultation.prescription.instructions}</p>
                </div>
              )}

              {consultation.prescription.followUpInformation && (
                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-700 space-y-1">
                  <span className="font-bold text-slate-900">Follow-up Guidance:</span>
                  <p>{consultation.prescription.followUpInformation}</p>
                </div>
              )}
            </div>
          )}

          {/* Doctor Clinical Notes */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Doctor Notes:</h4>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 whitespace-pre-wrap">
              {consultation.clinicalNotes}
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white max-w-md w-full p-6 rounded-2xl border border-slate-200 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Cancel Appointment</h3>
            <p className="text-sm text-slate-600">
              Are you sure you want to cancel this appointment? This action will release the reserved time slot immediately.
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Reason for cancellation (optional):</label>
              <textarea
                rows={2}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="E.g., Schedule conflict..."
                className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                disabled={cancelling}
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
              >
                Keep Appointment
              </button>
              <button
                type="button"
                disabled={cancelling}
                onClick={handleCancel}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white rounded-xl text-xs font-bold"
              >
                {cancelling ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {showRescheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white max-w-lg w-full p-6 rounded-2xl border border-slate-200 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">Reschedule Appointment</h3>
              <button
                onClick={() => setShowRescheduleModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Select a new date and available slot. Your original reservation will be safely released once the new slot is confirmed.
            </p>

            {rescheduleError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                {rescheduleError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">New Date:</label>
              <input
                type="date"
                min={new Date().toISOString().split('T')[0]}
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Available Slots:</label>
              {slotsLoading ? (
                <div className="py-6 text-center text-xs text-slate-400">Loading slots...</div>
              ) : availableSlots.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-400 bg-slate-50 rounded-lg">
                  No slots available on this date.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                  {availableSlots.map((slot) => {
                    const isSelected = selectedRescheduleSlot?.startAt === slot.startAt
                    const s = new Date(slot.startAt)
                    const e = new Date(slot.endAt)
                    const timeStr = `${s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })} - ${e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`

                    return (
                      <button
                        key={slot.startAt}
                        type="button"
                        disabled={!slot.available}
                        onClick={() => setSelectedRescheduleSlot(slot)}
                        className={`py-2 px-2 rounded-lg text-xs font-semibold border text-center transition ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                            : slot.available
                              ? 'bg-white hover:bg-blue-50 text-slate-800 border-slate-200'
                              : 'bg-slate-100 text-slate-400 border-slate-200/50 cursor-not-allowed line-through'
                        }`}
                      >
                        {timeStr}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={rescheduling}
                onClick={() => setShowRescheduleModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={rescheduling || !selectedRescheduleSlot}
                onClick={handleReschedule}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl text-xs font-bold shadow-sm"
              >
                {rescheduling ? 'Rescheduling...' : 'Confirm Reschedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
