'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import StatusBadge from '@/components/StatusBadge'

interface PreVisitSummaryData {
  id: string
  urgencyLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | null
  chiefComplaint?: string | null
  suggestedQuestions?: string[] | null
  generationStatus: 'PENDING' | 'COMPLETED' | 'FAILED'
  errorMetadata?: { message?: string } | null
}

interface MedicationRow {
  name: string
  dosage: string
  instructions: string
  frequency: string
  startDate?: string
  endDate?: string
  reminderTime?: string
}

interface DoctorAppointmentDetail {
  id: string
  startAt: string
  endAt: string
  status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'LEAVE_AFFECTED'
  cancellationReason?: string | null
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
  preVisitSummary?: PreVisitSummaryData | null
  consultation?: {
    id: string
    clinicalNotes: string
    createdAt: string
    prescription?: {
      instructions?: string | null
      followUpInformation?: string | null
      medications: MedicationRow[]
    } | null
    postVisitSummary?: {
      patientSummary?: string | null
      medicationSchedule?: string | null
      followUpSteps?: string | null
      generationStatus: string
    } | null
  } | null
}

export default function DoctorAppointmentDetailPage() {
  const params = useParams()
  const appointmentId = params.id as string

  const [appointment, setAppointment] = useState<DoctorAppointmentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Consultation form state
  const [clinicalNotes, setClinicalNotes] = useState('')
  const [instructions, setInstructions] = useState('')
  const [followUpInformation, setFollowUpInformation] = useState('')
  const [medications, setMedications] = useState<MedicationRow[]>([])
  const [submittingConsultation, setSubmittingConsultation] = useState(false)
  const [retryingAI, setRetryingAI] = useState(false)

  const fetchAppointment = useCallback(() => {
    fetch(`/api/appointments/${appointmentId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setAppointment(data.data.appointment)
        } else {
          setError(data.error || 'Failed to load appointment details')
        }
      })
      .catch(() => setError('Failed to load appointment'))
      .finally(() => setLoading(false))
  }, [appointmentId])

  useEffect(() => {
    fetchAppointment()
  }, [fetchAppointment])

  const addMedicationRow = () => {
    setMedications([
      ...medications,
      {
        name: '',
        dosage: '',
        instructions: '',
        frequency: 'Once daily',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        reminderTime: '09:00',
      },
    ])
  }

  const removeMedicationRow = (index: number) => {
    setMedications(medications.filter((_, i) => i !== index))
  }

  const updateMedicationRow = (index: number, field: keyof MedicationRow, value: string) => {
    const updated = [...medications]
    updated[index] = { ...updated[index], [field]: value }
    setMedications(updated)
  }

  const handleRetryPreVisitAI = async () => {
    setRetryingAI(true)
    setError(null)
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/pre-visit-summary`, {
        method: 'POST',
      })
      const data = await res.json()
      if (data.success) {
        fetchAppointment()
      } else {
        setError(data.error || 'Failed to retry AI analysis')
      }
    } catch {
      setError('An error occurred during AI analysis retry')
    } finally {
      setRetryingAI(false)
    }
  }

  const handleSubmitConsultation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clinicalNotes.trim()) {
      setError('Please provide clinical notes before completing consultation.')
      return
    }

    setSubmittingConsultation(true)
    setError(null)
    setSuccessMsg(null)

    try {
      const res = await fetch(`/api/appointments/${appointmentId}/consultation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicalNotes: clinicalNotes.trim(),
          instructions: instructions.trim() || undefined,
          followUpInformation: followUpInformation.trim() || undefined,
          medications: medications.filter((m) => m.name.trim().length > 0),
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to submit consultation')
      } else {
        setSuccessMsg('Consultation recorded and visit marked completed!')
        fetchAppointment()
      }
    } catch {
      setError('An unexpected error occurred while saving consultation')
    } finally {
      setSubmittingConsultation(false)
    }
  }

  const formatDateTime = (iso: string) => {
    return new Date(iso).toLocaleString('en-US', {
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
        <Link href="/doctor" className="text-blue-600 text-sm mt-3 inline-block font-medium">
          &larr; Back to Schedule
        </Link>
      </div>
    )
  }

  const isConfirmed = appointment.status === 'CONFIRMED'
  const isCompleted = appointment.status === 'COMPLETED'
  const preVisitAI = appointment.preVisitSummary

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link href="/doctor" className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-block mb-3">
          &larr; Back to Schedule
        </Link>
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-slate-900">Patient Consultation Workspace</h1>
          <StatusBadge status={appointment.status} />
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 font-bold ml-4">✕</button>
        </div>
      )}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl">
          {successMsg}
        </div>
      )}

      {/* Patient Information Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center space-x-4 pb-4 border-b border-slate-100">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center font-bold text-lg border border-indigo-100">
            👤
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {appointment.patient.patientProfile
                ? `${appointment.patient.patientProfile.firstName} ${appointment.patient.patientProfile.lastName}`
                : appointment.patient.email}
            </h2>
            <div className="flex gap-4 text-xs text-slate-500 mt-0.5">
              <span>📧 {appointment.patient.email}</span>
              {appointment.patient.patientProfile?.phone && (
                <span>📞 {appointment.patient.patientProfile.phone}</span>
              )}
            </div>
          </div>
        </div>

        <div className="bg-slate-50 p-4 rounded-xl text-xs space-y-1">
          <span className="text-slate-400 font-medium">Scheduled Time:</span>
          <p className="text-sm font-bold text-slate-800">{formatDateTime(appointment.startAt)}</p>
        </div>

        {/* Symptoms submission */}
        <div>
          <h3 className="text-sm font-bold text-slate-900 mb-2">Patient Submitted Symptoms:</h3>
          {appointment.symptomSubmission?.symptoms ? (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 whitespace-pre-wrap">
              {appointment.symptomSubmission.symptoms}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">No symptoms submitted in advance.</p>
          )}
        </div>
      </div>

      {/* Pre-Visit AI Urgency & Symptoms Summary */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span>🤖 Pre-Visit AI Urgency & Summary</span>
            {preVisitAI?.urgencyLevel && (
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  preVisitAI.urgencyLevel === 'HIGH'
                    ? 'bg-rose-100 text-rose-800 border border-rose-200'
                    : preVisitAI.urgencyLevel === 'MEDIUM'
                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}
              >
                Urgency: {preVisitAI.urgencyLevel}
              </span>
            )}
          </h3>

          {preVisitAI?.generationStatus === 'FAILED' && (
            <button
              onClick={handleRetryPreVisitAI}
              disabled={retryingAI}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg transition"
            >
              {retryingAI ? 'Retrying...' : '↻ Retry AI Analysis'}
            </button>
          )}
        </div>

        {preVisitAI?.generationStatus === 'COMPLETED' ? (
          <div className="space-y-4">
            <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-100">
              <span className="text-xs font-bold text-blue-900 uppercase tracking-wider block mb-1">
                Chief Complaint:
              </span>
              <p className="text-sm text-slate-800 font-medium">{preVisitAI.chiefComplaint}</p>
            </div>

            {preVisitAI.suggestedQuestions && preVisitAI.suggestedQuestions.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Suggested Questions for Consultation:
                </span>
                <ul className="space-y-2 text-sm text-slate-700">
                  {preVisitAI.suggestedQuestions.map((q, idx) => (
                    <li key={idx} className="flex items-start gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      <span className="font-bold text-blue-600 text-xs">Q{idx + 1}.</span>
                      <span>{q}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[11px] text-slate-400 italic">
              ℹ️ Clinical AI triage assistance. Does not replace professional clinical diagnosis or judgment.
            </p>
          </div>
        ) : preVisitAI?.generationStatus === 'FAILED' ? (
          <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
            <p className="font-bold">⚠️ AI pre-visit summary unavailable.</p>
            <p className="text-slate-600">
              The automated summary could not be generated ({preVisitAI.errorMetadata?.message || 'LLM service offline'}). You can review the raw patient symptoms above.
            </p>
          </div>
        ) : (
          <div className="p-6 bg-slate-50 border border-slate-100 rounded-xl text-center space-y-2">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs text-slate-500">Analyzing patient symptoms with clinical AI triage...</p>
          </div>
        )}
      </div>

      {/* Consultation Section */}
      {isCompleted && appointment.consultation ? (
        /* Completed Consultation View */
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="flex justify-between items-center pb-4 border-b border-slate-100">
            <h3 className="text-base font-bold text-slate-900">Recorded Consultation & Prescription</h3>
            <span className="text-xs text-slate-400 font-medium">
              Completed on {new Date(appointment.consultation.createdAt).toLocaleString()}
            </span>
          </div>

          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Doctor Clinical Notes:</h4>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 whitespace-pre-wrap">
              {appointment.consultation.clinicalNotes}
            </div>
          </div>

          {appointment.consultation.prescription && (
            <div className="space-y-4 pt-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Prescribed Medications:</h4>
              {appointment.consultation.prescription.medications.length > 0 ? (
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
                      {appointment.consultation.prescription.medications.map((m, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
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
                <p className="text-xs text-slate-400 italic">No specific medications prescribed.</p>
              )}

              {appointment.consultation.prescription.instructions && (
                <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-700">
                  <span className="font-semibold text-slate-900">General Instructions:</span>{' '}
                  {appointment.consultation.prescription.instructions}
                </div>
              )}
            </div>
          )}

          {/* Post-Visit Summary Status */}
          {appointment.consultation.postVisitSummary && (
            <div className="pt-4 border-t border-slate-100 space-y-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Patient-Friendly Post-Visit Summary:</h4>
              {appointment.consultation.postVisitSummary.generationStatus === 'COMPLETED' ? (
                <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl text-xs text-slate-800 space-y-2">
                  <p className="font-medium">{appointment.consultation.postVisitSummary.patientSummary}</p>
                  {appointment.consultation.postVisitSummary.followUpSteps && (
                    <p className="text-slate-600"><span className="font-bold text-emerald-800">Follow-up:</span> {appointment.consultation.postVisitSummary.followUpSteps}</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">Post-visit summary generation {appointment.consultation.postVisitSummary.generationStatus.toLowerCase()}.</p>
              )}
            </div>
          )}
        </div>
      ) : isConfirmed ? (
        /* Doctor Consultation Form */
        <form onSubmit={handleSubmitConsultation} className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900">Conduct Consultation & Record Notes</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Submit your clinical findings and prescriptions. A patient-friendly post-visit AI summary will be generated automatically.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Clinical Notes & Assessment (Required)
            </label>
            <textarea
              required
              rows={4}
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
              placeholder="Record clinical diagnosis, examination findings, and medical advice..."
              className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Prescription & Medications Section */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div className="flex justify-between items-center">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Prescription & Medication Schedule</h4>
                <p className="text-xs text-slate-500">Add medications and intake instructions for the patient.</p>
              </div>
              <button
                type="button"
                onClick={addMedicationRow}
                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg transition"
              >
                + Add Medication
              </button>
            </div>

            {medications.length > 0 && (
              <div className="space-y-3">
                {medications.map((med, idx) => (
                  <div key={idx} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 relative">
                    <button
                      type="button"
                      onClick={() => removeMedicationRow(idx)}
                      className="absolute top-3 right-3 text-slate-400 hover:text-red-600 text-xs font-bold"
                    >
                      ✕ Remove
                    </button>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-0.5">Medication Name</label>
                        <input
                          type="text"
                          required
                          value={med.name}
                          onChange={(e) => updateMedicationRow(idx, 'name', e.target.value)}
                          placeholder="E.g., Amoxicillin"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-0.5">Dosage</label>
                        <input
                          type="text"
                          required
                          value={med.dosage}
                          onChange={(e) => updateMedicationRow(idx, 'dosage', e.target.value)}
                          placeholder="E.g., 500mg"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-0.5">Frequency</label>
                        <input
                          type="text"
                          required
                          value={med.frequency}
                          onChange={(e) => updateMedicationRow(idx, 'frequency', e.target.value)}
                          placeholder="E.g., Twice daily after food"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-0.5">Instructions (Optional)</label>
                        <input
                          type="text"
                          value={med.instructions}
                          onChange={(e) => updateMedicationRow(idx, 'instructions', e.target.value)}
                          placeholder="E.g., Take with plenty of water"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-0.5">Reminder Time</label>
                        <input
                          type="time"
                          value={med.reminderTime}
                          onChange={(e) => updateMedicationRow(idx, 'reminderTime', e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">General Care Instructions (Optional)</label>
                <textarea
                  rows={2}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="E.g., Rest for 2 days, stay hydrated..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Follow-Up Information (Optional)</label>
                <textarea
                  rows={2}
                  value={followUpInformation}
                  onChange={(e) => setFollowUpInformation(e.target.value)}
                  placeholder="E.g., Follow up in 7 days if fever persists..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              type="submit"
              disabled={submittingConsultation}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold rounded-xl text-sm shadow-md transition flex items-center justify-center"
            >
              {submittingConsultation ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                'Submit Consultation & Complete Visit'
              )}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  )
}
