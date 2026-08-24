import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { UserRole } from '@/lib/types'
import { slotHoldSchema } from '@/lib/validations'
import { ReservationService } from '@/lib/services/reservation.service'

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== UserRole.PATIENT) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Patient role required' }, { status: 401 })
    }

    const body = await req.json()
    const validatedData = slotHoldSchema.safeParse(body)

    if (!validatedData.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validatedData.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const result = await ReservationService.createHold(session.userId, validatedData.data)

    return NextResponse.json({ success: true, data: result }, { status: 201 })
  } catch (error: unknown) {
    const err = error as { message?: string }
    if (err.message === 'SLOT_CONFLICT') {
      return NextResponse.json(
        { success: false, error: 'This time slot is no longer available. Please select another slot.' },
        { status: 409 },
      )
    }
    if (err.message === 'DOCTOR_ON_LEAVE') {
      return NextResponse.json(
        { success: false, error: 'The doctor is on leave during this time.' },
        { status: 409 },
      )
    }
    if (err.message === 'SLOT_IN_PAST') {
      return NextResponse.json(
        { success: false, error: 'Cannot book a slot in the past.' },
        { status: 400 },
      )
    }
    if (err.message === 'DOCTOR_UNAVAILABLE') {
      return NextResponse.json(
        { success: false, error: 'Doctor profile is inactive or unavailable.' },
        { status: 404 },
      )
    }
    console.error('Slot hold error:', error)
    return NextResponse.json({ success: false, error: 'Failed to reserve slot hold' }, { status: 500 })
  }
}
