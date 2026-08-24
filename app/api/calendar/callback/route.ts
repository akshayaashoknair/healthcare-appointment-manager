import { NextResponse } from 'next/server'
import { GoogleCalendarService } from '@/lib/services/google-calendar.service'
import { UserRole } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const errorParam = url.searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  if (errorParam) {
    console.warn('Google OAuth returned error:', errorParam)
    return NextResponse.redirect(`${appUrl}/?calendar_error=${encodeURIComponent(errorParam)}`)
  }

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/?calendar_error=missing_parameters`)
  }

  try {
    // 1. Verify CSRF state token
    const { userId, role } = GoogleCalendarService.verifyOAuthState(state)

    // 2. Exchange authorization code for tokens
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${appUrl}/api/calendar/callback`
    const tokenData = await GoogleCalendarService.exchangeCodeForTokens(code, redirectUri)

    // 3. Securely save connection in database
    await GoogleCalendarService.saveConnection(userId, tokenData.email, tokenData.refreshToken)

    // 4. Redirect user back to appropriate portal
    const targetPath = role === UserRole.DOCTOR ? '/doctor' : '/patient'
    return NextResponse.redirect(`${appUrl}${targetPath}?calendar_connected=true`)
  } catch (error) {
    console.error('Google Calendar OAuth callback error:', error)
    return NextResponse.redirect(`${appUrl}/?calendar_error=oauth_exchange_failed`)
  }
}
