import { NextResponse } from 'next/server'
import { loginSchema } from '@/lib/validations'
import { AuthService } from '@/lib/services/auth.service'
import { getSessionCookieName } from '@/lib/auth'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const validatedData = loginSchema.safeParse(body)

    if (!validatedData.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validatedData.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { user, token } = await AuthService.login(validatedData.data)

    const response = NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          patientProfile: user.patientProfile,
          doctorProfile: user.doctorProfile,
        },
      },
    })

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
    if (err.message === 'INVALID_CREDENTIALS') {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 },
      )
    }
    console.error('Login error:', error)
    return NextResponse.json({ success: false, error: 'Failed to sign in' }, { status: 500 })
  }
}
