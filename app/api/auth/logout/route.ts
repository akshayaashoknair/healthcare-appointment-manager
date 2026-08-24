import { NextResponse } from 'next/server'
import { getSessionCookieName } from '@/lib/auth'

export async function POST() {
  const response = NextResponse.json({ success: true, message: 'Logged out successfully' })
  response.cookies.set({
    name: getSessionCookieName(),
    value: '',
    httpOnly: true,
    path: '/',
    maxAge: 0,
  })
  return response
}
