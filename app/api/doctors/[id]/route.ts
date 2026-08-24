import { NextResponse } from 'next/server'
import { DoctorService } from '@/lib/services/doctor.service'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const doctor = await DoctorService.getDoctorById(params.id)
    return NextResponse.json({
      success: true,
      data: { doctor },
    })
  } catch (error: unknown) {
    const err = error as { message?: string }
    if (err.message === 'DOCTOR_NOT_FOUND') {
      return NextResponse.json({ success: false, error: 'Doctor not found' }, { status: 404 })
    }
    console.error('Doctor fetch error:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch doctor' }, { status: 500 })
  }
}
