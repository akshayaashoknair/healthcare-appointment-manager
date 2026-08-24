import { prisma } from '../prisma'
import { AppointmentStatus, HoldStatus, TimeSlot } from '../types'

const CLINIC_TIMEZONE = process.env.CLINIC_TIMEZONE || 'Asia/Kolkata'

export function parseLocalTimeToUtc(dateStr: string, timeStr: string, timeZone = CLINIC_TIMEZONE): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hours, minutes] = timeStr.split(':').map(Number)

  const utcGuess = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0))

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const parts = formatter.formatToParts(utcGuess)
  const partMap: Record<string, number> = {}
  for (const part of parts) {
    if (part.type !== 'literal') {
      partMap[part.type] = Number(part.value)
    }
  }

  const formattedYear = partMap.year
  const formattedMonth = partMap.month
  const formattedDay = partMap.day
  const formattedHour = partMap.hour === 24 ? 0 : partMap.hour
  const formattedMinute = partMap.minute

  const formattedAsUtc = Date.UTC(formattedYear, formattedMonth - 1, formattedDay, formattedHour, formattedMinute, 0)
  const offsetMs = formattedAsUtc - utcGuess.getTime()

  return new Date(utcGuess.getTime() - offsetMs)
}

export function getWeekdayInTimezone(dateStr: string, timeZone = CLINIC_TIMEZONE): number {
  const dateAtNoon = parseLocalTimeToUtc(dateStr, '12:00', timeZone)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  })
  const weekdayStr = formatter.format(dateAtNoon)
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  return map[weekdayStr] ?? 0
}

export class AvailabilityService {
  /**
   * Half-open interval overlap check: [startA, endA) and [startB, endB)
   */
  static intervalsOverlap(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
    return startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime()
  }

  /**
   * Generates derived available slots for a doctor on a specific date (YYYY-MM-DD)
   */
  static async getDoctorAvailableSlots(
    doctorId: string,
    dateStr: string,
    timeZone = CLINIC_TIMEZONE,
    now: Date = new Date(),
  ): Promise<TimeSlot[]> {
    // 1. Fetch doctor profile & configuration
    const doctor = await prisma.user.findUnique({
      where: { id: doctorId },
      include: {
        doctorProfile: {
          include: {
            workingHours: true,
          },
        },
      },
    })

    if (!doctor || !doctor.doctorProfile || !doctor.doctorProfile.isActive) {
      return []
    }

    const slotDurationMs = doctor.doctorProfile.slotDurationMinutes * 60 * 1000
    if (slotDurationMs <= 0) {
      return []
    }

    // 2. Identify weekday in clinic timezone
    const weekday = getWeekdayInTimezone(dateStr, timeZone)
    const workingHoursForDay = doctor.doctorProfile.workingHours.filter((wh) => wh.weekday === weekday)

    if (workingHoursForDay.length === 0) {
      return []
    }

    // 3. Define boundaries of that date in UTC
    const dayStartUtc = parseLocalTimeToUtc(dateStr, '00:00', timeZone)
    const dayEndUtc = parseLocalTimeToUtc(dateStr, '23:59', timeZone)
    dayEndUtc.setMinutes(dayEndUtc.getMinutes() + 1) // cover up to next midnight

    // 4. Fetch all leaves, confirmed appointments, and active unexpired holds
    const [leaves, confirmedAppointments, activeHolds] = await Promise.all([
      prisma.doctorLeave.findMany({
        where: {
          doctorId: doctor.doctorProfile.id,
          startAt: { lt: dayEndUtc },
          endAt: { gt: dayStartUtc },
        },
      }),
      prisma.appointment.findMany({
        where: {
          doctorId,
          status: AppointmentStatus.CONFIRMED,
          startAt: { lt: dayEndUtc },
          endAt: { gt: dayStartUtc },
        },
      }),
      prisma.appointmentHold.findMany({
        where: {
          doctorId,
          status: HoldStatus.HELD,
          expiresAt: { gt: now },
          startAt: { lt: dayEndUtc },
          endAt: { gt: dayStartUtc },
        },
      }),
    ])

    const slots: TimeSlot[] = []

    // 5. Break working hour periods into contiguous slots of slotDurationMinutes
    for (const wh of workingHoursForDay) {
      const periodStartUtc = parseLocalTimeToUtc(dateStr, wh.startTime, timeZone)
      const periodEndUtc = parseLocalTimeToUtc(dateStr, wh.endTime, timeZone)

      let currentSlotStart = new Date(periodStartUtc)
      while (currentSlotStart.getTime() + slotDurationMs <= periodEndUtc.getTime()) {
        const currentSlotEnd = new Date(currentSlotStart.getTime() + slotDurationMs)

        // Slot cannot be in the past
        const isPast = currentSlotStart.getTime() <= now.getTime()

        // Check if slot overlaps any leave interval
        const overlapsLeave = leaves.some((leave) =>
          this.intervalsOverlap(currentSlotStart, currentSlotEnd, leave.startAt, leave.endAt),
        )

        // Check if slot overlaps any confirmed appointment
        const overlapsAppointment = confirmedAppointments.some((apt) =>
          this.intervalsOverlap(currentSlotStart, currentSlotEnd, apt.startAt, apt.endAt),
        )

        // Check if slot overlaps any active hold
        const overlapsHold = activeHolds.some((hold) =>
          this.intervalsOverlap(currentSlotStart, currentSlotEnd, hold.startAt, hold.endAt),
        )

        const isAvailable = !isPast && !overlapsLeave && !overlapsAppointment && !overlapsHold

        slots.push({
          startAt: currentSlotStart.toISOString(),
          endAt: currentSlotEnd.toISOString(),
          available: isAvailable,
          doctorId,
        })

        // Move to next slot
        currentSlotStart = new Date(currentSlotStart.getTime() + slotDurationMs)
      }
    }

    // Sort chronologically
    slots.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    return slots
  }
}
