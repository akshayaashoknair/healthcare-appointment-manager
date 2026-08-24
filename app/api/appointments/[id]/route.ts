import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { AppointmentService } from '@/lib/services/appointment.service'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const appointment = await AppointmentService.getAppointmentById(
      params.id,
      session.userId,
      session.role,
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
      return NextResponse.json({ success: false, error: 'Access denied: You are not authorized to view this appointment' }, { status: 403 })
    }
    console.error('Fetch appointment error:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch appointment details' }, { status: 500 })
  }
}
