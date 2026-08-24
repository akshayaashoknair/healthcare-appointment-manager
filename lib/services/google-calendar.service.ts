import crypto from 'node:crypto'
import { prisma } from '../prisma'
import { CalendarSyncStatus, UserRole } from '../types'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3'
const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

const ENCRYPTION_KEY = (process.env.SESSION_SECRET || 'careflow-super-secure-encryption-key-32-chars!').slice(0, 32).padEnd(32, '0')
const IV_LENGTH = 16

export class GoogleCalendarService {
  /**
   * Encrypts refresh tokens at rest using AES-256-GCM.
   */
  static encryptToken(token: string): string {
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY), iv)
    let encrypted = cipher.update(token, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    const authTag = cipher.getAuthTag().toString('hex')
    return `${iv.toString('hex')}:${authTag}:${encrypted}`
  }

  /**
   * Decrypts refresh tokens for authorized server-side API calls.
   */
  static decryptToken(encryptedData: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedData.split(':')
    if (!ivHex || !authTagHex || !encrypted) {
      throw new Error('INVALID_ENCRYPTED_TOKEN_FORMAT')
    }
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY), iv)
    decipher.setAuthTag(authTag)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  }

  /**
   * Generates a signed CSRF state token for the OAuth 2.0 authorization code flow.
   */
  static generateOAuthState(userId: string, role: UserRole): string {
    const timestamp = Date.now().toString()
    const payload = `${userId}:${role}:${timestamp}`
    const secret = process.env.SESSION_SECRET || 'careflow-oauth-state-secret'
    const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex')
    return Buffer.from(`${payload}:${hmac}`).toString('base64url')
  }

  /**
   * Validates OAuth state token to protect against CSRF attacks.
   */
  static verifyOAuthState(state: string): { userId: string; role: UserRole } {
    try {
      const decoded = Buffer.from(state, 'base64url').toString('utf8')
      const [userId, role, timestamp, hmac] = decoded.split(':')
      if (!userId || !role || !timestamp || !hmac) {
        throw new Error('INVALID_STATE')
      }

      // Check expiration (15 minutes)
      const age = Date.now() - parseInt(timestamp, 10)
      if (age > 15 * 60 * 1000) {
        throw new Error('EXPIRED_STATE')
      }

      // Verify HMAC
      const secret = process.env.SESSION_SECRET || 'careflow-oauth-state-secret'
      const expectedHmac = crypto
        .createHmac('sha256', secret)
        .update(`${userId}:${role}:${timestamp}`)
        .digest('hex')

      if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) {
        throw new Error('STATE_HMAC_MISMATCH')
      }

      return { userId, role: role as UserRole }
    } catch {
      throw new Error('CSRF_STATE_VERIFICATION_FAILED')
    }
  }

  /**
   * Constructs the Google OAuth authorization URL.
   */
  static getAuthorizationUrl(userId: string, role: UserRole): string {
    const clientId = process.env.GOOGLE_CLIENT_ID || 'mock-google-client-id'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${appUrl}/api/calendar/callback`
    const state = this.generateOAuthState(userId, role)

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: CALENDAR_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state,
    })

    return `${GOOGLE_AUTH_URL}?${params.toString()}`
  }

  /**
   * Exchanges authorization code for refresh and access tokens.
   */
  static async exchangeCodeForTokens(code: string, redirectUri: string) {
    const clientId = process.env.GOOGLE_CLIENT_ID || ''
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || ''

    if (!clientId || !clientSecret || clientId.includes('mock')) {
      // Mock exchange for local development/testing without live Google credentials
      return {
        accessToken: `mock_access_${Date.now()}`,
        refreshToken: `mock_refresh_${Date.now()}`,
        email: `google.user.${Date.now()}@example.com`,
      }
    }

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Google token exchange failed (${response.status}): ${errorText}`)
    }

    const data = await response.json()

    // Fetch user profile email
    let email = 'connected-calendar@careflow.com'
    try {
      const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${data.access_token}` },
      })
      if (userinfoRes.ok) {
        const userInfo = await userinfoRes.json()
        if (userInfo.email) email = userInfo.email
      }
    } catch {
      // Fallback
    }

    return {
      accessToken: data.access_token as string,
      refreshToken: (data.refresh_token as string) || '',
      email,
    }
  }

  /**
   * Saves or updates a Google Calendar connection for a user.
   */
  static async saveConnection(userId: string, email: string, refreshToken: string) {
    const encryptedRefreshToken = this.encryptToken(refreshToken)

    return prisma.calendarConnection.upsert({
      where: {
        userId_googleAccountEmail: {
          userId,
          googleAccountEmail: email,
        },
      },
      update: {
        encryptedRefreshToken,
        updatedAt: new Date(),
      },
      create: {
        userId,
        googleAccountEmail: email,
        encryptedRefreshToken,
      },
    })
  }

  /**
   * Disconnects a user's Google Calendar.
   */
  static async disconnect(userId: string) {
    return prisma.calendarConnection.deleteMany({
      where: { userId },
    })
  }

  /**
   * Gets connection metadata (excluding raw tokens).
   */
  static async getConnectionStatus(userId: string) {
    const connection = await prisma.calendarConnection.findFirst({
      where: { userId },
      select: {
        id: true,
        googleAccountEmail: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return {
      connected: Boolean(connection),
      connection,
    }
  }

  /**
   * Refreshes access token using the stored encrypted refresh token.
   */
  static async getAccessToken(encryptedRefreshToken: string): Promise<string> {
    const clientId = process.env.GOOGLE_CLIENT_ID || ''
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || ''

    if (!clientId || !clientSecret || clientId.includes('mock')) {
      return `mock_access_${Date.now()}`
    }

    const refreshToken = this.decryptToken(encryptedRefreshToken)

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Token refresh failed (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    return data.access_token as string
  }

  /**
   * Synchronizes an appointment creation event to Google Calendar for a user.
   */
  static async syncAppointmentCreated(appointmentId: string, userId: string): Promise<void> {
    const connection = await prisma.calendarConnection.findFirst({
      where: { userId },
    })

    if (!connection) return // User has not linked Google Calendar

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        doctor: { include: { doctorProfile: true } },
        patient: { include: { patientProfile: true } },
      },
    })

    if (!appointment || appointment.status === 'CANCELLED') return

    // Ensure mapping record exists in PENDING state
    const mapping = await prisma.calendarEventMapping.upsert({
      where: {
        appointmentId_calendarConnectionId: {
          appointmentId,
          calendarConnectionId: connection.id,
        },
      },
      update: { syncStatus: CalendarSyncStatus.PENDING, lastError: null },
      create: {
        appointmentId,
        calendarConnectionId: connection.id,
        syncStatus: CalendarSyncStatus.PENDING,
      },
    })

    // If already has googleEventId, it was already created (Idempotency guarantee)
    if (mapping.googleEventId && mapping.syncStatus === CalendarSyncStatus.SYNCED) {
      return
    }

    try {
      const doctorName = appointment.doctor.doctorProfile
        ? `Dr. ${appointment.doctor.doctorProfile.firstName} ${appointment.doctor.doctorProfile.lastName}`
        : appointment.doctor.email
      const patientName = appointment.patient.patientProfile
        ? `${appointment.patient.patientProfile.firstName} ${appointment.patient.patientProfile.lastName}`
        : appointment.patient.email

      const isDoctor = userId === appointment.doctorId
      const summary = isDoctor
        ? `CareFlow Consultation: ${patientName}`
        : `CareFlow Appointment: ${doctorName}`

      const eventPayload = {
        summary,
        description: `Healthcare consultation scheduled via CareFlow Healthcare.\nDoctor: ${doctorName}\nPatient: ${patientName}`,
        start: { dateTime: appointment.startAt.toISOString() },
        end: { dateTime: appointment.endAt.toISOString() },
      }

      let googleEventId = `gcal_evt_${appointment.id}_${connection.id}`

      const clientId = process.env.GOOGLE_CLIENT_ID || ''
      if (clientId && !clientId.includes('mock')) {
        const accessToken = await this.getAccessToken(connection.encryptedRefreshToken)
        const res = await fetch(`${GOOGLE_CALENDAR_API_URL}/calendars/primary/events`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(eventPayload),
        })

        if (!res.ok) {
          const errText = await res.text()
          throw new Error(`Google Calendar API event creation failed (${res.status}): ${errText}`)
        }

        const data = await res.json()
        googleEventId = data.id || googleEventId
      }

      await prisma.calendarEventMapping.update({
        where: { id: mapping.id },
        data: {
          googleEventId,
          syncStatus: CalendarSyncStatus.SYNCED,
          lastError: null,
        },
      })
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.warn(`[GoogleCalendar] Failed to sync created event for appointment ${appointmentId}:`, errMsg)

      await prisma.calendarEventMapping.update({
        where: { id: mapping.id },
        data: {
          syncStatus: CalendarSyncStatus.FAILED,
          lastError: errMsg,
        },
      })
    }
  }

  /**
   * Synchronizes an appointment reschedule event to Google Calendar for a user.
   */
  static async syncAppointmentRescheduled(appointmentId: string, userId: string): Promise<void> {
    const connection = await prisma.calendarConnection.findFirst({
      where: { userId },
    })

    if (!connection) return

    const mapping = await prisma.calendarEventMapping.findUnique({
      where: {
        appointmentId_calendarConnectionId: {
          appointmentId,
          calendarConnectionId: connection.id,
        },
      },
    })

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
    })

    if (!appointment) return

    if (!mapping || !mapping.googleEventId) {
      // Not yet created -> create it
      return this.syncAppointmentCreated(appointmentId, userId)
    }

    try {
      const clientId = process.env.GOOGLE_CLIENT_ID || ''
      if (clientId && !clientId.includes('mock')) {
        const accessToken = await this.getAccessToken(connection.encryptedRefreshToken)
        const res = await fetch(`${GOOGLE_CALENDAR_API_URL}/calendars/primary/events/${mapping.googleEventId}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            start: { dateTime: appointment.startAt.toISOString() },
            end: { dateTime: appointment.endAt.toISOString() },
          }),
        })

        if (!res.ok && res.status !== 404) {
          const errText = await res.text()
          throw new Error(`Google Calendar API event update failed (${res.status}): ${errText}`)
        }
      }

      await prisma.calendarEventMapping.update({
        where: { id: mapping.id },
        data: {
          syncStatus: CalendarSyncStatus.SYNCED,
          lastError: null,
        },
      })
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.warn(`[GoogleCalendar] Failed to sync reschedule event for appointment ${appointmentId}:`, errMsg)

      await prisma.calendarEventMapping.update({
        where: { id: mapping.id },
        data: {
          syncStatus: CalendarSyncStatus.FAILED,
          lastError: errMsg,
        },
      })
    }
  }

  /**
   * Synchronizes an appointment cancellation/deletion to Google Calendar for a user.
   */
  static async syncAppointmentCancelled(appointmentId: string, userId: string): Promise<void> {
    const connection = await prisma.calendarConnection.findFirst({
      where: { userId },
    })

    if (!connection) return

    const mapping = await prisma.calendarEventMapping.findUnique({
      where: {
        appointmentId_calendarConnectionId: {
          appointmentId,
          calendarConnectionId: connection.id,
        },
      },
    })

    if (!mapping || !mapping.googleEventId) return

    try {
      const clientId = process.env.GOOGLE_CLIENT_ID || ''
      if (clientId && !clientId.includes('mock')) {
        const accessToken = await this.getAccessToken(connection.encryptedRefreshToken)
        const res = await fetch(`${GOOGLE_CALENDAR_API_URL}/calendars/primary/events/${mapping.googleEventId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        })

        if (!res.ok && res.status !== 404 && res.status !== 410) {
          const errText = await res.text()
          throw new Error(`Google Calendar API event deletion failed (${res.status}): ${errText}`)
        }
      }

      // Mark synced / deleted
      await prisma.calendarEventMapping.update({
        where: { id: mapping.id },
        data: {
          syncStatus: CalendarSyncStatus.SYNCED,
          lastError: null,
        },
      })
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.warn(`[GoogleCalendar] Failed to delete event for appointment ${appointmentId}:`, errMsg)

      await prisma.calendarEventMapping.update({
        where: { id: mapping.id },
        data: {
          syncStatus: CalendarSyncStatus.FAILED,
          lastError: errMsg,
        },
      })
    }
  }
}
