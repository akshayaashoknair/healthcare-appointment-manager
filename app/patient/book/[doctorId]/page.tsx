'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

interface DoctorDetail {
  id: string
  doctorProfile: {
    firstName: string
    lastName: string
    specialisation: string
    slotDurationMinutes: number
  }
}

interface SlotItem {
  startAt: string
  endAt: string
  available: boolean
  doctorId: string
}

interface HoldDetail {
  id: string
  expiresAt: string
  startAt: string
  endAt: string
}

export default function BookDoctorPage() {
  const router = useRouter()
  const params = useParams()
  const doctorId = params.doctorId as string

  // State
  const [doctor, setDoctor] = useState<DoctorDetail | null>(null)
  const [doctorLoading, setDoctorLoading] = useState(true)

  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  })

  const [slots, setSlots] = useState<SlotItem[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<SlotItem | null>(null)

  const [symptoms, setSymptoms] = useState('')
  const [holding, setHolding] = useState(false)
  const [hold, setHold] = useState<HoldDetail | null>(null)
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)

  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 1. Fetch Doctor details
  useEffect(() => {
    fetch(`/api/doctors/${doctorId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setDoctor(data.data.doctor)
        } else {
          setError(data.error || 'Failed to load doctor profile')
        }
      })
      .catch(() => setError('Failed to load doctor profile'))
      .finally(() => setDoctorLoading(false))
  }, [doctorId])

  // 2. Fetch Slots for selected date
  const loadSlots = useCallback(() => {
    if (!doctorId || !selectedDate) return
    setSlotsLoading(true)
    setError(null)
    setSelectedSlot(null)
    setHold(null)

    fetch(`/api/doctors/${doctorId}/slots?date=${selectedDate}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setSlots(data.data.slots)
        } else {
          setError(data.error || 'Failed to load slots')
        }
      })
      .catch(() => setError('Failed to load available slots'))
      .finally(() => setSlotsLoading(false))
  }, [doctorId, selectedDate])

  useEffect(() => {
    loadSlots()
  }, [loadSlots])

  // 3. Hold Countdown Timer
  useEffect(() => {
    if (!hold) {
      setRemainingSeconds(null)
      return
    }

    const updateTimer = () => {
      const diff = Math.floor((new Date(hold.expiresAt).getTime() - Date.now()) / 1000)
      if (diff <= 0) {
        setRemainingSeconds(0)
        setHold(null)
        setError('Your slot hold has expired. Please select a slot again.')
        loadSlots()
      } else {
        setRemainingSeconds(diff)
      }
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [hold, loadSlots])

  // 4. Create Slot Hold
  const handleCreateHold = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSlot) return
    if (!symptoms.trim()) {
      setError('Please provide a brief description of your symptoms')
      return
    }

    setHolding(true)
    setError(null)

    try {
      const res = await fetch('/api/appointments/holds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId,
          startAt: selectedSlot.startAt,
          endAt: selectedSlot.endAt,
          symptoms: symptoms.trim(),
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to reserve slot hold')
        if (res.status === 409) {
          loadSlots() // Refresh availability on conflict
        }
        setHolding(false)
        return
      }

      setHold(data.data.hold)
    } catch {
      setError('An unexpected network error occurred')
    } finally {
      setHolding(false)
    }
  }

  // 5. Confirm Hold into Appointment
  const handleConfirm = async () => {
    if (!hold) return
    setConfirming(true)
    setError(null)

    try {
      const res = await fetch(`/api/appointments/holds/${hold.id}/confirm`, {
        method: 'POST',
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to confirm booking')
        if (res.status === 409) {
          setHold(null)
          loadSlots()
        }
        setConfirming(false)
        return
      }

      router.push(`/patient/appointments/${data.data.appointment.id}`)
    } catch {
      setError('An unexpected error occurred during confirmation')
      setConfirming(false)
    }
  }

  const formatTimeSlot = (isoStart: string, isoEnd: string) => {
    const s = new Date(isoStart)
    const e = new Date(isoEnd)
    return `${s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })} - ${e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`
  }

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  if (doctorLoading) {
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
        <p className="text-red-600 font-semibold">Doctor not found or inactive.</p>
        <Link href="/patient/doctors" className="text-blue-600 text-sm mt-3 inline-block font-medium">
          &larr; Back to Doctor Search
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Back Link & Header */}
      <div>
        <Link href="/patient/doctors" className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-block mb-3">
          &larr; Back to all doctors
        </Link>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center font-bold text-xl border border-blue-100">
              Dr
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Dr. {doctor.doctorProfile.firstName} {doctor.doctorProfile.lastName}
              </h1>
              <p className="text-sm text-blue-600 font-semibold">{doctor.doctorProfile.specialisation}</p>
            </div>
          </div>
          <div className="text-right sm:border-l sm:border-slate-100 sm:pl-6">
            <span className="text-xs text-slate-400">Slot Duration</span>
            <p className="text-base font-bold text-slate-800">{doctor.doctorProfile.slotDurationMinutes} Minutes</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold ml-4">✕</button>
        </div>
      )}

      {/* Booking Form Card */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        {/* Step 1: Select Date */}
        <div>
          <label className="block text-sm font-bold text-slate-900 mb-2">
            1. Select Appointment Date
          </label>
          <input
            type="date"
            min={new Date().toISOString().split('T')[0]}
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            disabled={hold !== null}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Step 2: Available Slots */}
        <div>
          <label className="block text-sm font-bold text-slate-900 mb-2">
            2. Choose an Available Slot (Clinic Time: Asia/Kolkata)
          </label>

          {slotsLoading ? (
            <div className="py-8 text-center text-slate-400 text-sm">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              Loading slots for {selectedDate}...
            </div>
          ) : slots.length === 0 ? (
            <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center text-sm text-slate-500">
              No available slots found for this date. The doctor may not have working hours or may be on leave.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {slots.map((slot) => {
                const isSelected = selectedSlot?.startAt === slot.startAt
                return (
                  <button
                    key={slot.startAt}
                    type="button"
                    disabled={!slot.available || hold !== null}
                    onClick={() => setSelectedSlot(slot)}
                    className={`py-2.5 px-3 rounded-xl text-xs font-semibold text-center border transition ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : slot.available
                          ? 'bg-white hover:bg-blue-50/50 text-slate-800 border-slate-200'
                          : 'bg-slate-100 text-slate-400 border-slate-200/60 cursor-not-allowed line-through'
                    }`}
                  >
                    {formatTimeSlot(slot.startAt, slot.endAt)}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Step 3: Symptoms Collection & Hold Creation */}
        {selectedSlot && !hold && (
          <form onSubmit={handleCreateHold} className="pt-4 border-t border-slate-100 space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-900 mb-1">
                3. Describe Your Symptoms & Concerns (Required)
              </label>
              <p className="text-xs text-slate-500 mb-2">
                Your symptoms are securely shared in advance with Dr. {doctor.doctorProfile.lastName} to prepare for your consultation.
              </p>
              <textarea
                required
                rows={3}
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                placeholder="E.g., Experiencing mild chest tightness for 2 days after physical exertion..."
                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={holding}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold rounded-xl text-sm shadow-sm transition flex justify-center items-center"
            >
              {holding ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                'Reserve 5-Minute Slot Hold & Proceed'
              )}
            </button>
          </form>
        )}

        {/* Step 4: Active Hold Countdown & Confirmation */}
        {hold && (
          <div className="p-6 bg-gradient-to-br from-emerald-50 to-blue-50 border border-emerald-200 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 mb-1">
                  🔒 Slot Held Under Concurrency Lock
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  {formatTimeSlot(hold.startAt, hold.endAt)} on {selectedDate}
                </h3>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 font-medium">Hold Expires In</span>
                <div className="text-2xl font-black text-rose-600 font-mono">
                  {remainingSeconds !== null ? formatTimer(remainingSeconds) : '--:--'}
                </div>
              </div>
            </div>

            <div className="bg-white/80 rounded-xl p-3 text-xs text-slate-700 border border-emerald-100">
              <span className="font-semibold text-slate-900">Submitted Symptoms:</span> {symptoms}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirming}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-bold rounded-xl text-sm shadow-md transition flex justify-center items-center"
              >
                {confirming ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  'Confirm & Book Appointment'
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setHold(null)
                  loadSlots()
                }}
                disabled={confirming}
                className="px-4 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 text-xs font-semibold rounded-xl transition"
              >
                Cancel Hold
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
