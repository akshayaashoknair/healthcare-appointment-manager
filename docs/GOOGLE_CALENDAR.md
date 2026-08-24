# Google Calendar Integration Guide

CareFlow integrates with Google Calendar to provide real-time synchronization of confirmed appointments, rescheduling updates, and cancellations for both patients and doctors.

---

## 1. Google Cloud Console Setup

1. **Create a Google Cloud Project**:
   - Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
   - Click **Select a project** > **New Project**.
   - Name the project `CareFlow-Healthcare` and click **Create**.

2. **Enable Google Calendar API**:
   - In the API Library (**APIs & Services** > **Library**), search for **Google Calendar API**.
   - Click **Enable**.
   - Also enable **Google People API** (or UserInfo) for email verification.

---

## 2. OAuth Consent Screen Configuration

1. In the sidebar, navigate to **APIs & Services** > **OAuth consent screen**.
2. Select **External** (or **Internal** if using Google Workspace).
3. Fill in the App Information:
   - **App name**: `CareFlow Healthcare Appointment Manager`
   - **User support email**: `support@careflow.com`
   - **Developer contact information**: `admin@careflow.com`
4. Add the required OAuth scopes:
   - `https://www.googleapis.com/auth/calendar.events` (Manage calendar events)
   - `https://www.googleapis.com/auth/userinfo.email` (Read user email)
5. Under **Test users**, add the email addresses of doctors/patients testing in development.

---

## 3. Create OAuth 2.0 Credentials

1. Go to **APIs & Services** > **Credentials**.
2. Click **Create Credentials** > **OAuth client ID**.
3. Select **Application type**: **Web application**.
4. Configure URIs:
   - **Authorized JavaScript origins**:
     - Development: `http://localhost:3000`
     - Production: `https://your-careflow-domain.com`
   - **Authorized redirect URIs**:
     - Development: `http://localhost:3000/api/calendar/callback`
     - Production: `https://your-careflow-domain.com/api/calendar/callback`
5. Click **Create** and securely copy the generated **Client ID** and **Client Secret**.

---

## 4. Environment Variables

Add the following keys to your `.env` file (see `.env.example`):

```bash
# Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Session Secret (used for token encryption & CSRF state verification)
SESSION_SECRET=careflow-super-secure-session-secret-32-chars

# Google OAuth Credentials
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/calendar/callback
```

---

## 5. Security Architecture

1. **CSRF State Verification**:
   - The authorization URL is generated with a signed HMAC-SHA256 state token containing the `userId`, `role`, and `timestamp`.
   - Callbacks with missing, expired (>15 min), or tampered states are rejected.

2. **At-Rest Token Encryption**:
   - Google refresh tokens are encrypted using **AES-256-GCM** before database storage in `CalendarConnection`.
   - Raw tokens are never sent to the frontend client.

3. **Asynchronous & Resilient Synchronization**:
   - Booking confirmation, rescheduling, and cancellation trigger asynchronous calendar synchronization.
   - Failures to connect to Google APIs are logged in `CalendarEventMapping` with status `FAILED` or `RETRY_SCHEDULED` and **never roll back the core appointment transaction**.

4. **Idempotency**:
   - Calendar sync mappings use unique database keys (`appointmentId_calendarConnectionId`), preventing duplicate event creation across retries.

---

## 6. Doctor Leave Conflict Management

When an Admin schedules leave for a doctor:
1. All future confirmed appointments overlapping the leave interval `[startAt, endAt)` are identified transactionally.
2. Affected appointments are marked `CANCELLED` with reason `Doctor on leave: <reason>`.
3. The underlying `SlotReservation` is immediately released.
4. Durable patient notification jobs (`DOCTOR_LEAVE`) are enqueued.
5. Linked Google Calendar events for both the patient and doctor are automatically queued for deletion.
6. The leave date is excluded from future availability slot generation.

---

## 7. Local Development & Testing

When `GOOGLE_CLIENT_ID` is omitted or contains `mock`, CareFlow operates in **development mock mode**:
- The OAuth flow generates simulated tokens and stores mock connections.
- Appointment events are mapped and marked `SYNCED` without requiring real Google Cloud credentials.
- The automated test suite (`npm test`) executes all verification scenarios using mocked Google APIs.
