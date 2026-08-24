import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { UserRole } from '@/lib/types'
import { doctorCreateSchema } from '@/lib/validations'
import { DoctorService } from '@/lib/services/doctor.service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== UserRole.ADMIN) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Admin role required' }, { status: 403 })
    }

    const doctors = await DoctorService.getDoctors()
    return NextResponse.json({ success: true, data: { doctors } })
  } catch (error) {
    console.error('Admin get doctors error:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch doctors' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== UserRole.ADMIN) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Admin role required' }, { status: 403 })
    }

    const body = await req.json()
    const validated = doctorCreateSchema.safeParse(body)

    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const doctor = await DoctorService.createDoctor(validated.data)
    return NextResponse.json({ success: true, data: { doctor } }, { status: 201 })
  } catch (error: unknown) {
    const err = error as { message?: string }
    if (err.message === 'EMAIL_EXISTS') {
      return NextResponse.json({ success: false, error: 'Doctor with this email already exists' }, { status: 400 })
    }
    console.error('Admin create doctor error:', error)
    return NextResponse.json({ success: false, error: 'Failed to create doctor' }, { status: 500 })
  }
}
