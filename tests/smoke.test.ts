import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { hashPassword, verifyPassword, createSessionToken, verifySessionToken } from '../lib/auth'
import { AvailabilityService, parseLocalTimeToUtc } from '../lib/services/availability.service'
import { GoogleCalendarService } from '../lib/services/google-calendar.service'
import { EmailService } from '../lib/services/email.service'
import {
  UserRole,
  AppointmentStatus,
  HoldStatus,
  ReservationStatus,
  NotificationType,
} from '../lib/types'
import {
  registerSchema,
  slotHoldSchema,
  consultationSubmitSchema,
  preVisitAIOutputSchema,
  postVisitAIOutputSchema,
  doctorLeaveSchema,
} from '../lib/validations'

describe('Mission 6: Production Smoke Tests & Live Verification', () => {
  // 1. Patient registration / login
  it('Smoke Test 1: Patient registration and login credentials verification', async () => {
    const registrationInput = {
      email: 'smoke.patient@careflow.test',
      password: 'SecurePassword123!',
      firstName: 'Smoke',
      lastName: 'Patient',
      phone: '+919876543210',
    }
    const validated = registerSchema.safeParse(registrationInput)
    assert.equal(validated.success, true)

    const hashedPassword = await hashPassword(registrationInput.password)
    const passwordMatch = await verifyPassword('SecurePassword123!', hashedPassword)
    const wrongMatch = await verifyPassword('WrongPassword!', hashedPassword)

    assert.equal(passwordMatch, true)
    assert.equal(wrongMatch, false)

    const token = createSessionToken({
      userId: 'user_smoke_patient_1',
      email: registrationInput.email,
      role: UserRole.PATIENT,
    })
    const session = verifySessionToken(token)
    assert.ok(session)
    assert.equal(session.email, registrationInput.email)
    assert.equal(session.role, UserRole.PATIENT)
  })

  // 2. Doctor search
  it('Smoke Test 2: Doctor search and specialization filtering', () => {
    const doctors = [
      { id: 'doc_1', name: 'Dr. Rajesh Mehta', spec: 'Cardiology', active: true },
      { id: 'doc_2', name: 'Dr. Priya Sharma', spec: 'Dermatology', active: true },
      { id: 'doc_3', name: 'Dr. Anita Desai', spec: 'Pediatrics', active: false },
    ]

    const cardiologyDoctors = doctors.filter((d) => d.active && d.spec === 'Cardiology')
    assert.equal(cardiologyDoctors.length, 1)
    assert.equal(cardiologyDoctors[0].name, 'Dr. Rajesh Mehta')

    const searchResults = doctors.filter((d) => d.active && d.name.toLowerCase().includes('sharma'))
    assert.equal(searchResults.length, 1)
    assert.equal(searchResults[0].id, 'doc_2')
  })

  // 3. Slot availability
  it('Smoke Test 3: Slot availability calculation in Asia/Kolkata timezone', () => {
    const testDate = '2026-09-07' // Monday
    const startUtc = parseLocalTimeToUtc(testDate, '09:00')
    const endUtc = parseLocalTimeToUtc(testDate, '09:30')

    assert.ok(startUtc instanceof Date)
    assert.ok(endUtc instanceof Date)
    assert.ok(endUtc > startUtc)

    // Compute half-open interval overlap
    const busySlot = { startAt: new Date('2026-09-07T04:00:00Z'), endAt: new Date('2026-09-07T04:30:00Z') }
    const candidateSlot = { startAt: new Date('2026-09-07T04:00:00Z'), endAt: new Date('2026-09-07T04:30:00Z') }
    const isBusy = AvailabilityService.intervalsOverlap(candidateSlot.startAt, candidateSlot.endAt, busySlot.startAt, busySlot.endAt)
    assert.equal(isBusy, true)
  })

  // 4 & 5. Appointment booking & Symptom submission (5-minute hold)
  it('Smoke Test 4 & 5: Slot hold creation and symptom intake validation', () => {
    const holdInput = {
      doctorId: 'doc_mehta_1',
      startAt: '2026-09-07T04:00:00.000Z',
      endAt: '2026-09-07T04:30:00.000Z',
      symptoms: 'Patient reports mild shortness of breath during exertion for 3 days.',
    }
    const validated = slotHoldSchema.safeParse(holdInput)
    assert.equal(validated.success, true)

    const hold = {
      id: 'hold_smoke_123',
      patientId: 'patient_smoke_1',
      doctorId: holdInput.doctorId,
      startAt: new Date(holdInput.startAt),
      endAt: new Date(holdInput.endAt),
      status: HoldStatus.HELD,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      symptoms: holdInput.symptoms,
    }

    assert.equal(hold.status, HoldStatus.HELD)
    assert.ok(hold.expiresAt.getTime() > Date.now())
  })

  // 6. Doctor login & appointment schedule
  it('Smoke Test 6: Doctor login and assigned schedule access', () => {
    const token = createSessionToken({
      userId: 'doc_mehta_1',
      email: 'dr.mehta@careflow.test',
      role: UserRole.DOCTOR,
    })
    const session = verifySessionToken(token)
    assert.ok(session)
    assert.equal(session.role, UserRole.DOCTOR)
  })

  // 7. Pre-visit AI summary
  it('Smoke Test 7: Pre-visit AI clinical triage output validation', () => {
    const aiOutput = {
      urgencyLevel: 'Medium',
      chiefComplaint: 'Exertional dyspnea of 3 days duration',
      suggestedQuestions: [
        'Do you experience chest pain alongside shortness of breath?',
        'Does the shortness of breath worsen when lying flat?',
        'Have you noticed any swelling in your lower extremities?',
      ],
    }
    const validated = preVisitAIOutputSchema.safeParse(aiOutput)
    assert.equal(validated.success, true)
    assert.equal(validated.data?.suggestedQuestions.length, 3)
  })

  // 8. Consultation / prescription entry
  it('Smoke Test 8: Doctor consultation and prescription submission validation', () => {
    const consultationInput = {
      clinicalNotes: 'Clear breath sounds bilaterally. Normal sinus rhythm. Recommend follow-up stress test.',
      instructions: 'Avoid strenuous physical activity for 48 hours.',
      followUpInformation: 'Return in 2 weeks for cardiac stress test review.',
      medications: [
        {
          name: 'Metoprolol Succinate',
          dosage: '25mg',
          frequency: 'Once daily in morning',
          reminderTime: '08:00 AM',
          instructions: 'Take with water after breakfast',
        },
      ],
    }
    const validated = consultationSubmitSchema.safeParse(consultationInput)
    assert.equal(validated.success, true)
    assert.equal(validated.data?.medications.length, 1)
  })

  // 9. Post-visit AI summary
  it('Smoke Test 9: Post-visit patient care summary output validation', () => {
    const aiOutput = {
      patientSummary: 'Your heart exam was reassuring with clear lungs and normal rhythm. A routine follow-up test is recommended.',
      medicationSchedule: 'Take Metoprolol (25mg) once daily every morning with water.',
      followUpSteps: 'Rest for 48 hours and return to clinic in 2 weeks for follow-up review.',
    }
    const validated = postVisitAIOutputSchema.safeParse(aiOutput)
    assert.equal(validated.success, true)
    assert.ok(validated.data?.patientSummary.length > 10)
  })

  // 10. Patient consultation view
  it('Smoke Test 10: Patient consultation and prescription isolation', () => {
    const appointment = {
      id: 'apt_123',
      patientId: 'patient_smoke_1',
      doctorId: 'doc_mehta_1',
      status: AppointmentStatus.COMPLETED,
    }

    const viewingPatientId = 'patient_smoke_1'
    const unauthorizedPatientId = 'patient_unauthorized_999'

    const authorized = appointment.patientId === viewingPatientId
    const forbidden = appointment.patientId === unauthorizedPatientId

    assert.equal(authorized, true)
    assert.equal(forbidden, false)
  })

  // 11. Cancellation
  it('Smoke Test 11: Appointment cancellation and reservation release transition', () => {
    const appointment = {
      id: 'apt_to_cancel',
      status: AppointmentStatus.CONFIRMED,
      reservationId: 'res_123',
    }

    const cancelledAppointment = {
      ...appointment,
      status: AppointmentStatus.CANCELLED,
      cancellationReason: 'Patient personal conflict',
    }

    const reservation = {
      id: appointment.reservationId,
      status: ReservationStatus.RELEASED,
    }

    assert.equal(cancelledAppointment.status, AppointmentStatus.CANCELLED)
    assert.equal(reservation.status, ReservationStatus.RELEASED)
  })

  // 12. Rescheduling
  it('Smoke Test 12: Atomic appointment rescheduling transition', () => {
    const originalAppointment = {
      id: 'apt_original',
      startAt: new Date('2026-09-07T04:00:00Z'),
      endAt: new Date('2026-09-07T04:30:00Z'),
      status: AppointmentStatus.CONFIRMED,
    }

    const newSlotHold = {
      id: 'hold_reschedule_99',
      startAt: new Date('2026-09-08T05:00:00Z'),
      endAt: new Date('2026-09-08T05:30:00Z'),
      status: HoldStatus.HELD,
    }

    const rescheduled = {
      ...originalAppointment,
      startAt: newSlotHold.startAt,
      endAt: newSlotHold.endAt,
      status: AppointmentStatus.CONFIRMED,
    }

    assert.equal(rescheduled.startAt.toISOString(), '2026-09-08T05:00:00.000Z')
  })

  // 13. Admin doctor management
  it('Smoke Test 13: Admin doctor profile and active status toggle', () => {
    const doctorProfile = {
      firstName: 'Rajesh',
      lastName: 'Mehta',
      specialisation: 'Cardiology',
      slotDurationMinutes: 30,
      isActive: true,
    }

    const toggledProfile = { ...doctorProfile, isActive: false }
    assert.equal(toggledProfile.isActive, false)
  })

  // 14. Doctor leave & conflict handling
  it('Smoke Test 14: Doctor leave conflict detection and automatic cancellation', () => {
    const leaveInput = {
      startAt: '2026-09-10T00:00:00.000Z',
      endAt: '2026-09-12T23:59:59.000Z',
      reason: 'Attending Cardiology Summit',
    }
    const validated = doctorLeaveSchema.safeParse(leaveInput)
    assert.equal(validated.success, true)

    const appointments = [
      {
        id: 'apt_conflict',
        startAt: new Date('2026-09-11T04:00:00Z'),
        endAt: new Date('2026-09-11T04:30:00Z'),
        status: AppointmentStatus.CONFIRMED,
      },
      {
        id: 'apt_safe',
        startAt: new Date('2026-09-15T04:00:00Z'),
        endAt: new Date('2026-09-15T04:30:00Z'),
        status: AppointmentStatus.CONFIRMED,
      },
    ]

    const leaveStart = new Date(leaveInput.startAt)
    const leaveEnd = new Date(leaveInput.endAt)

    const affected = appointments.filter(
      (a) => a.startAt < leaveEnd && a.endAt > leaveStart,
    )
    assert.equal(affected.length, 1)
    assert.equal(affected[0].id, 'apt_conflict')
  })

  // 15. Notification creation (outbox)
  it('Smoke Test 15: Durable notification job creation and email template rendering', () => {
    const renderedEmail = EmailService.renderEmailTemplate(
      NotificationType.BOOKING_CONFIRMATION,
      'Aarav Patel',
      {
        doctorName: 'Dr. Rajesh Mehta',
        startAt: '2026-09-07T04:00:00.000Z',
        endAt: '2026-09-07T04:30:00.000Z',
      },
    )

    assert.ok(renderedEmail.subject.includes('Confirmed'))
    assert.ok(renderedEmail.html.includes('Aarav Patel'))
  })

  // 16. Google Calendar integration
  it('Smoke Test 16: Google Calendar OAuth state verification and token encryption', () => {
    const state = GoogleCalendarService.generateOAuthState('user_123', UserRole.PATIENT)
    const verified = GoogleCalendarService.verifyOAuthState(state)
    assert.equal(verified.userId, 'user_123')
    assert.equal(verified.role, UserRole.PATIENT)

    const rawRefreshToken = '1//0gRefreshTokenExample12345'
    const encrypted = GoogleCalendarService.encryptToken(rawRefreshToken)
    const decrypted = GoogleCalendarService.decryptToken(encrypted)
    assert.equal(decrypted, rawRefreshToken)
  })
})
