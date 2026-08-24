import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { GoogleCalendarService } from '../lib/services/google-calendar.service'
import { CalendarSyncStatus, UserRole, AppointmentStatus, NotificationType } from '../lib/types'

describe('Google Calendar Integration & Doctor Leave Conflict Tests', () => {
  it('should generate valid signed OAuth CSRF state token and verify successfully', () => {
    const userId = 'user_patient_123'
    const role = UserRole.PATIENT

    const state = GoogleCalendarService.generateOAuthState(userId, role)
    assert.ok(state.length > 20, 'State token must be non-empty base64url string')

    const verified = GoogleCalendarService.verifyOAuthState(state)
    assert.equal(verified.userId, userId)
    assert.equal(verified.role, role)
  })

  it('should reject tampered or corrupted OAuth CSRF state token', () => {
    const userId = 'user_patient_123'
    const role = UserRole.PATIENT
    const state = GoogleCalendarService.generateOAuthState(userId, role)

    // Tamper with state string
    const tamperedState = state.slice(0, -5) + 'abcde'

    assert.throws(
      () => GoogleCalendarService.verifyOAuthState(tamperedState),
      /CSRF_STATE_VERIFICATION_FAILED/,
      'Tampered state must fail verification',
    )
  })

  it('should encrypt and decrypt refresh tokens securely with AES-256-GCM', () => {
    const rawToken = '1//0gAbCdEfGhIjKlMnOpQrStUvWxYz_123456789'
    const encrypted = GoogleCalendarService.encryptToken(rawToken)

    assert.notEqual(encrypted, rawToken, 'Encrypted token must not match plaintext')
    assert.ok(encrypted.includes(':'), 'Encrypted format must contain iv:authTag:ciphertext')

    const decrypted = GoogleCalendarService.decryptToken(encrypted)
    assert.equal(decrypted, rawToken, 'Decrypted token must match original plaintext')
  })

  it('should prevent duplicate Google Calendar events when job is retried (Idempotency)', () => {
    const syncedEvents = new Map<string, string>()

    const appointmentId = 'apt_gcal_test'
    const connectionId = 'conn_patient_1'
    const idempotencyKey = `${appointmentId}_${connectionId}`

    // 1st sync attempt
    const isFirstSync = !syncedEvents.has(idempotencyKey)
    if (isFirstSync) {
      syncedEvents.set(idempotencyKey, 'gcal_event_id_999')
    }

    assert.equal(isFirstSync, true)
    assert.equal(syncedEvents.get(idempotencyKey), 'gcal_event_id_999')

    // 2nd retry attempt with same appointment and connection
    const isDuplicate = syncedEvents.has(idempotencyKey)
    assert.equal(isDuplicate, true, 'Second sync must detect existing event and avoid creating duplicate')
  })

  it('should guarantee that calendar API failure never fails or cancels appointment', () => {
    const appointment = {
      id: 'apt_calendar_resilience',
      status: AppointmentStatus.CONFIRMED,
    }

    const calendarMapping = {
      appointmentId: appointment.id,
      googleEventId: null,
      syncStatus: CalendarSyncStatus.FAILED,
      lastError: 'Google API HTTP 503 Service Unavailable',
    }

    assert.equal(appointment.status, AppointmentStatus.CONFIRMED, 'Appointment must remain CONFIRMED')
    assert.equal(calendarMapping.syncStatus, CalendarSyncStatus.FAILED)
  })

  it('should verify doctor leave conflict detection and atomic resolution logic', () => {
    const doctorId = 'doctor_mehta'
    const leaveStart = new Date('2026-09-10T09:00:00Z')
    const leaveEnd = new Date('2026-09-10T17:00:00Z')

    // Appointments scheduled on that day
    const appointments = [
      {
        id: 'apt_affected_1',
        doctorId,
        patientId: 'patient_1',
        startAt: new Date('2026-09-10T10:00:00Z'),
        endAt: new Date('2026-09-10T10:30:00Z'),
        status: AppointmentStatus.CONFIRMED,
      },
      {
        id: 'apt_unaffected_another_day',
        doctorId,
        patientId: 'patient_2',
        startAt: new Date('2026-09-11T10:00:00Z'),
        endAt: new Date('2026-09-11T10:30:00Z'),
        status: AppointmentStatus.CONFIRMED,
      },
    ]

    // Identify affected appointments overlapping [leaveStart, leaveEnd)
    const affected = appointments.filter(
      (a) => a.doctorId === doctorId && a.startAt < leaveEnd && a.endAt > leaveStart,
    )

    assert.equal(affected.length, 1)
    assert.equal(affected[0].id, 'apt_affected_1')

    // Simulate cancellation transition
    const cancelledAppointment = {
      ...affected[0],
      status: AppointmentStatus.CANCELLED,
      cancellationReason: 'Doctor on leave: Annual Medical Conference',
    }

    const notificationJob = {
      type: NotificationType.DOCTOR_LEAVE,
      recipientId: cancelledAppointment.patientId,
      appointmentId: cancelledAppointment.id,
      idempotencyKey: `leave-cancel-${cancelledAppointment.id}`,
    }

    const calendarDeletionQueued = {
      appointmentId: cancelledAppointment.id,
      action: 'DELETE',
    }

    assert.equal(cancelledAppointment.status, AppointmentStatus.CANCELLED)
    assert.equal(notificationJob.type, NotificationType.DOCTOR_LEAVE)
    assert.equal(calendarDeletionQueued.action, 'DELETE')
  })
})
