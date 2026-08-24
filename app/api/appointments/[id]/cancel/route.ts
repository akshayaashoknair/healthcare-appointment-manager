import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { cancelAppointmentSchema } from '@/lib/validations'
import { AppointmentService } from '@/lib/services/appointment.service'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    let reason: string | undefined
    try {
      const body = await req.json()
      const validated = cancelAppointmentSchema.safeParse(body)
      if (validated.success && validated.data.reason) {
        reason = validated.data.reason
      }
    } catch {
      // Body may be empty, reason is optional
    }

    const appointment = await AppointmentService.cancelAppointment(
      params.id,
      session.userId,
      session.role,
      reason,
    )

    return NextResponse.json({
      success: true,
      data: { appointment },
    })
  } catch (error: unknown) {
    const err = error as { message?: string }
    if (err.message === 'APPOINTMENT_NOT_FOUND') {
      return NextResponse.json({ success: false, error: 'Appointment not found' }, { status: 404 })
    }
    if (err.message === 'FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'Forbidden: You cannot cancel this appointment' }, { status: 403 })
    }
    if (err.message === 'CANNOT_CANCEL_STATUS') {
      return NextResponse.json(
        { success: false, error: 'Cannot cancel an appointment that is already cancelled or completed' },
        { status: 400 },
      )
    }
    console.error('Cancel appointment error:', error)
    return NextResponse.json({ success: false, error: 'Failed to cancel appointment' }, { status: 500 })
  }
}
