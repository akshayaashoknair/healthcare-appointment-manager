# CareFlow Engineering Specification

## Status and source of truth

This specification is derived solely from `docs/Healthcare_Appointment_Manager.pdf` (the **PDF**). Statements marked **PDF requirement** are explicitly required by that document. Statements marked **Implementation decision** are proposed, production-appropriate choices needed to make an explicit requirement buildable; they are not additional product requirements.

## Project objective

**PDF requirement:** Build a healthcare appointment platform for a clinic with separate portals for patients, doctors, and an admin. It must support appointment booking, advance symptom sharing and a doctor-facing AI symptom summary, patient-friendly post-visit summary, medication reminders, timely email communications, and Google Calendar events. The stated input is patient symptoms and appointment details; the stated outputs are a booked appointment, AI symptom summary, post-visit summary, email, and calendar events.

## 1. Actors and roles

- **Patient — PDF requirement:** registers and logs in; searches doctors by specialisation; selects and books an appointment slot; provides symptoms before confirmation; receives appointment, cancellation, reminder, medication, calendar, and post-visit information.
- **Doctor — PDF requirement:** has a profile managed by Admin; receives a pre-visit AI symptom summary; submits post-visit notes and a prescription; receives booking, reminder, and cancellation communications.
- **Admin — PDF requirement:** creates and manages doctor profiles, including specialisation, working hours, slot duration, and leave days.
- **Implementation decision:** each authenticated account has exactly one role for portal and authorization purposes. A doctor profile is linked to one Doctor account.

## 2. Functional requirements

| Capability | Requirement |
| --- | --- |
| Patient access | **PDF requirement:** Patients can register and log in. |
| Doctor discovery | **PDF requirement:** Patients can search doctors by specialisation. |
| Doctor management | **PDF requirement:** Admin manages doctor profiles, specialisation, working hours, slot duration, and leave days. |
| Booking | **PDF requirement:** Patients book appointment slots; the system safely prevents double-booking, including simultaneous attempts. |
| Symptoms and pre-visit summary | **PDF requirement:** Before confirmation, the patient completes a symptom form. An LLM creates and stores a pre-visit summary with urgency for the doctor. |
| Consultation and post-visit summary | **PDF requirement:** Doctors submit notes and prescriptions. An LLM creates and stores a patient-friendly post-visit summary. |
| Medication reminders | **PDF requirement:** The system sends reminders based on prescription frequency. |
| Email | **PDF requirement:** Send booking-confirmation, reminder, and cancellation emails to both patient and doctor. |
| Calendar | **PDF requirement:** Create Google Calendar events for both parties on booking; update them on reschedule and delete them on cancellation. |
| Leave | **PDF requirement:** If a doctor is put on leave for a date with existing bookings, notify affected patients. |

**Implementation decision:** Appointment cancellation and rescheduling must be available to complete the PDF-required calendar and cancellation flows. Product policy for who may initiate them and any time cutoff must be agreed before implementation.

## 3. Appointment lifecycle

The PDF requires booking, cancellation, rescheduling, completed consultations, and safety under concurrent booking. It does not prescribe state names; the following is an **implementation decision**.

`available` is a derived slot state, not a persisted appointment. A slot transitions `available → held → confirmed`; a hold transitions `held → hold-expired → available` when its expiry passes. A confirmed appointment transitions to `completed` after the doctor records consultation notes, or to `cancelled` when cancelled. Rescheduling creates/holds a new slot, confirms it, then cancels/supersedes the original within one transaction. A cancelled or completed appointment cannot return to confirmed. Doctor leave does not silently remove bookings: affected confirmed appointments become `cancelled` (or a separate `leave-affected` intermediate state if operations need review) and patients are notified. PostgreSQL remains authoritative for persisted active reservations and appointment state; external integration state never changes this lifecycle.

## 4. Slot generation rules

**PDF requirements:** availability must use doctor working hours, doctor-specific slot duration, leave days, and avoid conflicting bookings.

**Implementation decision:** For each doctor and requested date, divide each working-hours interval into contiguous intervals of the configured slot duration. Exclude intervals that overlap a leave day, confirmed appointment, or active hold. Time-zone storage and display must use a single configured clinic time zone. The definition of overlap uses half-open intervals `[start, end)`: adjacent intervals such as `[10:00, 10:30)` and `[10:30, 11:00)` are permitted, while any intersecting intervals are rejected. Breaks, multiple daily working periods, and lead-time rules are not specified and must not be introduced without a product decision.

## 5. Slot hold mechanism

**PDF requirement:** the deliverable system-design write-up must cover a slot hold mechanism; simultaneous booking must be safe.

**Implementation decision:** Create a short-lived hold only after the patient has supplied the required symptoms and begins confirmation. Store `doctorId`, start/end time, patient, expiry time, and status. Use a five-minute default hold duration, configurable by environment. Only its holder can confirm it. An expired hold is ignored by availability and is marked expired by a worker or transaction-time check. A patient cannot create a competing hold for the same doctor/time, and a different patient receives a conflict response rather than replacing it.

## 6. Concurrent booking and double-booking prevention

**PDF requirement:** prevent double-booking and handle simultaneous booking attempts safely.

**Implementation decision:** PostgreSQL is the authoritative protection against overlapping active reservations; neither the browser nor an availability read is authoritative. Persist each active hold and confirmed appointment as a PostgreSQL time range and enforce a PostgreSQL exclusion constraint scoped to the doctor that rejects overlapping active reservation ranges. The range uses `[start, end)` semantics, so `[10:00, 10:30)` and `[10:30, 11:00)` are allowed but any overlap is rejected. Create the hold and confirm the appointment in database transactions, locking the relevant doctor/time range where needed. On an exclusion-constraint conflict, roll back and return HTTP `409 Conflict` with refreshed availability. Confirmation atomically verifies an unexpired hold owned by the patient, creates/updates the confirmed appointment, and consumes the hold.

## 7. Doctor leave conflict handling

**PDF requirement:** Admin manages leave days; when leave is marked on a date with existing bookings, affected patients must be notified.

**Implementation decision:** Admin creates leave in a transaction that detects future confirmed appointments overlapping the leave date. The system marks those appointments cancelled/leave-affected, records the reason and enqueue notification work in the same transaction (outbox pattern). It deletes linked Google Calendar events asynchronously. Patients receive a leave-specific email; doctors receive an operational notification only if the team chooses to add it. The PDF does not require automatic rescheduling, so it is out of scope.

## 8. AI pre-visit workflow and failure handling

**PDF requirement:** Before appointment confirmation, the patient fills a symptom form; the LLM generates and stores a pre-visit summary with urgency for the doctor. Use this prompt guidance:

> Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: &lt;symptoms&gt;

**Implementation decision:** the required flow is: patient selects a slot → enters symptoms → the slot hold/appointment booking is safely established in PostgreSQL → a background job generates the AI summary asynchronously → the doctor sees the stored summary before consultation. Submit symptoms as appointment data and validate non-empty bounded input before safely establishing the hold or booking. LLM availability must never determine whether a valid appointment can be confirmed. Validate structured output: `urgencyLevel` must be Low, Medium, or High; `chiefComplaint` must be text; `suggestedQuestions` must contain exactly three strings. Persist input, validated output, generation status, and error metadata. On failure, retain the appointment and symptoms, mark the summary `failed`/`pending-retry`, retry a bounded number of times, and show the doctor that no AI summary is available. The summary assists rather than diagnoses; the PDF does not define clinical escalation behavior, so none is automated.

## 9. AI post-visit workflow and failure handling

**PDF requirement:** The doctor submits notes and a prescription; the LLM generates and stores a patient-friendly post-visit summary. Use this prompt guidance:

> Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: &lt;notes&gt;

**Implementation decision:** Persist the doctor's original notes and prescription before queuing generation. Validate that the returned summary includes patient-friendly text, medication schedule, and follow-up steps; reject malformed output without overwriting source notes. Store status and errors, retry transient failures with a bounded policy, and allow the patient to see the source-approved prescription even if summary generation fails. The appointment may become completed independently of LLM success.

## 10. Email and notification architecture

**PDF requirements:** use an email service such as SendGrid, Mailgun, Nodemailer, or similar; notify both patient and doctor for booking confirmation, reminder, and cancellation; notify affected patients of doctor leave.

**Implementation decision:** write notification intents to an outbox in the same transaction as the triggering business change. A worker renders and sends the email. Notification types are `booking-confirmation`, `appointment-reminder`, `cancellation`, `doctor-leave`, and `medication-reminder`; recipient role, appointment/prescription reference, template data, status, attempts, and provider message identifier are recorded. A send failure must never roll back or invalidate a successful appointment transaction.

## 11. Notification retry/failure handling

**PDF requirement:** background jobs handle medication reminders and email retries; notification reliability is an evaluation focus.

**Implementation decision:** use states `pending`, `processing`, `sent`, `retry-scheduled`, and `failed`. Retry transient provider/network failures with capped exponential backoff and idempotency keys. Mark permanent failures (invalid address, rejected recipient) failed with an auditable error. Ensure workers can safely reclaim stalled jobs. Do not send duplicates after a successful provider acknowledgement. Alert operators for exhausted critical appointment notifications; the PDF does not require an in-app fallback channel.

## 12. Medication reminders

**PDF requirement:** send medication reminders based on prescription frequency.

**Implementation decision:** prescriptions must store medication name, dosage/instructions, frequency, start/end (or ongoing) period, and reminder schedule/time zone sufficient to compute sends. Generate idempotent reminder jobs at prescription creation/update, and stop future jobs when the prescription is stopped or superseded. Exact frequency vocabulary and patient opt-out policy are not specified.

## 13. Google Calendar OAuth and event lifecycle

**PDF requirements:** integrate Google Calendar API with OAuth 2.0; create an event for both patient and doctor on booking; update on reschedule; delete on cancellation.

**Implementation decision:** appointment state in PostgreSQL is authoritative. Each participant explicitly connects a Google account using OAuth 2.0 authorization code flow. Store encrypted refresh tokens and calendar event IDs per appointment and participant. Create, update, and delete operations are asynchronous integration jobs queued only after the relevant appointment transaction commits. Google Calendar failure must never roll back a successful booking, reschedule, or cancellation. Persist failed calendar operations, their error state, and retry metadata; retry and reconcile them independently, including for revoked tokens or unavailable participant accounts. The PDF does not state whether Google connection is mandatory, event privacy settings, or which calendar to use.

## 14. Authentication and authorization

**PDF requirement:** backend, frontend, and database use role-based authentication for patient, doctor, and admin.

**Implementation decision:** require authenticated sessions for all protected APIs and enforce role checks server-side. Patients can access only their own profile, symptoms, appointments, prescriptions, summaries, and calendar connection. Doctors can access only their own profile, availability/leave, and appointments/patient information assigned to them. Admin can manage doctor profiles and leave but must not receive unrestricted clinical-data access unless separately required. Every resource lookup applies ownership/assignment checks; IDs in a request are never sufficient authority.

## 15. Required database entities and constraints

No Prisma schema is created by this document.

| Entity | Purpose and key data | Relationships / constraints |
| --- | --- | --- |
| User / Account | identity, email, password credential, role | unique email; role is patient, doctor, or admin. |
| Patient profile | patient-specific identity/contact data | one-to-one with Patient account. |
| Doctor profile | specialisation, working hours, slot duration | one-to-one with Doctor account; managed by Admin. |
| Working hours | doctor day/interval availability | belongs to Doctor profile; valid, non-overlapping intervals. |
| Doctor leave | leave date/range and reason/status | belongs to Doctor; blocks slot generation. |
| Appointment | patient, doctor, time range, status, cancellation/leave reason | belongs to Patient and Doctor; no overlapping active reservation for a doctor. |
| Slot hold | temporary patient reservation, time range, expiry/status | belongs to Patient and Doctor; conflicts with active reservations. |
| Symptom submission | original pre-confirmation symptoms | belongs to Appointment. |
| Pre-visit summary | LLM urgency, chief complaint, three questions, status/error | belongs to Appointment; preserve validated output. |
| Consultation notes | doctor-provided clinical notes | belongs to Appointment and authoring Doctor. |
| Prescription / medication | prescription and frequency/schedule | belongs to Appointment; produces medication reminders. |
| Post-visit summary | LLM patient-friendly summary, medication schedule, follow-up, status/error | belongs to Appointment. |
| Notification / outbox job | email/reminder intent, recipient, state, attempts/error | references appointment or prescription; idempotent per event/recipient. |
| Calendar connection | OAuth account and encrypted token metadata | belongs to a Patient or Doctor account. |
| Calendar event mapping | external event ID and sync state | belongs to appointment and calendar connection. |

The entity list above includes **PDF-required concepts** plus **implementation entities** (holds, outbox, OAuth mapping, and job state) needed for the explicit reliability and integration requirements.

## 16. Required API endpoints

Endpoint shapes are **implementation decisions**; the PDF requires the capabilities, not REST paths.

| Method/path | Allowed role | Purpose / important data | Validation and errors |
| --- | --- | --- | --- |
| `POST /api/auth/register` | public | patient registration; email/password/profile | duplicate email, invalid credential data. |
| `POST /api/auth/login` / `POST /api/auth/logout` | public / authenticated | session lifecycle | invalid credentials, unauthenticated session. |
| `GET /api/doctors?specialisation=` | patient | doctor search and profile/availability discovery | validate query. |
| `GET /api/doctors/{id}/slots?date=` | patient | derived available slots | invalid date; no access to unavailable data. |
| `POST /api/appointments/holds` | patient | symptoms and requested doctor/time; creates hold | invalid symptoms/time, leave/unavailable slot, `409` conflict. |
| `POST /api/appointments/holds/{id}/confirm` | hold owner | confirms unexpired hold | `409` expired/consumed/conflict; ownership. |
| `GET /api/appointments/{id}` | owner/assigned doctor/admin as allowed | appointment, permitted clinical data and summaries | ownership/assignment, not found. |
| `POST /api/appointments/{id}/cancel` | authorized participant/admin | cancellation | invalid state, authorization. |
| `POST /api/appointments/{id}/reschedule` | authorized participant/admin | new time/hold reference | expired hold, state, availability, `409`. |
| `POST /api/appointments/{id}/notes` | assigned doctor | notes and prescription | ownership, input validation, invalid state. |
| `POST /api/admin/doctors` / `PATCH /api/admin/doctors/{id}` | admin | profile, specialisation, hours, duration | validate intervals/duration; role. |
| `POST /api/admin/doctors/{id}/leave` | admin | leave date/range | detect affected appointments; validate date. |
| `GET /api/calendar/oauth/start` / `GET /api/calendar/oauth/callback` | patient/doctor | Google OAuth account connection | OAuth state, denied/revoked token. |

## 17. Background jobs

**PDF requirements:** background work for medication reminders and email retries; Google Calendar integration; graceful LLM failure handling.

**Implementation decision:** use the simplest reliable background-job and scheduling mechanism compatible with the chosen deployment architecture; the exact technology is deliberately deferred until before implementation. The mechanism must asynchronously generate/retry pre-visit and post-visit summaries, send all notification types, retry email failures, schedule/send medication reminders, and create/update/delete/reconcile calendar events. This keeps external provider latency and failure outside appointment transactions while preserving durable work through an outbox/job store. No specific queue technology (including Redis or BullMQ) is selected by this specification.

## 18. Error handling

**PDF requirement:** LLM failures must be handled gracefully and must not break the system; bookings must be safe under contention.

**Implementation decision:** validate all API inputs and return field-level `400` errors; return `401` for missing authentication, `403` for forbidden ownership/role, `404` for inaccessible/missing resources, `409` for conflicts/expired holds, and `5xx` for unexpected database/service errors without leaking secrets. Roll back failed database transactions. Capture database constraint conflicts as usable booking responses. Record LLM, email, and calendar errors with correlation IDs and retry only safe transient work. Calendar/email/LLM failure never reverses a committed appointment or consultation record.

## 19. Security requirements

**PDF requirement:** role-based auth and a healthcare appointment platform imply protection of patient and appointment data; the PDF explicitly requires OAuth 2.0 for Google Calendar.

**Implementation decision:** use an adaptive password hash; secure, HTTP-only session cookies/tokens; server-side authorization and ownership checks; input validation and output encoding; CSRF protections for cookie-authenticated mutations; rate limiting for auth and booking APIs; encrypted OAuth refresh tokens; secrets only in environment/secret management (never repository, logs, or responses); least-privilege Google OAuth scopes; audit logging without clinical content; TLS in production; and access controls preventing users from retrieving another patient's medical, appointment, prescription, symptom, or summary data.

## 20. Testing requirements

The PDF's evaluation focus requires coverage of slot conflicts, leave, notification reliability, LLM handling, schema/API design, integrations, and documentation. The following is an **implementation decision** test matrix.

- Unit: slot derivation for working hours, duration, leave, appointments, and holds; lifecycle transitions; reminder calculation; LLM output validation; authorization policy; retry backoff.
- Integration: two simultaneous confirmations for one doctor/time produce exactly one confirmed appointment; expired holds cannot confirm; database rollback/constraint conflict behavior; leave detects future bookings and queues patient notices; LLM failure preserves booking/notes; email and calendar failures create retryable jobs; OAuth token failures do not change appointment state.
- End-to-end: patient registration/login, specialisation search, symptom-to-booking confirmation, doctor pre-visit view, notes/prescription-to-post-visit summary, booking/reminder/cancellation email flow, medication reminder flow, calendar create/update/delete, and Patient/Doctor/Admin authorization boundaries.

## 21. Deployment requirements

**PDF requirement:** deploy a hosted application URL on a free hosting service such as Vercel, Render, or Railway; provide setup documentation and `.env.example`.

**Implementation decision:** production needs a PostgreSQL database, application hosting, worker/scheduler hosting, email-provider credentials, LLM credentials, Google OAuth client credentials/redirect URIs, encrypted-token key, session/auth secret, clinic time zone, and publicly reachable HTTPS URL. Configure database migrations, health checks, logs/error monitoring, secure production environment variables, and OAuth redirect URLs. The README must document setup, API documentation, DB schema, LLM prompts, and Google Calendar setup steps.

## 22. Deliverables

**PDF requirements:**

1. A zip file containing complete source code.
2. A README with setup guide, `.env.example`, API docs, DB schema, LLM prompts, and Google Calendar setup steps.
3. A hosted application URL on free hosting (for example Vercel, Render, or Railway).
4. A system-design write-up of no more than 800 words covering double-booking prevention, doctor leave conflict handling, slot hold mechanism, and notification failure handling.

This `ENGINEERING_SPEC.md` is a planning artifact, not a replacement for these final deliverables.

## 23. Definition-of-done checklist

- [ ] Separate Patient, Doctor, and Admin portals with role-based authentication are implemented.
- [ ] Admin can manage doctor profiles, specialisation, working hours, slot duration, and leave days.
- [ ] Patient registration, login, specialisation search, and safe slot booking are implemented.
- [ ] Symptoms are collected before confirmation and the stored pre-visit LLM summary contains urgency, chief complaint, and three questions using the PDF guidance.
- [ ] The system prevents double-booking during simultaneous requests using database-backed transactions/constraints.
- [ ] Doctor leave detects future affected appointments and notifies affected patients.
- [ ] Doctors can store post-visit notes and prescriptions; the stored post-visit LLM summary is patient-friendly and covers medication schedule and follow-up steps using the PDF guidance.
- [ ] Medication reminders are sent according to prescription frequency.
- [ ] Both patient and doctor receive booking-confirmation, reminder, and cancellation emails.
- [ ] Email retries and medication reminders run in background jobs; notification failure does not invalidate appointments.
- [ ] Google Calendar OAuth 2.0 is connected; events are created on booking, updated on rescheduling, and deleted on cancellation for both parties.
- [ ] LLM failures are graceful and do not break booking or visit completion.
- [ ] API, database design, integration behavior, and authorization are tested, including concurrency, leave, LLM, email, calendar, and role boundaries.
- [ ] Complete source, README/`.env.example`/API docs/DB schema/LLM prompts/Calendar setup, hosted URL, and ≤800-word system design write-up are delivered.

## PDF coverage review

Every requirement in the PDF is represented above. No unmapped PDF requirement was identified. The implementation decisions are explicitly labeled in Sections 1 and 3–21; they mainly establish state names, REST routes, transaction/outbox strategy, retry semantics, data fields, authorization boundaries, and deployment/security defaults where the PDF gives no specific design.
