import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { UserRole } from '@/lib/types'
import { AppointmentService } from '@/lib/services/appointment.service'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session || session.role !== UserRole.PATIENT) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Patient role required' }, { status: 401 })
    }

    const appointment = await AppointmentService.confirmHold(params.id, session.userId)

    return NextResponse.json({
      success: true,
      data: { appointment },
    })
  } catch (error: unknown) {
    const err = error as { message?: string }
    if (err.message === 'HOLD_EXPIRED') {
      return NextResponse.json(
        { success: false, error: 'Your reservation hold has expired. Please select a slot again.' },
        { status: 409 },
      )
    }
    if (err.message === 'HOLD_NOT_FOUND') {
      return NextResponse.json({ success: false, error: 'Hold not found' }, { status: 404 })
    }
    if (err.message === 'FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'Forbidden: You do not own this hold' }, { status: 403 })
    }
    if (err.message === 'SLOT_CONFLICT') {
      return NextResponse.json(
        { success: false, error: 'Slot conflict occurred. Please select another slot.' },
        { status: 409 },
      )
    }
    console.error('Confirm hold error:', error)
    return NextResponse.json({ success: false, error: 'Failed to confirm appointment' }, { status: 500 })
  }
}
