import { prisma } from '../prisma'
import { AppointmentStatus, NotificationStatus, NotificationType } from '../types'
import { EmailService } from './email.service'

const MAX_JOB_ATTEMPTS = 5

export class NotificationService {
  /**
   * Computes bounded exponential backoff delay in milliseconds for retrying failed jobs.
   */
  static calculateRetryDelayMs(attemptCount: number): number {
    switch (attemptCount) {
      case 1:
        return 60 * 1000 // 1 minute
      case 2:
        return 5 * 60 * 1000 // 5 minutes
      case 3:
        return 15 * 60 * 1000 // 15 minutes
      case 4:
        return 60 * 60 * 1000 // 1 hour
      default:
        return 4 * 60 * 60 * 1000 // 4 hours
    }
  }

  /**
   * Scans confirmed appointments starting in the next 24 hours and enqueues reminder outbox jobs.
   */
  static async queueUpcomingAppointmentReminders(now = new Date()): Promise<number> {
    const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    const upcomingAppointments = await prisma.appointment.findMany({
      where: {
        status: AppointmentStatus.CONFIRMED,
        startAt: {
          gte: now,
          lte: next24Hours,
        },
      },
      include: {
        patient: { include: { patientProfile: true } },
        doctor: { include: { doctorProfile: true } },
      },
    })

    let queuedCount = 0

    for (const apt of upcomingAppointments) {
      const patientKey = `reminder-patient-${apt.id}`
      const doctorKey = `reminder-doctor-${apt.id}`

      // Create Patient Reminder
      try {
        await prisma.notificationJob.create({
          data: {
            type: NotificationType.APPOINTMENT_REMINDER,
            recipientId: apt.patientId,
            appointmentId: apt.id,
            idempotencyKey: patientKey,
            payload: {
              appointmentId: apt.id,
              startAt: apt.startAt.toISOString(),
              doctorName: `${apt.doctor.doctorProfile?.firstName} ${apt.doctor.doctorProfile?.lastName}`,
            },
          },
        })
        queuedCount++
      } catch (err: unknown) {
        // Idempotency constraint: duplicate insertion safely skipped
        const e = err as { code?: string }
        if (e.code !== 'P2002') console.warn('Failed to queue patient reminder:', err)
      }

      // Create Doctor Reminder
      try {
        await prisma.notificationJob.create({
          data: {
            type: NotificationType.APPOINTMENT_REMINDER,
            recipientId: apt.doctorId,
            appointmentId: apt.id,
            idempotencyKey: doctorKey,
            payload: {
              appointmentId: apt.id,
              startAt: apt.startAt.toISOString(),
              patientName: `${apt.patient.patientProfile?.firstName} ${apt.patient.patientProfile?.lastName}`,
            },
          },
        })
        queuedCount++
      } catch (err: unknown) {
        const e = err as { code?: string }
        if (e.code !== 'P2002') console.warn('Failed to queue doctor reminder:', err)
      }
    }

    return queuedCount
  }

  /**
   * Scans active medications on completed visits and enqueues daily medication reminder jobs.
   */
  static async queueActiveMedicationReminders(now = new Date()): Promise<number> {
    const todayStr = now.toISOString().split('T')[0]

    // Find medications where prescription belongs to a completed consultation and endDate >= now or null
    const activeMedications = await prisma.medication.findMany({
      where: {
        OR: [{ endDate: null }, { endDate: { gte: now } }],
        prescription: {
          consultation: {
            appointment: {
              status: AppointmentStatus.COMPLETED,
            },
          },
        },
      },
      include: {
        prescription: {
          include: {
            consultation: {
              include: {
                appointment: {
                  include: {
                    patient: { include: { patientProfile: true } },
                  },
                },
              },
            },
          },
        },
      },
    })

    let queuedCount = 0

    for (const med of activeMedications) {
      const patient = med.prescription.consultation.appointment.patient
      const idempotencyKey = `med-reminder-${med.id}-${todayStr}`

      try {
        await prisma.notificationJob.create({
          data: {
            type: NotificationType.MEDICATION_REMINDER,
            recipientId: patient.id,
            prescriptionId: med.prescriptionId,
            appointmentId: med.prescription.consultation.appointmentId,
            idempotencyKey,
            payload: {
              medicationId: med.id,
              medicationName: med.name,
              dosage: med.dosage,
              frequency: med.frequency,
              instructions: med.instructions,
              reminderTime: med.reminderTime,
            },
          },
        })
        queuedCount++
      } catch (err: unknown) {
        const e = err as { code?: string }
        if (e.code !== 'P2002') console.warn('Failed to queue medication reminder:', err)
      }
    }

    return queuedCount
  }

  /**
   * Processes a batch of pending/retryable notification jobs.
   */
  static async processPendingJobs(batchSize = 20): Promise<{
    processed: number
    succeeded: number
    retried: number
    failed: number
  }> {
    const now = new Date()

    // 1. Fetch eligible jobs
    const jobs = await prisma.notificationJob.findMany({
      where: {
        status: { in: [NotificationStatus.PENDING, NotificationStatus.RETRY_SCHEDULED] },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      include: {
        recipient: {
          include: {
            patientProfile: true,
            doctorProfile: true,
          },
        },
      },
      take: batchSize,
      orderBy: { createdAt: 'asc' },
    })

    let succeeded = 0
    let retried = 0
    let failed = 0

    for (const job of jobs) {
      // Mark PROCESSING
      await prisma.notificationJob.update({
        where: { id: job.id },
        data: { status: NotificationStatus.PROCESSING },
      })

      const recipientName =
        job.recipient.patientProfile?.firstName ||
        job.recipient.doctorProfile?.firstName ||
        job.recipient.email

      try {
        const result = await EmailService.sendNotification(
          job.type,
          job.recipient.email,
          recipientName,
          (job.payload as Record<string, unknown>) || {},
        )

        // Mark SENT
        await prisma.notificationJob.update({
          where: { id: job.id },
          data: {
            status: NotificationStatus.SENT,
            providerMessageId: result.providerMessageId,
            attemptCount: job.attemptCount + 1,
            lastError: null,
          },
        })
        succeeded++
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        const nextAttemptCount = job.attemptCount + 1

        if (nextAttemptCount >= MAX_JOB_ATTEMPTS) {
          // Exhausted max attempts -> mark FAILED
          await prisma.notificationJob.update({
            where: { id: job.id },
            data: {
              status: NotificationStatus.FAILED,
              attemptCount: nextAttemptCount,
              lastError: errorMsg,
            },
          })
          failed++
        } else {
          // Schedule retry with exponential backoff
          const delayMs = this.calculateRetryDelayMs(nextAttemptCount)
          const nextAttemptAt = new Date(Date.now() + delayMs)

          await prisma.notificationJob.update({
            where: { id: job.id },
            data: {
              status: NotificationStatus.RETRY_SCHEDULED,
              attemptCount: nextAttemptCount,
              nextAttemptAt,
              lastError: errorMsg,
            },
          })
          retried++
        }
      }
    }

    return {
      processed: jobs.length,
      succeeded,
      retried,
      failed,
    }
  }
}
