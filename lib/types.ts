import {
  UserRole,
  AppointmentStatus,
  HoldStatus,
  ReservationKind,
  ReservationStatus,
  NotificationType,
  NotificationStatus,
  AIGenerationStatus,
  UrgencyLevel,
  CalendarSyncStatus,
} from '@prisma/client'

export {
  UserRole,
  AppointmentStatus,
  HoldStatus,
  ReservationKind,
  ReservationStatus,
  NotificationType,
  NotificationStatus,
  AIGenerationStatus,
  UrgencyLevel,
  CalendarSyncStatus,
}

export interface SessionPayload {
  userId: string
  email: string
  role: UserRole
  firstName?: string
  lastName?: string
  exp: number
  iat: number
}

export interface TimeSlot {
  startAt: string // ISO string
  endAt: string   // ISO string
  available: boolean
  doctorId: string
}

export interface WorkingHourItem {
  weekday: number
  startTime: string
  endTime: string
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  details?: unknown
}
