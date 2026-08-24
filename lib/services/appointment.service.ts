import { prisma } from '../prisma'
import { AppointmentStatus, HoldStatus, NotificationType, ReservationKind, ReservationStatus, UserRole } from '../types'
import { AIService } from './ai.service'
import { GoogleCalendarService } from './google-calendar.service'

export class AppointmentService {
  /**
   * Confirms an active slot hold into a confirmed appointment.
   */
  static async confirmHold(holdId: string, patientId: string) {
    const hold = await prisma.appointmentHold.findUnique({
      where: { id: holdId },
      include: {
        reservation: true,
        symptomSubmission: true,
      },
    })

    if (!hold) {
      throw new Error('HOLD_NOT_FOUND')
    }

    if (hold.patientId !== patientId) {
      throw new Error('FORBIDDEN')
    }

    const now = new Date()
    if (hold.status !== HoldStatus.HELD || hold.expiresAt.getTime() <= now.getTime()) {
      // Mark hold as expired and release reservation
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
      throw new Error('HOLD_EXPIRED')
    }

    try {
      const confirmedAppointment = await prisma.$transaction(async (tx) => {
        // 1. Consume the hold
        await tx.appointmentHold.update({
          where: { id: hold.id },
          data: { status: HoldStatus.CONSUMED },
        })

        // 2. Transition the SlotReservation to APPOINTMENT
        await tx.slotReservation.update({
          where: { id: hold.reservationId },
          data: {
            kind: ReservationKind.APPOINTMENT,
            status: ReservationStatus.ACTIVE,
          },
        })

        // 3. Create the confirmed Appointment
        const appointment = await tx.appointment.create({
          data: {
            reservationId: hold.reservationId,
            patientId: hold.patientId,
            doctorId: hold.doctorId,
            startAt: hold.startAt,
            endAt: hold.endAt,
            status: AppointmentStatus.CONFIRMED,
          },
          include: {
            patient: {
              include: { patientProfile: true },
            },
            doctor: {
              include: { doctorProfile: true },
            },
            symptomSubmission: true,
          },
        })

        // 4. Link symptom submission to appointment
        if (hold.symptomSubmission) {
          await tx.symptomSubmission.update({
            where: { id: hold.symptomSubmission.id },
            data: { appointmentId: appointment.id },
          })
        }

        // 5. Create durable outbox notifications for both patient and doctor
        await tx.notificationJob.create({
          data: {
            type: NotificationType.BOOKING_CONFIRMATION,
            recipientId: appointment.patientId,
            appointmentId: appointment.id,
            idempotencyKey: `booking-conf-patient-${appointment.id}`,
            payload: {
              appointmentId: appointment.id,
              startAt: appointment.startAt.toISOString(),
              endAt: appointment.endAt.toISOString(),
              doctorId: appointment.doctorId,
            },
          },
        })

        await tx.notificationJob.create({
          data: {
            type: NotificationType.BOOKING_CONFIRMATION,
            recipientId: appointment.doctorId,
            appointmentId: appointment.id,
            idempotencyKey: `booking-conf-doctor-${appointment.id}`,
            payload: {
              appointmentId: appointment.id,
              startAt: appointment.startAt.toISOString(),
              endAt: appointment.endAt.toISOString(),
              patientId: appointment.patientId,
            },
          },
        })

        return appointment
      })

      if (hold.symptomSubmission?.symptoms) {
        AIService.generatePreVisitSummary(confirmedAppointment.id, hold.symptomSubmission.symptoms).catch((err) => {
          console.warn('[PreVisitAI] Background generation error on confirmation:', err)
        })
      }

      // Queue Google Calendar event creation for patient and doctor
      GoogleCalendarService.syncAppointmentCreated(confirmedAppointment.id, confirmedAppointment.patientId).catch((err) => {
        console.warn('[GoogleCalendar] Patient calendar sync error on confirm:', err)
      })
      GoogleCalendarService.syncAppointmentCreated(confirmedAppointment.id, confirmedAppointment.doctorId).catch((err) => {
        console.warn('[GoogleCalendar] Doctor calendar sync error on confirm:', err)
      })

      return confirmedAppointment
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string }
      if (
        err.code === 'P2010' ||
        err.code === 'P2002' ||
        (err.message && err.message.includes('SlotReservation_active_doctor_time_excl'))
      ) {
        throw new Error('SLOT_CONFLICT')
      }
      throw error
    }
  }

  /**
   * Cancels a confirmed appointment.
   */
  static async cancelAppointment(
    appointmentId: string,
    userId: string,
    userRole: UserRole,
    reason?: string,
  ) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        reservation: true,
        calendarEventMaps: true,
      },
    })

    if (!appointment) {
      throw new Error('APPOINTMENT_NOT_FOUND')
    }

    // Role and ownership check
    if (userRole === UserRole.PATIENT && appointment.patientId !== userId) {
      throw new Error('FORBIDDEN')
    }
    if (userRole === UserRole.DOCTOR && appointment.doctorId !== userId) {
      throw new Error('FORBIDDEN')
    }

    if (
      appointment.status === AppointmentStatus.CANCELLED ||
      appointment.status === AppointmentStatus.COMPLETED
    ) {
      throw new Error('CANNOT_CANCEL_STATUS')
    }

    const cancelledAppointment = await prisma.$transaction(async (tx) => {
      // 1. Update appointment status
      const updatedAppointment = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          status: AppointmentStatus.CANCELLED,
          cancellationReason: reason || 'Cancelled by user',
          cancelledAt: new Date(),
        },
      })

      // 2. Release slot reservation
      await tx.slotReservation.update({
        where: { id: appointment.reservationId },
        data: { status: ReservationStatus.RELEASED },
      })

      // 3. Mark calendar mappings for deletion if any
      for (const map of appointment.calendarEventMaps) {
        await tx.calendarEventMapping.update({
          where: { id: map.id },
          data: { syncStatus: 'DELETE_PENDING' },
        })
      }

      // 4. Create durable cancellation notification jobs
      await tx.notificationJob.create({
        data: {
          type: NotificationType.CANCELLATION,
          recipientId: appointment.patientId,
          appointmentId: appointment.id,
          idempotencyKey: `cancel-patient-${appointment.id}-${Date.now()}`,
          payload: {
            appointmentId: appointment.id,
            reason: reason || 'Cancelled by user',
          },
        },
      })

      await tx.notificationJob.create({
        data: {
          type: NotificationType.CANCELLATION,
          recipientId: appointment.doctorId,
          appointmentId: appointment.id,
          idempotencyKey: `cancel-doctor-${appointment.id}-${Date.now()}`,
          payload: {
            appointmentId: appointment.id,
            reason: reason || 'Cancelled by user',
          },
        },
      })

      return updatedAppointment
    })

    // Queue Google Calendar event deletion
    GoogleCalendarService.syncAppointmentCancelled(appointment.id, appointment.patientId).catch((err) => {
      console.warn('[GoogleCalendar] Patient cancellation calendar sync error:', err)
    })
    GoogleCalendarService.syncAppointmentCancelled(appointment.id, appointment.doctorId).catch((err) => {
      console.warn('[GoogleCalendar] Doctor cancellation calendar sync error:', err)
    })

    return cancelledAppointment
  }

  /**
   * Reschedules an appointment using a newly held slot in a single atomic transaction.
   */
  static async rescheduleAppointment(appointmentId: string, newHoldId: string, patientId: string) {
    const originalAppointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        reservation: true,
        symptomSubmission: true,
        calendarEventMaps: true,
      },
    })

    if (!originalAppointment) {
      throw new Error('APPOINTMENT_NOT_FOUND')
    }

    if (originalAppointment.patientId !== patientId) {
      throw new Error('FORBIDDEN')
    }

    if (
      originalAppointment.status === AppointmentStatus.CANCELLED ||
      originalAppointment.status === AppointmentStatus.COMPLETED
    ) {
      throw new Error('CANNOT_RESCHEDULE_STATUS')
    }

    const newHold = await prisma.appointmentHold.findUnique({
      where: { id: newHoldId },
      include: {
        reservation: true,
        symptomSubmission: true,
      },
    })

    if (!newHold) {
      throw new Error('HOLD_NOT_FOUND')
    }

    if (newHold.patientId !== patientId) {
      throw new Error('FORBIDDEN')
    }

    const now = new Date()
    if (newHold.status !== HoldStatus.HELD || newHold.expiresAt.getTime() <= now.getTime()) {
      throw new Error('HOLD_EXPIRED')
    }

    try {
      const rescheduledAppointment = await prisma.$transaction(async (tx) => {
        // 1. Cancel original appointment and release its reservation
        await tx.appointment.update({
          where: { id: originalAppointment.id },
          data: {
            status: AppointmentStatus.CANCELLED,
            cancellationReason: `Rescheduled to ${newHold.startAt.toISOString()}`,
            cancelledAt: now,
          },
        })

        await tx.slotReservation.update({
          where: { id: originalAppointment.reservationId },
          data: { status: ReservationStatus.RELEASED },
        })

        // 2. Consume new hold and activate new reservation
        await tx.appointmentHold.update({
          where: { id: newHold.id },
          data: { status: HoldStatus.CONSUMED },
        })

        await tx.slotReservation.update({
          where: { id: newHold.reservationId },
          data: {
            kind: ReservationKind.APPOINTMENT,
            status: ReservationStatus.ACTIVE,
          },
        })

        // 3. Create new confirmed appointment
        const newAppointment = await tx.appointment.create({
          data: {
            reservationId: newHold.reservationId,
            patientId,
            doctorId: newHold.doctorId,
            startAt: newHold.startAt,
            endAt: newHold.endAt,
            status: AppointmentStatus.CONFIRMED,
          },
          include: {
            patient: { include: { patientProfile: true } },
            doctor: { include: { doctorProfile: true } },
            symptomSubmission: true,
          },
        })

        // 4. Associate symptoms (use new hold's symptoms or fallback to original symptoms)
        if (newHold.symptomSubmission) {
          await tx.symptomSubmission.update({
            where: { id: newHold.symptomSubmission.id },
            data: { appointmentId: newAppointment.id },
          })
        } else if (originalAppointment.symptomSubmission) {
          await tx.symptomSubmission.create({
            data: {
              patientId,
              appointmentId: newAppointment.id,
              symptoms: originalAppointment.symptomSubmission.symptoms,
            },
          })
        }

        // 5. Create notifications
        await tx.notificationJob.create({
          data: {
            type: NotificationType.BOOKING_CONFIRMATION,
            recipientId: patientId,
            appointmentId: newAppointment.id,
            idempotencyKey: `reschedule-conf-patient-${newAppointment.id}`,
            payload: {
              appointmentId: newAppointment.id,
              rescheduledFrom: originalAppointment.id,
              startAt: newAppointment.startAt.toISOString(),
            },
          },
        })

        await tx.notificationJob.create({
          data: {
            type: NotificationType.BOOKING_CONFIRMATION,
            recipientId: newAppointment.doctorId,
            appointmentId: newAppointment.id,
            idempotencyKey: `reschedule-conf-doctor-${newAppointment.id}`,
            payload: {
              appointmentId: newAppointment.id,
              rescheduledFrom: originalAppointment.id,
              startAt: newAppointment.startAt.toISOString(),
            },
          },
        })

        return newAppointment
      })

      const symptoms = newHold.symptomSubmission?.symptoms || originalAppointment.symptomSubmission?.symptoms
      if (symptoms) {
        AIService.generatePreVisitSummary(rescheduledAppointment.id, symptoms).catch((err) => {
          console.warn('[PreVisitAI] Background generation error on reschedule:', err)
        })
      }

      // Queue Google Calendar event reschedule update
      GoogleCalendarService.syncAppointmentRescheduled(rescheduledAppointment.id, rescheduledAppointment.patientId).catch((err) => {
        console.warn('[GoogleCalendar] Patient reschedule calendar sync error:', err)
      })
      GoogleCalendarService.syncAppointmentRescheduled(rescheduledAppointment.id, rescheduledAppointment.doctorId).catch((err) => {
        console.warn('[GoogleCalendar] Doctor reschedule calendar sync error:', err)
      })

      return rescheduledAppointment
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string }
      if (
        err.code === 'P2010' ||
        err.code === 'P2002' ||
        (err.message && err.message.includes('SlotReservation_active_doctor_time_excl'))
      ) {
        throw new Error('SLOT_CONFLICT')
      }
      throw error
    }
  }

  /**
   * Retrieves list of appointments according to user role and filters.
   */
  static async getAppointments(
    userId: string,
    role: UserRole,
    filter?: { status?: AppointmentStatus; upcoming?: boolean },
  ) {
    const where: Record<string, unknown> = {}

    if (role === UserRole.PATIENT) {
      where.patientId = userId
    } else if (role === UserRole.DOCTOR) {
      where.doctorId = userId
    }
    // Admin sees all

    if (filter?.status) {
      where.status = filter.status
    }

    if (filter?.upcoming) {
      where.startAt = { gte: new Date() }
    }

    return prisma.appointment.findMany({
      where,
      include: {
        patient: {
          include: { patientProfile: true },
        },
        doctor: {
          include: { doctorProfile: true },
        },
        symptomSubmission: true,
        preVisitSummary: true,
        consultation: {
          include: {
            prescription: {
              include: {
                medications: true,
              },
            },
            postVisitSummary: true,
          },
        },
      },
      orderBy: {
        startAt: filter?.upcoming ? 'asc' : 'desc',
      },
    })
  }

  /**
   * Retrieves single appointment by ID with strict ownership/assignment authorization.
   */
  static async getAppointmentById(appointmentId: string, userId: string, role: UserRole) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: {
          include: { patientProfile: true },
        },
        doctor: {
          include: { doctorProfile: true },
        },
        symptomSubmission: true,
        preVisitSummary: true,
        consultation: {
          include: {
            prescription: {
              include: {
                medications: true,
              },
            },
            postVisitSummary: true,
          },
        },
      },
    })

    if (!appointment) {
      throw new Error('APPOINTMENT_NOT_FOUND')
    }

    // Role ownership check
    if (role === UserRole.PATIENT && appointment.patientId !== userId) {
      throw new Error('FORBIDDEN')
    }
    if (role === UserRole.DOCTOR && appointment.doctorId !== userId) {
      throw new Error('FORBIDDEN')
    }

    return appointment
  }
}
