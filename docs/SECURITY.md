# CareFlow Security & Production-Readiness Architecture

This document provides a comprehensive overview of CareFlow's security architecture, concurrency safety models, authorization boundaries, and clinical data protection policies.

---

## 1. Authentication & Session Security

### Password Hashing
- Passwords are encrypted using **Node.js `crypto.scrypt`** with a cryptographically secure 16-byte random salt generated via `crypto.randomBytes(16)`.
- Hashes are formatted as `scrypt$<salt>$<derivedKeyHex>`.
- Password verification computes the scrypt key over the stored salt and compares it using `crypto.timingSafeEqual` to eliminate timing-attack side channels.

### Session Management
- Sessions use signed **HMAC-SHA256 JWT tokens** created server-side with a strict 7-day expiration window (`exp`).
- Cookies are set as `careflow_session` with:
  - `httpOnly: true` (prevents JavaScript access and XSS token theft)
  - `sameSite: 'lax'` (mitigates Cross-Site Request Forgery / CSRF)
  - `secure: true` in production environments
  - `path: '/'`
- Signature verification on incoming requests uses constant-time `crypto.timingSafeEqual`.

---

## 2. Authorization & Role Boundaries

CareFlow enforces strict Role-Based Access Control (RBAC) across three roles:

| Role | Access Scope | Enforced By |
| :--- | :--- | :--- |
| **`PATIENT`** | Can search doctors, hold slots, book/confirm appointments, manage own appointments, view own prescriptions & AI summaries. | `requireAuth([UserRole.PATIENT])` and `appointment.patientId === session.userId` |
| **`DOCTOR`** | Can view assigned appointments and schedule, view pre-visit symptoms with AI triage, record clinical notes, write prescriptions. | `requireAuth([UserRole.DOCTOR])` and `appointment.doctorId === session.userId` |
| **`ADMIN`** | Can onboard doctors, configure operating hours & slot durations, schedule doctor leaves with automatic conflict resolution. | `requireAuth([UserRole.ADMIN])` |

---

## 3. Patient Data Privacy & Isolation

- **Horizontal Privilege Isolation**:
  - Patient A cannot view, reschedule, or cancel Patient B's appointments. Every query filters strictly by `where: { patientId: userId }` or enforces ownership equality checks returning `403 Forbidden`.
- **Doctor Schedule Isolation**:
  - Doctor A cannot view Doctor B's patient consultations or edit clinical notes.
  - Recording consultation notes requires `appointment.doctorId === session.userId`, rejecting unauthorized doctors with `403 Forbidden`.
- **Pre-Visit Symptoms Privacy**:
  - Patient symptoms are strictly bound to the specific `AppointmentHold` and `Appointment` records and are only accessible by the holding patient, the assigned doctor, and clinic administrators.

---

## 4. Booking Concurrency & Race Condition Guarantees

CareFlow prevents double-booking and slot collision using database-level concurrency protection:

```sql
-- PostgreSQL GiST exclusion constraint on active slot reservations
ALTER TABLE "SlotReservation" 
ADD CONSTRAINT "SlotReservation_active_doctor_time_excl"
EXCLUDE USING gist (
  "doctorId" WITH =,
  tstzrange("startAt", "endAt", '[)') WITH &&
)
WHERE ("status" = 'ACTIVE');
```

1. **Short-Lived 5-Minute Holds**:
   - Reserving a slot creates an `ACTIVE` `SlotReservation` of kind `HOLD` with a 5-minute expiration timer.
   - Any concurrent request for the same doctor and overlapping interval `[startAt, endAt)` immediately violates the PostgreSQL exclusion constraint, throwing error code `23P01` which CareFlow maps to `HTTP 409 Conflict`.
2. **Atomic Confirmation**:
   - Confirming a hold transitions the `SlotReservation` from kind `HOLD` to `APPOINTMENT` within an atomic database transaction.
3. **Atomic Rescheduling**:
   - Rescheduling an appointment reserves a new slot hold and updates the original appointment within a single database transaction, releasing the old reservation while holding the new one.

---

## 5. Secret Management & At-Rest Encryption

- **Environment Isolation**:
  - All sensitive credentials (`SESSION_SECRET`, `OPENAI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CRON_SECRET`, `DATABASE_URL`) are read exclusively from server-side environment variables.
- **At-Rest Token Encryption**:
  - Google OAuth refresh tokens are encrypted using **AES-256-GCM** with authenticated checksums (`iv:authTag:ciphertext`) prior to insertion into the `CalendarConnection` model.
  - Plaintext tokens are never stored and never exposed to the frontend client.

---

## 6. OAuth 2.0 Security & CSRF Defense

- Authorization URLs are generated with a signed HMAC-SHA256 CSRF state token containing `userId`, `role`, and `timestamp`.
- The OAuth callback handler verifies the state signature in constant-time and rejects states older than 15 minutes or with invalid signatures.

---

## 7. Input Validation & Defense in Depth

Every API route validates payloads with strict **Zod schemas**:
- **Slot Time Validation**: Ensures `startAt < endAt` and rejects slots in the past.
- **Symptom Input Limits**: Length constrained between 3 and 3,000 characters.
- **Working Hours**: Weekdays bounded between 0–6; `startTime < endTime` in 24h format (`HH:mm`).
- **Prescriptions**: Non-empty medication names, dosages, frequencies, and validated clinical notes (minimum 5 characters).
- **Malformed IDs**: Invalid or non-existent IDs return `404 Not Found` without leaking database internal errors.

---

## 8. Failure Handling & Non-Blocking Resilience

1. **AI Resilience**:
   - Pre-visit and post-visit AI generation failures (timeouts, network errors, invalid JSON) are recorded in `generationStatus: FAILED` with error metadata.
   - AI failures **never roll back, cancel, or invalidate** confirmed appointments or doctor consultations.
2. **Durable Notification Outbox**:
   - Notifications and reminders are persisted as `NotificationJob` records with idempotency keys.
   - Background worker processes jobs with bounded exponential backoff (`1m, 5m, 15m, 1h, 4h`) up to 5 attempts. Email delivery outages never affect appointment bookings.
3. **Google Calendar Resilience**:
   - Calendar sync operations run asynchronously in background jobs. API failures update `CalendarEventMapping` status to `FAILED` / `RETRY_SCHEDULED` and are logged for debugging without affecting core clinical workflows.
