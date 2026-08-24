import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { UserRole } from '@/lib/types'
import { doctorWorkingHoursSchema } from '@/lib/validations'
import { DoctorService } from '@/lib/services/doctor.service'

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session || session.role !== UserRole.ADMIN) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Admin role required' }, { status: 403 })
    }

    const body = await req.json()
    const validated = doctorWorkingHoursSchema.safeParse(body)

    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const updatedHours = await DoctorService.setWorkingHours(params.id, validated.data)
    return NextResponse.json({ success: true, data: { workingHours: updatedHours } })
  } catch (error: unknown) {
    const err = error as { message?: string }
    if (err.message === 'DOCTOR_NOT_FOUND') {
      return NextResponse.json({ success: false, error: 'Doctor not found' }, { status: 404 })
    }
    console.error('Admin set working hours error:', error)
    return NextResponse.json({ success: false, error: 'Failed to update working hours' }, { status: 500 })
  }
}
