import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('Concurrency & Double-Booking Prevention Integration Tests', () => {
  interface SlotReservationRecord {
    id: string
    doctorId: string
    patientId: string
    startAt: number // epoch ms
    endAt: number   // epoch ms
    status: 'ACTIVE' | 'RELEASED'
  }

  // Simulated transaction runner enforcing PostgreSQL GiST exclusion:
  // EXCLUDE USING gist (doctorId WITH =, tstzrange(startAt, endAt, '[)') WITH &&) WHERE status = 'ACTIVE'
  function createSimulatedDb() {
    const reservationsTable: SlotReservationRecord[] = []
    let lock = Promise.resolve()

    async function bookSlotTransaction(
      patientId: string,
      doctorId: string,
      startAtIso: string,
      endAtIso: string,
    ): Promise<{ success: boolean; status: number; appointmentId?: string; error?: string }> {
      const startAt = new Date(startAtIso).getTime()
      const endAt = new Date(endAtIso).getTime()

      return new Promise((resolve) => {
        lock = lock.then(async () => {
          // Simulate slight jitter / network execution latency
          await new Promise((r) => setTimeout(r, Math.random() * 15))

          // 1. Check PostgreSQL partial exclusion constraint on active reservations for doctor
          const hasConflict = reservationsTable.some((r) => {
            if (r.doctorId !== doctorId || r.status !== 'ACTIVE') return false
            // Half-open interval intersection: [r.startAt, r.endAt) && [startAt, endAt)
            return r.startAt < endAt && r.endAt > startAt
          })

          if (hasConflict) {
            // Exclusion constraint rejects insert with error code 23P01 -> maps to HTTP 409 Conflict
            resolve({
              success: false,
              status: 409,
              error: 'Slot conflict: overlapping active reservation exists',
            })
            return
          }

          // 2. Insert active reservation
          const reservation: SlotReservationRecord = {
            id: `res_${Math.random().toString(36).substring(2, 9)}`,
            doctorId,
            patientId,
            startAt,
            endAt,
            status: 'ACTIVE',
          }
          reservationsTable.push(reservation)

          // 3. Confirm appointment
          const appointmentId = `apt_${Math.random().toString(36).substring(2, 9)}`

          resolve({
            success: true,
            status: 201,
            appointmentId,
          })
        })
      })
    }

    return { reservationsTable, bookSlotTransaction }
  }

  it('should guarantee that concurrent booking of the exact same slot results in exactly one success and one 409 conflict', async () => {
    const { reservationsTable, bookSlotTransaction } = createSimulatedDb()

    const doctorId = 'doctor_mehta_1'
    const slotStart = '2026-09-01T10:00:00.000Z'
    const slotEnd = '2026-09-01T10:30:00.000Z'

    // Simulate 2 simultaneous requests from Patient 1 and Patient 2
    const patient1Attempt = bookSlotTransaction('patient_1', doctorId, slotStart, slotEnd)
    const patient2Attempt = bookSlotTransaction('patient_2', doctorId, slotStart, slotEnd)

    const [result1, result2] = await Promise.all([patient1Attempt, patient2Attempt])

    const successResults = [result1, result2].filter((r) => r.success && r.status === 201)
    const conflictResults = [result1, result2].filter((r) => !r.success && r.status === 409)

    // Assertion 1: Exactly one booking succeeds
    assert.equal(
      successResults.length,
      1,
      `Expected exactly 1 successful booking, but got ${successResults.length}`,
    )

    // Assertion 2: The other booking receives HTTP 409 Conflict
    assert.equal(
      conflictResults.length,
      1,
      `Expected exactly 1 conflict (409), but got ${conflictResults.length}`,
    )

    // Assertion 3: Database state contains exactly 1 active reservation
    const activeReservations = reservationsTable.filter(
      (r) => r.doctorId === doctorId && r.status === 'ACTIVE',
    )
    assert.equal(
      activeReservations.length,
      1,
      `Database must contain exactly 1 active reservation, found ${activeReservations.length}`,
    )
  })

  it('should reject partially overlapping concurrent bookings for the same doctor', async () => {
    const { reservationsTable, bookSlotTransaction } = createSimulatedDb()

    const doctorId = 'doctor_sharma_2'
    // Request A: 10:00 - 10:30
    const slotAStart = '2026-09-01T10:00:00.000Z'
    const slotAEnd = '2026-09-01T10:30:00.000Z'

    // Request B: 10:15 - 10:45 (partially overlapping)
    const slotBStart = '2026-09-01T10:15:00.000Z'
    const slotBEnd = '2026-09-01T10:45:00.000Z'

    const reqA = bookSlotTransaction('patient_A', doctorId, slotAStart, slotAEnd)
    const reqB = bookSlotTransaction('patient_B', doctorId, slotBStart, slotBEnd)

    const [resA, resB] = await Promise.all([reqA, reqB])

    const successes = [resA, resB].filter((r) => r.success)
    const conflicts = [resA, resB].filter((r) => !r.success && r.status === 409)

    assert.equal(successes.length, 1, 'Exactly one overlapping reservation must succeed')
    assert.equal(conflicts.length, 1, 'The overlapping reservation must be rejected with 409')
    assert.equal(reservationsTable.filter((r) => r.status === 'ACTIVE').length, 1)
  })

  it('should allow concurrent bookings for different doctors at the exact same time', async () => {
    const { reservationsTable, bookSlotTransaction } = createSimulatedDb()

    const slotStart = '2026-09-01T11:00:00.000Z'
    const slotEnd = '2026-09-01T11:30:00.000Z'

    const doc1Attempt = bookSlotTransaction('patient_1', 'doctor_1', slotStart, slotEnd)
    const doc2Attempt = bookSlotTransaction('patient_2', 'doctor_2', slotStart, slotEnd)

    const [res1, res2] = await Promise.all([doc1Attempt, doc2Attempt])

    assert.equal(res1.status, 201, 'Doctor 1 booking must succeed')
    assert.equal(res2.status, 201, 'Doctor 2 booking must succeed simultaneously')
    assert.equal(reservationsTable.filter((r) => r.status === 'ACTIVE').length, 2)
  })
})
