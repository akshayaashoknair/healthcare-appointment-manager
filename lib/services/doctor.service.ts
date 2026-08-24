import { prisma } from '../prisma'
import { hashPassword } from '../auth'
import { UserRole, ReservationStatus, AppointmentStatus, NotificationType } from '../types'
import { DoctorCreateInput, DoctorUpdateInput, WorkingHourItem, DoctorLeaveInput } from '../validations'
import { GoogleCalendarService } from './google-calendar.service'

export class DoctorService {
  static async createDoctor(data: DoctorCreateInput) {
    const existing = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase().trim() },
    })

    if (existing) {
      throw new Error('EMAIL_EXISTS')
    }

    const passwordHash = await hashPassword(data.password)

    const defaultHours: WorkingHourItem[] = [
      { weekday: 1, startTime: '09:00', endTime: '17:00' },
      { weekday: 2, startTime: '09:00', endTime: '17:00' },
      { weekday: 3, startTime: '09:00', endTime: '17:00' },
      { weekday: 4, startTime: '09:00', endTime: '17:00' },
      { weekday: 5, startTime: '09:00', endTime: '17:00' },
    ]

    const hoursToCreate = data.workingHours && data.workingHours.length > 0 ? data.workingHours : defaultHours

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email.toLowerCase().trim(),
          passwordHash,
          role: UserRole.DOCTOR,
          doctorProfile: {
            create: {
              firstName: data.firstName.trim(),
              lastName: data.lastName.trim(),
              specialisation: data.specialisation.trim(),
              slotDurationMinutes: data.slotDurationMinutes || 30,
              isActive: true,
              workingHours: {
                createMany: {
                  data: hoursToCreate.map((h) => ({
                    weekday: h.weekday,
                    startTime: h.startTime,
                    endTime: h.endTime,
                  })),
                },
              },
            },
          },
        },
        include: {
          doctorProfile: {
            include: {
              workingHours: true,
            },
          },
        },
      })

      return user
    })
  }

  static async updateDoctor(userId: string, data: DoctorUpdateInput) {
    const doctor = await prisma.user.findUnique({
      where: { id: userId },
      include: { doctorProfile: true },
    })

    if (!doctor || doctor.role !== UserRole.DOCTOR || !doctor.doctorProfile) {
      throw new Error('DOCTOR_NOT_FOUND')
    }

    const updatedProfile = await prisma.doctorProfile.update({
      where: { userId },
      data: {
        ...(data.firstName ? { firstName: data.firstName.trim() } : {}),
        ...(data.lastName ? { lastName: data.lastName.trim() } : {}),
        ...(data.specialisation ? { specialisation: data.specialisation.trim() } : {}),
        ...(data.slotDurationMinutes !== undefined ? { slotDurationMinutes: data.slotDurationMinutes } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
      include: {
        workingHours: true,
        leaveDays: true,
      },
    })

    return updatedProfile
  }

  static async getDoctors(filter?: { specialisation?: string; isActive?: boolean }) {
    const where: Record<string, unknown> = {
      role: UserRole.DOCTOR,
    }

    const doctorProfileWhere: Record<string, unknown> = {}
    if (filter?.specialisation) {
      doctorProfileWhere.specialisation = {
        contains: filter.specialisation,
        mode: 'insensitive',
      }
    }
    if (filter?.isActive !== undefined) {
      doctorProfileWhere.isActive = filter.isActive
    }

    if (Object.keys(doctorProfileWhere).length > 0) {
      where.doctorProfile = doctorProfileWhere
    }

    const doctors = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        doctorProfile: {
          include: {
            workingHours: {
              orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
            },
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    return doctors
  }

  static async getDoctorById(userId: string) {
    const doctor = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        doctorProfile: {
          include: {
            workingHours: {
              orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
            },
            leaveDays: {
              where: {
                endAt: { gte: new Date() },
              },
              orderBy: { startAt: 'asc' },
            },
          },
        },
      },
    })

    if (!doctor || doctor.role !== UserRole.DOCTOR) {
      throw new Error('DOCTOR_NOT_FOUND')
    }

    return doctor
  }

  static async setWorkingHours(userId: string, hours: WorkingHourItem[]) {
    const doctor = await prisma.user.findUnique({
      where: { id: userId },
      include: { doctorProfile: true },
    })

    if (!doctor || !doctor.doctorProfile) {
      throw new Error('DOCTOR_NOT_FOUND')
    }

    const profileId = doctor.doctorProfile.id

    return prisma.$transaction(async (tx) => {
      await tx.doctorWorkingHours.deleteMany({
        where: { doctorId: profileId },
      })

      if (hours.length > 0) {
        await tx.doctorWorkingHours.createMany({
          data: hours.map((h) => ({
            doctorId: profileId,
            weekday: h.weekday,
            startTime: h.startTime,
            endTime: h.endTime,
          })),
        })
      }

      return tx.doctorWorkingHours.findMany({
        where: { doctorId: profileId },
        orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
      })
    })
  }

  static async addLeave(userId: string, data: DoctorLeaveInput) {
    const doctor = await prisma.user.findUnique({
      where: { id: userId },
      include: { doctorProfile: true },
    })

    if (!doctor || !doctor.doctorProfile) {
      throw new Error('DOCTOR_NOT_FOUND')
    }

    const profileId = doctor.doctorProfile.id
    const startAt = new Date(data.startAt)
    const endAt = new Date(data.endAt)

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create leave record
      const leave = await tx.doctorLeave.create({
        data: {
          doctorId: profileId,
          startAt,
          endAt,
          reason: data.reason || null,
        },
      })

      // 2. Detect affected confirmed appointments overlapping the leave interval [startAt, endAt)
      const affectedAppointments = await tx.appointment.findMany({
        where: {
          doctorId: userId,
          status: AppointmentStatus.CONFIRMED,
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
        include: {
          patient: {
            include: { patientProfile: true },
          },
        },
      })

      // 3. Mark affected appointments as CANCELLED (or LEAVE_AFFECTED) and release slot reservation
      for (const apt of affectedAppointments) {
        await tx.appointment.update({
          where: { id: apt.id },
          data: {
            status: AppointmentStatus.CANCELLED,
            cancellationReason: `Doctor on leave: ${data.reason || 'Scheduled leave'}`,
            cancelledAt: new Date(),
          },
        })

        await tx.slotReservation.update({
          where: { id: apt.reservationId },
          data: { status: ReservationStatus.RELEASED },
        })

        // 4. Create durable outbox notification job for affected patient
        await tx.notificationJob.create({
          data: {
            type: NotificationType.DOCTOR_LEAVE,
            recipientId: apt.patientId,
            appointmentId: apt.id,
            idempotencyKey: `leave-cancel-${apt.id}-${leave.id}`,
            payload: {
              appointmentId: apt.id,
              startAt: apt.startAt.toISOString(),
              endAt: apt.endAt.toISOString(),
              reason: data.reason,
            },
          },
        })
      }

      return {
        leave,
        affectedAppointmentsCount: affectedAppointments.length,
        affectedAppointments,
      }
    })

    // Queue Google Calendar event deletion for affected appointments
    for (const apt of result.affectedAppointments) {
      GoogleCalendarService.syncAppointmentCancelled(apt.id, apt.patientId).catch((err) => {
        console.warn('[GoogleCalendar] Leave cancellation patient calendar sync error:', err)
      })
      GoogleCalendarService.syncAppointmentCancelled(apt.id, userId).catch((err) => {
        console.warn('[GoogleCalendar] Leave cancellation doctor calendar sync error:', err)
      })
    }

    return result
  }

  static async getDoctorLeaveDays(userId: string) {
    const doctor = await prisma.user.findUnique({
      where: { id: userId },
      include: { doctorProfile: true },
    })

    if (!doctor || !doctor.doctorProfile) {
      throw new Error('DOCTOR_NOT_FOUND')
    }

    return prisma.doctorLeave.findMany({
      where: { doctorId: doctor.doctorProfile.id },
      orderBy: { startAt: 'desc' },
    })
  }
}
