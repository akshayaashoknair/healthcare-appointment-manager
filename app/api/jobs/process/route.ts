import { NextResponse } from 'next/server'
import { NotificationService } from '@/lib/services/notification.service'

export const dynamic = 'force-dynamic'

async function handleJobProcessing(req: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim()

  if (cronSecret) {
    const authHeader = req.headers.get('authorization')
    const secretParam = new URL(req.url).searchParams.get('secret')
    const providedSecret = authHeader?.replace('Bearer ', '') || secretParam

    if (providedSecret !== cronSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Invalid cron secret' }, { status: 401 })
    }
  }

  try {
    // 1. Scan and queue appointment reminders for next 24h
    const appointmentRemindersQueued = await NotificationService.queueUpcomingAppointmentReminders()

    // 2. Scan and queue medication reminders for active prescriptions
    const medicationRemindersQueued = await NotificationService.queueActiveMedicationReminders()

    // 3. Process pending notification outbox jobs
    const batchResult = await NotificationService.processPendingJobs(50)

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        appointmentRemindersQueued,
        medicationRemindersQueued,
        jobsProcessed: batchResult.processed,
        jobsSucceeded: batchResult.succeeded,
        jobsRetried: batchResult.retried,
        jobsFailed: batchResult.failed,
      },
    })
  } catch (error) {
    console.error('Job processing error:', error)
    return NextResponse.json({ success: false, error: 'Failed to process jobs' }, { status: 500 })
  }
}

export async function GET(req: Request) {
  return handleJobProcessing(req)
}

export async function POST(req: Request) {
  return handleJobProcessing(req)
}
