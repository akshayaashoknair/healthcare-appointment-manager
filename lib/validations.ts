import { z } from 'zod'

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  phone: z.string().optional().nullable(),
})

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const workingHourItemSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format must be HH:mm (24h)'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format must be HH:mm (24h)'),
}).refine((data) => data.startTime < data.endTime, {
  message: 'Start time must be before end time',
  path: ['endTime'],
})

export const doctorWorkingHoursSchema = z.array(workingHourItemSchema)

export const doctorCreateSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  specialisation: z.string().min(1, 'Specialisation is required'),
  slotDurationMinutes: z.number().int().positive('Slot duration must be positive').default(30),
  workingHours: z.array(workingHourItemSchema).optional(),
})

export const doctorUpdateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  specialisation: z.string().min(1).optional(),
  slotDurationMinutes: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
})

export const doctorLeaveSchema = z.object({
  startAt: z.string().datetime({ message: 'startAt must be a valid ISO datetime string' }),
  endAt: z.string().datetime({ message: 'endAt must be a valid ISO datetime string' }),
  reason: z.string().max(500).optional().nullable(),
}).refine((data) => new Date(data.startAt) < new Date(data.endAt), {
  message: 'startAt must be before endAt',
  path: ['endAt'],
})

export const slotHoldSchema = z.object({
  doctorId: z.string().min(1, 'Doctor ID is required'),
  startAt: z.string().datetime({ message: 'startAt must be a valid ISO datetime string' }),
  endAt: z.string().datetime({ message: 'endAt must be a valid ISO datetime string' }),
  symptoms: z.string().min(3, 'Symptoms must be at least 3 characters').max(3000, 'Symptoms too long'),
}).refine((data) => new Date(data.startAt) < new Date(data.endAt), {
  message: 'startAt must be before endAt',
  path: ['endAt'],
})

export const cancelAppointmentSchema = z.object({
  reason: z.string().max(500).optional().nullable(),
})

export const rescheduleAppointmentSchema = z.object({
  newHoldId: z.string().min(1, 'New hold ID is required'),
})

// MISSION 2 VALIDATIONS: AI & CONSULTATION

export const preVisitAIOutputSchema = z.object({
  urgencyLevel: z.enum(['Low', 'Medium', 'High', 'LOW', 'MEDIUM', 'HIGH']),
  chiefComplaint: z.string().min(1, 'Chief complaint is required'),
  suggestedQuestions: z.array(z.string().min(1)).length(3, 'Must contain exactly 3 suggested questions'),
})

export const postVisitAIOutputSchema = z.object({
  patientSummary: z.string().min(1, 'Patient summary is required'),
  medicationSchedule: z.string().default(''),
  followUpSteps: z.string().default(''),
})

export const medicationInputSchema = z.object({
  name: z.string().min(1, 'Medication name is required'),
  dosage: z.string().min(1, 'Dosage is required'),
  instructions: z.string().optional().nullable(),
  frequency: z.string().min(1, 'Frequency is required'),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  reminderTime: z.string().optional().nullable(),
})

export const consultationSubmitSchema = z.object({
  clinicalNotes: z.string().min(5, 'Clinical notes must be at least 5 characters long'),
  instructions: z.string().optional().nullable(),
  followUpInformation: z.string().optional().nullable(),
  medications: z.array(medicationInputSchema).optional().default([]),
})

export type WorkingHourItem = z.infer<typeof workingHourItemSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type DoctorCreateInput = z.infer<typeof doctorCreateSchema>
export type DoctorUpdateInput = z.infer<typeof doctorUpdateSchema>
export type DoctorLeaveInput = z.infer<typeof doctorLeaveSchema>
export type SlotHoldInput = z.infer<typeof slotHoldSchema>
export type CancelAppointmentInput = z.infer<typeof cancelAppointmentSchema>
export type RescheduleAppointmentInput = z.infer<typeof rescheduleAppointmentSchema>
export type PreVisitAIOutput = z.infer<typeof preVisitAIOutputSchema>
export type PostVisitAIOutput = z.infer<typeof postVisitAIOutputSchema>
export type MedicationInput = z.infer<typeof medicationInputSchema>
export type ConsultationSubmitInput = z.infer<typeof consultationSubmitSchema>
