import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { UserRole } from '@/lib/types'
import { consultationSubmitSchema } from '@/lib/validations'
import { ConsultationService } from '@/lib/services/consultation.service'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const consultation = await ConsultationService.getConsultation(
      params.id,
      session.userId,
      session.role,
    )

    if (!consultation) {
      return NextResponse.json({ success: false, error: 'Consultation not found or not yet recorded' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: { consultation } })
  } catch (error: unknown) {
    const err = error as { message?: string }
    if (err.message === 'APPOINTMENT_NOT_FOUND') {
      return NextResponse.json({ success: false, error: 'Appointment not found' }, { status: 404 })
    }
    if (err.message === 'FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'Forbidden: Access denied to this consultation' }, { status: 403 })
    }
    console.error('Fetch consultation error:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch consultation details' }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session || session.role !== UserRole.DOCTOR) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Doctor role required' }, { status: 403 })
    }

    const body = await req.json()
    const validated = consultationSubmitSchema.safeParse(body)

    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const consultation = await ConsultationService.submitConsultation(
      session.userId,
      params.id,
      validated.data,
    )

    return NextResponse.json({ success: true, data: { consultation } }, { status: 201 })
  } catch (error: unknown) {
    const err = error as { message?: string }
    if (err.message === 'FORBIDDEN_NOT_ASSIGNED_DOCTOR') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Only the assigned doctor can record consultations for this appointment' },
        { status: 403 },
      )
    }
    if (err.message === 'CANNOT_CONSULT_CANCELLED_APPOINTMENT') {
      return NextResponse.json(
        { success: false, error: 'Cannot record consultation for a cancelled appointment' },
        { status: 400 },
      )
    }
    if (err.message === 'CONSULTATION_ALREADY_COMPLETED') {
      return NextResponse.json(
        { success: false, error: 'Consultation notes have already been submitted for this appointment' },
        { status: 409 },
      )
    }
    if (err.message === 'APPOINTMENT_NOT_FOUND') {
      return NextResponse.json({ success: false, error: 'Appointment not found' }, { status: 404 })
    }
    console.error('Submit consultation error:', error)
    return NextResponse.json({ success: false, error: 'Failed to record consultation' }, { status: 500 })
  }
}
