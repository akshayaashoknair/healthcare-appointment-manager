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

    const authUrl = GoogleCalendarService.getAuthorizationUrl(session.userId, session.role)
    return NextResponse.redirect(authUrl)
  } catch (error) {
    console.error('Google Calendar connect error:', error)
    return NextResponse.json({ success: false, error: 'Failed to initiate Google Calendar connection' }, { status: 500 })
  }
}
