import { prisma } from '../prisma'
import { AppointmentStatus, ReservationStatus, UserRole } from '../types'
import { ConsultationSubmitInput } from '../validations'
import { AIService } from './ai.service'

export class ConsultationService {
  /**
   * Submits doctor clinical notes and prescription, completes the appointment,
   * and asynchronously queues post-visit AI summary generation.
   */
  static async submitConsultation(doctorId: string, appointmentId: string, data: ConsultationSubmitInput) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        reservation: true,
        patient: {
          include: { patientProfile: true },
        },
      },
    })

    if (!appointment) {
      throw new Error('APPOINTMENT_NOT_FOUND')
    }

    if (appointment.doctorId !== doctorId) {
      throw new Error('FORBIDDEN_NOT_ASSIGNED_DOCTOR')
    }

    if (appointment.status === AppointmentStatus.CANCELLED) {
      throw new Error('CANNOT_CONSULT_CANCELLED_APPOINTMENT')
    }

    if (appointment.status === AppointmentStatus.COMPLETED) {
      throw new Error('CONSULTATION_ALREADY_COMPLETED')
    }

    const hasPrescriptionData =
      Boolean(data.instructions?.trim()) ||
      Boolean(data.followUpInformation?.trim()) ||
      (data.medications && data.medications.length > 0)

    // 1. Transaction to save consultation notes, prescriptions, medications, and complete appointment
    const consultation = await prisma.$transaction(async (tx) => {
      // Create Consultation
      const createdConsultation = await tx.consultation.create({
        data: {
          appointmentId,
          doctorId,
          clinicalNotes: data.clinicalNotes.trim(),
        },
      })

      // Create Prescription if provided
      if (hasPrescriptionData) {
        const createdPrescription = await tx.prescription.create({
          data: {
            consultationId: createdConsultation.id,
            instructions: data.instructions?.trim() || null,
            followUpInformation: data.followUpInformation?.trim() || null,
          },
        })

        // Create Medications
        if (data.medications && data.medications.length > 0) {
          for (const med of data.medications) {
            await tx.medication.create({
              data: {
                prescriptionId: createdPrescription.id,
                name: med.name.trim(),
                dosage: med.dosage.trim(),
                instructions: med.instructions?.trim() || null,
                frequency: med.frequency.trim(),
                startDate: med.startDate ? new Date(med.startDate) : null,
                endDate: med.endDate ? new Date(med.endDate) : null,
                reminderTime: med.reminderTime?.trim() || null,
              },
            })
          }
        }
      }

      // Transition appointment to COMPLETED
      await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: AppointmentStatus.COMPLETED },
      })

      // Release SlotReservation
      await tx.slotReservation.update({
        where: { id: appointment.reservationId },
        data: { status: ReservationStatus.RELEASED },
      })

      return createdConsultation
    })

    // 2. Fetch full consultation details
    const fullConsultation = await prisma.consultation.findUnique({
      where: { id: consultation.id },
      include: {
        prescription: {
          include: {
            medications: true,
          },
        },
        appointment: {
          include: {
            patient: { include: { patientProfile: true } },
            doctor: { include: { doctorProfile: true } },
          },
        },
      },
    })

    // 3. Asynchronously trigger Post-Visit AI Summary generation in background
    // (Never block or fail the consultation if LLM encounters an error)
    const prescriptionContext = fullConsultation?.prescription
      ? `Instructions: ${fullConsultation.prescription.instructions || 'N/A'}\nFollow-up: ${
          fullConsultation.prescription.followUpInformation || 'N/A'
        }\nMedications:\n${fullConsultation.prescription.medications
          .map((m) => `- ${m.name} (${m.dosage}) ${m.frequency}`)
          .join('\n')}`
      : undefined

    AIService.generatePostVisitSummary(consultation.id, data.clinicalNotes, prescriptionContext).catch((err) => {
      console.warn('[PostVisitAI] Background generation caught error:', err)
    })

    return fullConsultation
  }

  /**
   * Retrieves consultation details with strict ownership and authorization checks.
   */
  static async getConsultation(appointmentId: string, userId: string, role: UserRole) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
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

    return appointment.consultation
  }
}
