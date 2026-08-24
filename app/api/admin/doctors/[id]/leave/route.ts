import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { UserRole } from '@/lib/types'
import { doctorLeaveSchema } from '@/lib/validations'
import { DoctorService } from '@/lib/services/doctor.service'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session || session.role !== UserRole.ADMIN) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Admin role required' }, { status: 403 })
    }

    const leaveDays = await DoctorService.getDoctorLeaveDays(params.id)
    return NextResponse.json({ success: true, data: { leaveDays } })
  } catch (error: unknown) {
    const err = error as { message?: string }
    if (err.message === 'DOCTOR_NOT_FOUND') {
      return NextResponse.json({ success: false, error: 'Doctor not found' }, { status: 404 })
    }
    console.error('Admin get leave error:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch doctor leave' }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session || session.role !== UserRole.ADMIN) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Admin role required' }, { status: 403 })
    }

    const body = await req.json()
    const validated = doctorLeaveSchema.safeParse(body)

    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const result = await DoctorService.addLeave(params.id, validated.data)
    return NextResponse.json({ success: true, data: result }, { status: 201 })
  } catch (error: unknown) {
    const err = error as { message?: string }
    if (err.message === 'DOCTOR_NOT_FOUND') {
      return NextResponse.json({ success: false, error: 'Doctor not found' }, { status: 404 })
    }
    console.error('Admin add leave error:', error)
    return NextResponse.json({ success: false, error: 'Failed to record doctor leave' }, { status: 500 })
  }
}
