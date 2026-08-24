import { NextResponse } from 'next/server'
import { AvailabilityService } from '@/lib/services/availability.service'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date')

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { success: false, error: 'A valid date parameter in YYYY-MM-DD format is required' },
        { status: 400 },
      )
    }

    const slots = await AvailabilityService.getDoctorAvailableSlots(params.id, date)

    return NextResponse.json({
      success: true,
      data: { slots },
    })
  } catch (error) {
    console.error('Doctor slots error:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch available slots' }, { status: 500 })
  }
}
