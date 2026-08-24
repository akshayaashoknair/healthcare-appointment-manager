# CareFlow API Reference Documentation

All CareFlow API endpoints adhere to JSON-based request and response conventions. All timestamps are transmitted in ISO 8601 UTC format.

---

## Response Envelope Convention

### Success Response
```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Human-readable error description",
  "details": { ... } // Optional validation field errors
}
```

---

## 1. Authentication Endpoints

### `POST /api/auth/register`
- **Auth**: Public
- **Description**: Registers a new patient account.
- **Request Body**:
  ```json
  {
    "email": "patient@example.com",
    "password": "SecurePassword123!",
    "firstName": "Jane",
    "lastName": "Doe",
    "phone": "+919876543210"
  }
  ```
- **Response**: `201 Created` with user payload and sets `careflow_session` HTTP-only cookie.
- **Errors**: `400 Bad Request` (Validation error), `409 Conflict` (`EMAIL_ALREADY_EXISTS`).

### `POST /api/auth/login`
- **Auth**: Public
- **Description**: Authenticates user and issues session cookie.
- **Request Body**:
  ```json
  {
    "email": "patient@example.com",
    "password": "SecurePassword123!"
  }
  ```
- **Response**: `200 OK` with user profile and sets `careflow_session` cookie.
- **Errors**: `401 Unauthorized` (`INVALID_CREDENTIALS`).

### `POST /api/auth/logout`
- **Auth**: Public / Authenticated
- **Description**: Clears the session cookie.
- **Response**: `200 OK` (`{ "success": true, "message": "Logged out successfully" }`).

### `GET /api/auth/me`
- **Auth**: Authenticated (`PATIENT`, `DOCTOR`, `ADMIN`)
- **Description**: Returns current authenticated user and profile.
- **Response**: `200 OK` with session details.
- **Errors**: `401 Unauthorized`.

---

## 2. Doctor & Availability Endpoints

### `GET /api/doctors`
- **Auth**: Public / Authenticated
- **Query Parameters**:
  - `specialisation` *(optional)*: Filter by specialty (e.g. `Cardiology`).
- **Response**: `200 OK` with list of active doctors.

### `GET /api/doctors/[id]`
- **Auth**: Public / Authenticated
- **Description**: Returns doctor profile, working hours, and slot duration.
- **Response**: `200 OK`.
- **Errors**: `404 Not Found`.

### `GET /api/doctors/[id]/slots`
- **Auth**: Public / Authenticated
- **Query Parameters**:
  - `date` *(required)*: `YYYY-MM-DD` string in clinic timezone (`Asia/Kolkata`).
- **Description**: Computes available and held slot intervals for the specified doctor and date.
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "date": "2026-09-01",
      "slots": [
        {
          "startAt": "2026-09-01T04:30:00.000Z",
          "endAt": "2026-09-01T05:00:00.000Z",
          "available": true,
          "doctorId": "doc_123"
        }
      ]
    }
  }
  ```

---

## 3. Slot Holds & Booking Endpoints

### `POST /api/appointments/holds`
- **Auth**: `PATIENT`
- **Description**: Creates a short-lived 5-minute concurrency hold on a slot and records symptoms.
- **Request Body**:
  ```json
  {
    "doctorId": "doc_123",
    "startAt": "2026-09-01T04:30:00.000Z",
    "endAt": "2026-09-01T05:00:00.000Z",
    "symptoms": "Mild fever and chest tightness since yesterday morning."
  }
  ```
- **Response**: `201 Created` with hold object and expiration timestamp.
- **Errors**:
  - `400 Bad Request` (Validation or slot in past)
  - `404 Not Found` (Doctor not found or inactive)
  - `409 Conflict` (`SLOT_CONFLICT` / `DOCTOR_ON_LEAVE`)

### `POST /api/appointments/holds/[id]/confirm`
- **Auth**: `PATIENT` (Owner)
- **Description**: Confirms an active slot hold into a confirmed appointment.
- **Response**: `200 OK` with confirmed appointment object.
- **Errors**:
  - `403 Forbidden` (User does not own hold)
  - `404 Not Found` (Hold not found)
  - `409 Conflict` (`HOLD_EXPIRED` / `SLOT_CONFLICT`)

---

## 4. Appointment Lifecycle Endpoints

### `GET /api/appointments`
- **Auth**: Authenticated
- **Query Parameters**:
  - `status` *(optional)*: `CONFIRMED`, `CANCELLED`, `COMPLETED`
  - `upcoming` *(optional)*: `true` | `false`
- **Description**: Returns appointments scoped to the user's role (Patients see own, Doctors see assigned, Admins see all).
- **Response**: `200 OK`.

### `GET /api/appointments/[id]`
- **Auth**: Authenticated (Patient owner, assigned Doctor, or Admin)
- **Description**: Retrieves single appointment details including symptoms, pre-visit AI summary, consultation notes, and prescription.
- **Response**: `200 OK`.
- **Errors**: `403 Forbidden`, `404 Not Found`.

### `POST /api/appointments/[id]/cancel`
- **Auth**: Authenticated (Patient owner, assigned Doctor, or Admin)
- **Request Body**:
  ```json
  {
    "reason": "Personal conflict"
  }
  ```
- **Response**: `200 OK` with updated appointment.
- **Errors**: `400 Bad Request` (`CANNOT_CANCEL_STATUS`), `403 Forbidden`, `404 Not Found`.

### `POST /api/appointments/[id]/reschedule`
- **Auth**: `PATIENT` (Owner)
- **Description**: Atomically transitions appointment to a new held slot in a single database transaction.
- **Request Body**:
  ```json
  {
    "newHoldId": "hold_456"
  }
  ```
- **Response**: `200 OK` with updated appointment.
- **Errors**: `400 Bad Request`, `403 Forbidden`, `404 Not Found`, `409 Conflict` (`HOLD_EXPIRED` / `SLOT_CONFLICT`).

---

## 5. Clinical Consultation & AI Endpoints

### `POST /api/appointments/[id]/consultation`
- **Auth**: `DOCTOR` (Must be the assigned doctor)
- **Description**: Records clinical notes and prescription, transitions appointment to `COMPLETED`, releases slot reservation, and triggers post-visit AI care summary.
- **Request Body**:
  ```json
  {
    "clinicalNotes": "Patient presented with viral bronchitis. Clear lungs upon auscultation.",
    "instructions": "Hydrate well and rest for 3 days.",
    "followUpInformation": "Follow-up in 7 days if cough persists.",
    "medications": [
      {
        "name": "Amoxicillin",
        "dosage": "500mg",
        "frequency": "Twice daily after food",
        "reminderTime": "08:00 AM",
        "instructions": "Complete full 5-day course"
      }
    ]
  }
  ```
- **Response**: `201 Created` with saved consultation and prescription.
- **Errors**: `400 Bad Request`, `403 Forbidden` (`FORBIDDEN_NOT_ASSIGNED_DOCTOR`), `409 Conflict` (`CONSULTATION_ALREADY_COMPLETED`).

### `POST /api/appointments/[id]/pre-visit-summary`
- **Auth**: `DOCTOR` / `ADMIN`
- **Description**: Manually re-triggers pre-visit AI urgency evaluation and clinical questions.
- **Response**: `200 OK` with generated pre-visit summary.
- **Errors**: `404 Not Found`, `500 Internal Server Error`.

---

## 6. Admin Endpoints

### `POST /api/admin/doctors`
- **Auth**: `ADMIN`
- **Description**: Onboards a new doctor with profile, working hours, and slot duration.
- **Response**: `201 Created`.

### `PATCH /api/admin/doctors/[id]`
- **Auth**: `ADMIN`
- **Description**: Updates doctor profile fields or toggles active status.
- **Response**: `200 OK`.

### `PUT /api/admin/doctors/[id]/working-hours`
- **Auth**: `ADMIN`
- **Description**: Replaces weekly working hours intervals (weekdays 0–6).
- **Request Body**:
  ```json
  [
    { "weekday": 1, "startTime": "09:00", "endTime": "17:00" },
    { "weekday": 2, "startTime": "09:00", "endTime": "17:00" }
  ]
  ```
- **Response**: `200 OK`.

### `POST /api/admin/doctors/[id]/leave`
- **Auth**: `ADMIN`
- **Description**: Schedules doctor leave and transactionally cancels overlapping confirmed appointments, releasing reservations and enqueueing notifications.
- **Request Body**:
  ```json
  {
    "startAt": "2026-09-10T00:00:00.000Z",
    "endAt": "2026-09-12T23:59:59.000Z",
    "reason": "Annual Medical Conference"
  }
  ```
- **Response**: `201 Created` with leave details and `affectedAppointmentsCount`.

---

## 7. Google Calendar Endpoints

### `GET /api/calendar/connect`
- **Auth**: `PATIENT` / `DOCTOR`
- **Description**: Generates a CSRF-signed OAuth state and redirects to Google's consent screen.

### `GET /api/calendar/callback`
- **Auth**: Public callback
- **Description**: Validates OAuth state token, exchanges code for encrypted refresh token, saves connection in database, and redirects user back to portal.

### `GET /api/calendar/status`
- **Auth**: Authenticated
- **Description**: Returns `{ "connected": true, "connection": { "googleAccountEmail": "..." } }`.

### `POST /api/calendar/disconnect`
- **Auth**: Authenticated
- **Description**: Removes Google Calendar connection for authenticated user.

---

## 8. Background Job Worker Endpoint

### `POST /api/jobs/process`
- **Auth**: `CRON_SECRET` Bearer header or Admin session
- **Description**: Triggers outbox notification delivery, reminders, and daily medication scan.
- **Response**: `200 OK` with processed jobs summary.
