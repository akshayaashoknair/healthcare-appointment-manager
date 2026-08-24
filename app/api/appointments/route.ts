import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { AppointmentStatus } from '@/lib/types'
import { AppointmentService } from '@/lib/services/appointment.service'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const statusParam = searchParams.get('status') as AppointmentStatus | null
    const upcomingParam = searchParams.get('upcoming') === 'true'

    const appointments = await AppointmentService.getAppointments(session.userId, session.role, {
      status: statusParam || undefined,
      upcoming: upcomingParam,
    })

    return NextResponse.json({
      success: true,
      data: { appointments },
    })
  } catch (error) {
    console.error('Fetch appointments error:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch appointments' }, { status: 500 })
  }
}
