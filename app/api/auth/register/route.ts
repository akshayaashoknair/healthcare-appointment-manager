import { NextResponse } from 'next/server'
import { registerSchema } from '@/lib/validations'
import { AuthService } from '@/lib/services/auth.service'
import { getSessionCookieName } from '@/lib/auth'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const validatedData = registerSchema.safeParse(body)

    if (!validatedData.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validatedData.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { user, token } = await AuthService.registerPatient(validatedData.data)

    const response = NextResponse.json({ success: true, data: { user } }, { status: 201 })
    response.cookies.set({
      name: getSessionCookieName(),
      value: token,
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60,
    })

    return response
  } catch (error: unknown) {
    const err = error as { message?: string }
    if (err.message === 'EMAIL_EXISTS') {
      return NextResponse.json(
        { success: false, error: 'An account with this email address already exists' },
        { status: 400 },
      )
    }
    console.error('Registration error:', error)
    return NextResponse.json({ success: false, error: 'Failed to register account' }, { status: 500 })
  }
}
