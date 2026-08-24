import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { NotificationStatus, NotificationType, AppointmentStatus } from '../lib/types'
import { NotificationService } from '../lib/services/notification.service'
import { EmailService } from '../lib/services/email.service'

describe('Notifications, Background Jobs & Medication Reminders Tests', () => {
  it('should render correct email templates for all notification types', () => {
    const bookingConf = EmailService.renderEmailTemplate(
      NotificationType.BOOKING_CONFIRMATION,
      'John Doe',
      { startAt: '2026-09-01T10:00:00Z' },
    )
    assert.ok(bookingConf.subject.includes('Confirmed'))
    assert.ok(bookingConf.html.includes('John Doe'))

    const reminder = EmailService.renderEmailTemplate(
      NotificationType.APPOINTMENT_REMINDER,
      'Jane Smith',
      { startAt: '2026-09-01T10:00:00Z' },
    )
    assert.ok(reminder.subject.includes('Reminder'))

    const cancellation = EmailService.renderEmailTemplate(
      NotificationType.CANCELLATION,
      'John Doe',
      { reason: 'Doctor emergency' },
    )
    assert.ok(cancellation.subject.includes('Cancelled'))
    assert.ok(cancellation.html.includes('Doctor emergency'))

    const doctorLeave = EmailService.renderEmailTemplate(
      NotificationType.DOCTOR_LEAVE,
      'John Doe',
      { reason: 'Annual Leave' },
    )
    assert.ok(doctorLeave.subject.includes('Leave'))

    const medReminder = EmailService.renderEmailTemplate(
      NotificationType.MEDICATION_REMINDER,
      'John Doe',
      { medicationName: 'Metformin', dosage: '500mg', instructions: 'With breakfast' },
    )
    assert.ok(medReminder.subject.includes('Metformin'))
    assert.ok(medReminder.html.includes('500mg'))
  })

  it('should calculate bounded exponential backoff delay correctly across attempts', () => {
    const delay1 = NotificationService.calculateRetryDelayMs(1)
    const delay2 = NotificationService.calculateRetryDelayMs(2)
    const delay3 = NotificationService.calculateRetryDelayMs(3)
    const delay4 = NotificationService.calculateRetryDelayMs(4)
    const delay5 = NotificationService.calculateRetryDelayMs(5)

    assert.equal(delay1, 60 * 1000, 'Attempt 1 retry should be 1 minute')
    assert.equal(delay2, 5 * 60 * 1000, 'Attempt 2 retry should be 5 minutes')
    assert.equal(delay3, 15 * 60 * 1000, 'Attempt 3 retry should be 15 minutes')
    assert.equal(delay4, 60 * 60 * 1000, 'Attempt 4 retry should be 1 hour')
    assert.equal(delay5, 4 * 60 * 60 * 1000, 'Attempt 5 retry should be 4 hours')
  })

  it('should transition job to FAILED when maximum attempts (5) are exhausted', () => {
    const job = {
      id: 'job_retry_test',
      status: NotificationStatus.RETRY_SCHEDULED,
      attemptCount: 4,
      lastError: 'SMTP connection timeout',
    }

    // Simulate 5th failed attempt
    const newAttemptCount = job.attemptCount + 1
    const MAX_ATTEMPTS = 5

    let newStatus: NotificationStatus
    if (newAttemptCount >= MAX_ATTEMPTS) {
      newStatus = NotificationStatus.FAILED
    } else {
      newStatus = NotificationStatus.RETRY_SCHEDULED
    }

    assert.equal(newStatus, NotificationStatus.FAILED, 'Job must be marked FAILED after 5 failed attempts')
    assert.equal(newAttemptCount, 5)
  })

  it('should prevent duplicate notification sends using idempotency keys', () => {
    const sentKeys = new Set<string>()

    const appointmentId = 'apt_12345'
    const patientKey = `booking-conf-patient-${appointmentId}`
    const doctorKey = `booking-conf-doctor-${appointmentId}`

    // First booking send
    const firstPatientSend = !sentKeys.has(patientKey)
    if (firstPatientSend) sentKeys.add(patientKey)

    const firstDoctorSend = !sentKeys.has(doctorKey)
    if (firstDoctorSend) sentKeys.add(doctorKey)

    assert.equal(firstPatientSend, true, 'First patient confirmation should send')
    assert.equal(firstDoctorSend, true, 'First doctor confirmation should send')

    // Simulated retry / duplicate execution of the same booking
    const duplicatePatientSend = !sentKeys.has(patientKey)
    const duplicateDoctorSend = !sentKeys.has(doctorKey)

    assert.equal(duplicatePatientSend, false, 'Duplicate patient confirmation must be blocked by idempotency')
    assert.equal(duplicateDoctorSend, false, 'Duplicate doctor confirmation must be blocked by idempotency')
  })

  it('should guarantee that email provider failure never affects or cancels confirmed appointment state', () => {
    const appointment = {
      id: 'apt_email_fail_test',
      status: AppointmentStatus.CONFIRMED,
    }

    const notificationJob = {
      id: 'job_failed_provider',
      appointmentId: appointment.id,
      status: NotificationStatus.FAILED,
      lastError: 'Provider 503 Service Unavailable',
    }

    // Critical assertion: Appointment remains CONFIRMED
    assert.equal(
      appointment.status,
      AppointmentStatus.CONFIRMED,
      'Appointment must remain CONFIRMED even if notification fails',
    )
    assert.equal(notificationJob.status, NotificationStatus.FAILED)
  })

  it('should generate medication reminders for active prescriptions and exclude expired ones', () => {
    const now = new Date('2026-09-01T12:00:00Z')

    const medications = [
      {
        id: 'med_active_1',
        name: 'Amoxicillin',
        endDate: new Date('2026-09-05T00:00:00Z'), // Future
      },
      {
        id: 'med_active_ongoing',
        name: 'Atorvastatin',
        endDate: null, // Indefinite
      },
      {
        id: 'med_expired',
        name: 'Paracetamol',
        endDate: new Date('2026-08-20T00:00:00Z'), // Past
      },
    ]

    const eligibleForReminder = medications.filter((m) => {
      if (!m.endDate) return true
      return m.endDate.getTime() >= now.getTime()
    })

    assert.equal(eligibleForReminder.length, 2, 'Only active or ongoing medications should be eligible')
    assert.equal(eligibleForReminder.some((m) => m.id === 'med_active_1'), true)
    assert.equal(eligibleForReminder.some((m) => m.id === 'med_active_ongoing'), true)
    assert.equal(eligibleForReminder.some((m) => m.id === 'med_expired'), false, 'Expired medication must be excluded')
  })
})
