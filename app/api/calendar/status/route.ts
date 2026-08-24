import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { GoogleCalendarService } from '@/lib/services/google-calendar.service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const status = await GoogleCalendarService.getConnectionStatus(session.userId)
    return NextResponse.json({ success: true, data: status })
  } catch (error) {
    console.error('Fetch calendar status error:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch calendar status' }, { status: 500 })
  }
}
