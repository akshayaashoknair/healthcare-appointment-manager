import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AIService } from '@/lib/services/ai.service'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: params.id },
      include: {
        preVisitSummary: true,
        symptomSubmission: true,
      },
    })

    if (!appointment) {
      return NextResponse.json({ success: false, error: 'Appointment not found' }, { status: 404 })
    }

    // Role ownership check
    if (session.role === 'PATIENT' && appointment.patientId !== session.userId) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
    if (session.role === 'DOCTOR' && appointment.doctorId !== session.userId) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({
      success: true,
      data: {
        preVisitSummary: appointment.preVisitSummary,
        symptoms: appointment.symptomSubmission?.symptoms || null,
      },
    })
  } catch (error) {
    console.error('Fetch pre-visit summary error:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch pre-visit summary' }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: params.id },
      include: {
        symptomSubmission: true,
      },
    })

    if (!appointment) {
      return NextResponse.json({ success: false, error: 'Appointment not found' }, { status: 404 })
    }

    if (!appointment.symptomSubmission?.symptoms) {
      return NextResponse.json({ success: false, error: 'No symptoms submitted for this appointment' }, { status: 400 })
    }

    const summary = await AIService.generatePreVisitSummary(
      appointment.id,
      appointment.symptomSubmission.symptoms,
    )

    return NextResponse.json({ success: true, data: { preVisitSummary: summary } })
  } catch (error) {
    console.error('Retry pre-visit summary error:', error)
    return NextResponse.json({ success: false, error: 'Failed to generate pre-visit summary' }, { status: 500 })
  }
}
