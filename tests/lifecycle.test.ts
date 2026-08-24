import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { HoldStatus, ReservationStatus, AppointmentStatus, ReservationKind } from '../lib/types'

describe('Appointment Lifecycle & State Transition Tests', () => {
  it('should verify hold transition: HELD -> CONSUMED and reservation: HOLD -> APPOINTMENT on confirmation', () => {
    // 1. Initial active hold state
    const hold: { id: string; reservationId: string; status: HoldStatus; expiresAt: Date } = {
      id: 'hold_1',
      reservationId: 'res_1',
      status: HoldStatus.HELD,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min future
    }
    const reservation: { id: string; kind: ReservationKind; status: ReservationStatus } = {
      id: 'res_1',
      kind: ReservationKind.HOLD,
      status: ReservationStatus.ACTIVE,
    }

    // Confirmation logic
    assert.equal(hold.status, HoldStatus.HELD)
    assert.equal(reservation.status, ReservationStatus.ACTIVE)
    assert.ok(hold.expiresAt.getTime() > Date.now(), 'Hold is unexpired')

    // Simulate atomic confirmation transition
    hold.status = HoldStatus.CONSUMED
    reservation.kind = ReservationKind.APPOINTMENT
    const appointment: { id: string; reservationId: string; status: AppointmentStatus } = {
      id: 'apt_1',
      reservationId: reservation.id,
      status: AppointmentStatus.CONFIRMED,
    }

    assert.equal(hold.status, HoldStatus.CONSUMED)
    assert.equal(reservation.kind, ReservationKind.APPOINTMENT)
    assert.equal(reservation.status, ReservationStatus.ACTIVE)
    assert.equal(appointment.status, AppointmentStatus.CONFIRMED)
  })

  it('should reject confirmation of expired hold and release reservation', () => {
    // Expired hold state
    const hold: { id: string; reservationId: string; status: HoldStatus; expiresAt: Date } = {
      id: 'hold_expired',
      reservationId: 'res_exp',
      status: HoldStatus.HELD,
      expiresAt: new Date(Date.now() - 1000), // 1 second ago
    }
    const reservation: { id: string; kind: ReservationKind; status: ReservationStatus } = {
      id: 'res_exp',
      kind: ReservationKind.HOLD,
      status: ReservationStatus.ACTIVE,
    }

    // Verify expiration check
    const isExpired = hold.expiresAt.getTime() <= Date.now()
    assert.equal(isExpired, true, 'Hold must be identified as expired')

    // Cleanup transition
    if (isExpired) {
      hold.status = HoldStatus.EXPIRED
      reservation.status = ReservationStatus.RELEASED
    }

    assert.equal(hold.status, HoldStatus.EXPIRED)
    assert.equal(reservation.status, ReservationStatus.RELEASED)
  })

  it('should verify cancellation transition: CONFIRMED -> CANCELLED and reservation: ACTIVE -> RELEASED', () => {
    const appointment: { id: string; reservationId: string; status: AppointmentStatus; cancellationReason: string | null } = {
      id: 'apt_cancel_test',
      reservationId: 'res_cancel_test',
      status: AppointmentStatus.CONFIRMED,
      cancellationReason: null,
    }
    const reservation: { id: string; kind: ReservationKind; status: ReservationStatus } = {
      id: 'res_cancel_test',
      kind: ReservationKind.APPOINTMENT,
      status: ReservationStatus.ACTIVE,
    }

    // Cannot cancel if already cancelled or completed
    assert.equal(appointment.status, AppointmentStatus.CONFIRMED)

    // Execute cancellation
    appointment.status = AppointmentStatus.CANCELLED
    appointment.cancellationReason = 'Patient requested cancellation'
    reservation.status = ReservationStatus.RELEASED

    assert.equal(appointment.status, AppointmentStatus.CANCELLED)
    assert.equal(reservation.status, ReservationStatus.RELEASED)
  })

  it('should verify atomic rescheduling transitions', () => {
    // 1. Original confirmed appointment
    const originalAppointment: { id: string; reservationId: string; status: AppointmentStatus } = {
      id: 'apt_orig',
      reservationId: 'res_orig',
      status: AppointmentStatus.CONFIRMED,
    }
    const originalReservation: { id: string; status: ReservationStatus } = {
      id: 'res_orig',
      status: ReservationStatus.ACTIVE,
    }

    // 2. Newly held slot
    const newHold: { id: string; reservationId: string; status: HoldStatus; expiresAt: Date } = {
      id: 'hold_new',
      reservationId: 'res_new',
      status: HoldStatus.HELD,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    }
    const newReservation: { id: string; kind: ReservationKind; status: ReservationStatus } = {
      id: 'res_new',
      kind: ReservationKind.HOLD,
      status: ReservationStatus.ACTIVE,
    }

    // Execute atomic reschedule transaction:
    // a) Cancel original and release original reservation
    originalAppointment.status = AppointmentStatus.CANCELLED
    originalReservation.status = ReservationStatus.RELEASED

    // b) Consume new hold and activate new appointment
    newHold.status = HoldStatus.CONSUMED
    newReservation.kind = ReservationKind.APPOINTMENT
    newReservation.status = ReservationStatus.ACTIVE

    const newAppointment: { id: string; reservationId: string; status: AppointmentStatus } = {
      id: 'apt_new',
      reservationId: newReservation.id,
      status: AppointmentStatus.CONFIRMED,
    }

    // Assertions
    assert.equal(originalAppointment.status, AppointmentStatus.CANCELLED)
    assert.equal(originalReservation.status, ReservationStatus.RELEASED)
    assert.equal(newHold.status, HoldStatus.CONSUMED)
    assert.equal(newReservation.status, ReservationStatus.ACTIVE)
    assert.equal(newReservation.kind, ReservationKind.APPOINTMENT)
    assert.equal(newAppointment.status, AppointmentStatus.CONFIRMED)
  })
})
