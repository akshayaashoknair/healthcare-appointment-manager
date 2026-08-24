import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { GoogleCalendarService } from '@/lib/services/google-calendar.service'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    await GoogleCalendarService.disconnect(session.userId)
    return NextResponse.json({ success: true, message: 'Google Calendar disconnected successfully' })
  } catch (error) {
    console.error('Disconnect calendar error:', error)
    return NextResponse.json({ success: false, error: 'Failed to disconnect calendar' }, { status: 500 })
  }
}
