import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { slotHoldSchema, rescheduleAppointmentSchema } from '../lib/validations'

describe('Appointment Booking, Hold & Reschedule Validation Tests', () => {
  it('should validate valid slot hold input', () => {
    const valid = {
      doctorId: 'doc_123',
      startAt: '2026-09-01T09:00:00.000Z',
      endAt: '2026-09-01T09:30:00.000Z',
      symptoms: 'Mild fever and dry cough for 2 days',
    }

    const result = slotHoldSchema.safeParse(valid)
    assert.equal(result.success, true)
  })

  it('should reject slot hold with empty symptoms', () => {
    const invalid = {
      doctorId: 'doc_123',
      startAt: '2026-09-01T09:00:00.000Z',
      endAt: '2026-09-01T09:30:00.000Z',
      symptoms: '  ',
    }

    const result = slotHoldSchema.safeParse(invalid)
    assert.equal(result.success, false, 'Empty symptoms must fail validation')
  })

  it('should reject slot hold with invalid time order (startAt >= endAt)', () => {
    const invalid = {
      doctorId: 'doc_123',
      startAt: '2026-09-01T10:00:00.000Z',
      endAt: '2026-09-01T09:30:00.000Z',
      symptoms: 'Headache',
    }

    const result = slotHoldSchema.safeParse(invalid)
    assert.equal(result.success, false, 'startAt after endAt must be rejected')
  })

  it('should validate reschedule schema requiring newHoldId', () => {
    const valid = { newHoldId: 'hold_new_456' }
    const result = rescheduleAppointmentSchema.safeParse(valid)
    assert.equal(result.success, true)

    const invalid = { newHoldId: '' }
    const resInvalid = rescheduleAppointmentSchema.safeParse(invalid)
    assert.equal(resInvalid.success, false)
  })
})
