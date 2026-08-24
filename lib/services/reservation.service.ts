import { prisma } from '../prisma'
import { HoldStatus, ReservationKind, ReservationStatus, UserRole } from '../types'
import { SlotHoldInput } from '../validations'

const SLOT_HOLD_MINUTES = parseInt(process.env.SLOT_HOLD_MINUTES || '5', 10)

export class ReservationService {
  /**
   * Safely creates a short-lived hold on a slot with symptoms.
   * If a concurrent active reservation exists, PostgreSQL exclusion constraint or check will reject it.
   */
  static async createHold(patientId: string, data: SlotHoldInput) {
    const startAt = new Date(data.startAt)
    const endAt = new Date(data.endAt)
    const now = new Date()

    if (startAt.getTime() <= now.getTime()) {
      throw new Error('SLOT_IN_PAST')
    }

    // 1. Verify doctor exists and is active
    const doctor = await prisma.user.findUnique({
      where: { id: data.doctorId },
      include: {
        doctorProfile: {
          include: {
            workingHours: true,
          },
        },
      },
    })

    if (!doctor || doctor.role !== UserRole.DOCTOR || !doctor.doctorProfile?.isActive) {
      throw new Error('DOCTOR_UNAVAILABLE')
    }

    // 2. Compute hold expiration
    const holdDurationMs = SLOT_HOLD_MINUTES * 60 * 1000
    const expiresAt = new Date(now.getTime() + holdDurationMs)

    // 3. Database transaction to create SlotReservation, AppointmentHold, and SymptomSubmission
    try {
      return await prisma.$transaction(async (tx) => {
        // Lazily clean up any expired active holds for this doctor/slot
        const expiredActiveHolds = await tx.appointmentHold.findMany({
          where: {
            doctorId: data.doctorId,
            status: HoldStatus.HELD,
            expiresAt: { lte: now },
            startAt: { lt: endAt },
            endAt: { gt: startAt },
          },
        })

        for (const expiredHold of expiredActiveHolds) {
          await tx.appointmentHold.update({
            where: { id: expiredHold.id },
            data: { status: HoldStatus.EXPIRED },
          })
          await tx.slotReservation.update({
            where: { id: expiredHold.reservationId },
            data: { status: ReservationStatus.RELEASED },
          })
        }

        // Check if there are any blocking leaves
        const overlappingLeaves = await tx.doctorLeave.findMany({
          where: {
            doctorId: doctor.doctorProfile!.id,
            startAt: { lt: endAt },
            endAt: { gt: startAt },
          },
        })

        if (overlappingLeaves.length > 0) {
          throw new Error('DOCTOR_ON_LEAVE')
        }

        // Create SlotReservation (Protected by PostgreSQL partial exclusion constraint)
        const reservation = await tx.slotReservation.create({
          data: {
            doctorId: data.doctorId,
            patientId,
            startAt,
            endAt,
            kind: ReservationKind.HOLD,
            status: ReservationStatus.ACTIVE,
          },
        })

        // Create AppointmentHold
        const hold = await tx.appointmentHold.create({
          data: {
            reservationId: reservation.id,
            doctorId: data.doctorId,
            patientId,
            startAt,
            endAt,
            expiresAt,
            status: HoldStatus.HELD,
          },
        })

        // Create SymptomSubmission
        const symptoms = await tx.symptomSubmission.create({
          data: {
            patientId,
            holdId: hold.id,
            symptoms: data.symptoms.trim(),
          },
        })

        return {
          hold: {
            ...hold,
            reservation,
            symptomSubmission: symptoms,
          },
        }
      })
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string }
      // Check for PostgreSQL exclusion constraint violation (Postgres error code 23P01 or Prisma raw / exclusion code)
      if (
        err.code === 'P2010' ||
        err.code === 'P2002' ||
        (err.message && (err.message.includes('exclusion') || err.message.includes('SlotReservation_active_doctor_time_excl')))
      ) {
        throw new Error('SLOT_CONFLICT')
      }
      throw error
    }
  }

  /**
   * Retrieves hold by ID and checks expiry
   */
  static async getHold(holdId: string) {
    const hold = await prisma.appointmentHold.findUnique({
      where: { id: holdId },
      include: {
        reservation: true,
        symptomSubmission: true,
        doctor: {
          include: {
            doctorProfile: true,
          },
        },
      },
    })

    if (!hold) {
      throw new Error('HOLD_NOT_FOUND')
    }

    // Check if expired
    if (hold.status === HoldStatus.HELD && hold.expiresAt.getTime() <= Date.now()) {
      // Mark expired
      await prisma.$transaction(async (tx) => {
        await tx.appointmentHold.update({
          where: { id: hold.id },
          data: { status: HoldStatus.EXPIRED },
        })
        await tx.slotReservation.update({
          where: { id: hold.reservationId },
          data: { status: ReservationStatus.RELEASED },
        })
      })
      hold.status = HoldStatus.EXPIRED
    }

    return hold
  }

  /**
   * Releases an active hold
   */
  static async releaseHold(holdId: string, patientId: string) {
    const hold = await prisma.appointmentHold.findUnique({
      where: { id: holdId },
    })

    if (!hold) {
      throw new Error('HOLD_NOT_FOUND')
    }

    if (hold.patientId !== patientId) {
      throw new Error('FORBIDDEN')
    }

    if (hold.status !== HoldStatus.HELD) {
      return hold
    }

    return prisma.$transaction(async (tx) => {
      const updatedHold = await tx.appointmentHold.update({
        where: { id: holdId },
        data: { status: HoldStatus.RELEASED },
      })
      await tx.slotReservation.update({
        where: { id: hold.reservationId },
        data: { status: ReservationStatus.RELEASED },
      })
      return updatedHold
    })
  }
}
