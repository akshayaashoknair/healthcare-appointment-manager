const { NotificationService } = require('../.test-dist/lib/services/notification.service')

const POLL_INTERVAL_MS = 10000 // 10 seconds

async function runWorkerLoop() {
  console.log('[CareFlow Worker] Background notification & reminder worker started...')

  while (true) {
    try {
      // 1. Queue reminders
      await NotificationService.queueUpcomingAppointmentReminders()
      await NotificationService.queueActiveMedicationReminders()

      // 2. Process pending jobs
      const result = await NotificationService.processPendingJobs(20)
      if (result.processed > 0) {
        console.log(
          `[CareFlow Worker] Processed ${result.processed} jobs: ${result.succeeded} sent, ${result.retried} retry-scheduled, ${result.failed} failed`,
        )
      }
    } catch (err) {
      console.error('[CareFlow Worker] Loop error:', err)
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
}

if (require.main === module) {
  runWorkerLoop()
}
