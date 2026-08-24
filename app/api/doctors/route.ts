import { NextResponse } from 'next/server'
import { DoctorService } from '@/lib/services/doctor.service'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const specialisation = searchParams.get('specialisation') || undefined

    // For public / patient discovery, only show active doctors
    const doctors = await DoctorService.getDoctors({
      specialisation,
      isActive: true,
    })

    return NextResponse.json({
      success: true,
      data: { doctors },
    })
  } catch (error) {
    console.error('Doctors search error:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch doctors' }, { status: 500 })
  }
}
