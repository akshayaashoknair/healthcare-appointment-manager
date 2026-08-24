import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  AvailabilityService,
  parseLocalTimeToUtc,
  getWeekdayInTimezone,
} from '../lib/services/availability.service'

describe('Doctor Availability & Slot Generation Tests', () => {
  it('should test half-open interval overlap [start, end) correctly', () => {
    const d1_start = new Date('2026-09-01T09:00:00.000Z')
    const d1_end = new Date('2026-09-01T09:30:00.000Z')

    // Adjacent interval: [09:30, 10:00) does NOT overlap [09:00, 09:30)
    const d2_start = new Date('2026-09-01T09:30:00.000Z')
    const d2_end = new Date('2026-09-01T10:00:00.000Z')
    assert.equal(
      AvailabilityService.intervalsOverlap(d1_start, d1_end, d2_start, d2_end),
      false,
      'Adjacent half-open intervals must NOT overlap',
    )

    // Overlapping interval: [09:15, 09:45) DOES overlap [09:00, 09:30)
    const d3_start = new Date('2026-09-01T09:15:00.000Z')
    const d3_end = new Date('2026-09-01T09:45:00.000Z')
    assert.equal(
      AvailabilityService.intervalsOverlap(d1_start, d1_end, d3_start, d3_end),
      true,
      'Intersecting intervals must overlap',
    )

    // Sub-interval: [09:05, 09:25) DOES overlap [09:00, 09:30)
    const d4_start = new Date('2026-09-01T09:05:00.000Z')
    const d4_end = new Date('2026-09-01T09:25:00.000Z')
    assert.equal(
      AvailabilityService.intervalsOverlap(d1_start, d1_end, d4_start, d4_end),
      true,
      'Sub-intervals must overlap',
    )
  })

  it('should correctly convert clinic local date and time to UTC', () => {
    // Asia/Kolkata is UTC+5:30
    const utcDate = parseLocalTimeToUtc('2026-09-01', '09:00', 'Asia/Kolkata')
    // 09:00 AM IST = 03:30 AM UTC
    assert.equal(utcDate.toISOString(), '2026-09-01T03:30:00.000Z')
  })

  it('should correctly determine weekday in clinic timezone', () => {
    // 2026-09-01 is a Tuesday (weekday index: 2)
    const weekday = getWeekdayInTimezone('2026-09-01', 'Asia/Kolkata')
    assert.equal(weekday, 2, '2026-09-01 must be Tuesday (2)')
  })
})
