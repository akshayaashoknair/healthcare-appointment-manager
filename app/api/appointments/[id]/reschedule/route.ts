import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { UserRole } from '@/lib/types'
import { rescheduleAppointmentSchema } from '@/lib/validations'
import { AppointmentService } from '@/lib/services/appointment.service'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session || session.role !== UserRole.PATIENT) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Patient role required' }, { status: 401 })
    }

    const body = await req.json()
    const validated = rescheduleAppointmentSchema.safeParse(body)

    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const newAppointment = await AppointmentService.rescheduleAppointment(
      params.id,
      validated.data.newHoldId,
      session.userId,
    )

    return NextResponse.json({
      success: true,
      data: { appointment: newAppointment },
    })
  } catch (error: unknown) {
    const err = error as { message?: string }
    if (err.message === 'APPOINTMENT_NOT_FOUND') {
      return NextResponse.json({ success: false, error: 'Appointment not found' }, { status: 404 })
    }
    if (err.message === 'HOLD_NOT_FOUND') {
      return NextResponse.json({ success: false, error: 'New slot hold not found' }, { status: 404 })
    }
    if (err.message === 'HOLD_EXPIRED') {
      return NextResponse.json({ success: false, error: 'Hold expired. Please select a new slot.' }, { status: 409 })
    }
    if (err.message === 'FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
    if (err.message === 'CANNOT_RESCHEDULE_STATUS') {
      return NextResponse.json(
        { success: false, error: 'Cannot reschedule an appointment that is already cancelled or completed' },
        { status: 400 },
      )
    }
    if (err.message === 'SLOT_CONFLICT') {
      return NextResponse.json(
        { success: false, error: 'Slot conflict occurred. Please select another slot.' },
        { status: 409 },
      )
    }
    console.error('Reschedule error:', error)
    return NextResponse.json({ success: false, error: 'Failed to reschedule appointment' }, { status: 500 })
  }
}
