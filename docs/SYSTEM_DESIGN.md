# CareFlow System Design

This document details the core concurrency, scheduling, resilience, and data integrity mechanisms implemented in CareFlow.

---

## 1. Double-Booking Prevention & Concurrency Architecture

To guarantee that no doctor is ever double-booked across concurrent client requests, CareFlow offloads mutual exclusion directly to the PostgreSQL storage engine rather than relying on application-level locks.

### PostgreSQL GiST Exclusion Constraint
CareFlow models slot occupancy using the `SlotReservation` table. An active reservation represents either a short-lived hold (`HOLD`) or a confirmed booking (`APPOINTMENT`). Concurrency safety is enforced at the database level using a PostgreSQL Generalized Search Tree (GiST) partial exclusion constraint with the `btree_gist` extension:

```sql
ALTER TABLE "SlotReservation" 
ADD CONSTRAINT "SlotReservation_active_doctor_time_excl"
EXCLUDE USING gist (
  "doctorId" WITH =,
  tstzrange("startAt", "endAt", '[)') WITH &&
)
WHERE ("status" = 'ACTIVE');
```

- Intervals use half-open bounds `[startAt, endAt)`. Back-to-back intervals (e.g. `[10:00, 10:30)` and `[10:30, 11:00)`) do not overlap and insert cleanly.
- If two concurrent transactions attempt to insert or activate overlapping intervals for the same `doctorId`, PostgreSQL serializes the evaluation and aborts the colliding transaction with error code `23P01`.
- The application catches this constraint violation and returns `HTTP 409 Conflict` to the client.

---

## 2. Slot Hold Mechanism

Booking requires collecting pre-visit symptoms from the patient. To avoid race conditions while the patient is typing symptoms, CareFlow employs a 5-minute reservation hold.

### Hold Flow & Expiration
1. **Hold Acquisition (`POST /api/appointments/holds`)**:
   - The patient requests a slot.
   - Within an atomic transaction, CareFlow checks for active doctor leaves, inserts an `ACTIVE` `SlotReservation` (kind `HOLD`), creates an `AppointmentHold` with `expiresAt = now + 5 minutes`, and persists the `SymptomSubmission`.
   - The GiST exclusion constraint ensures that only one patient can hold a given slot interval at any instant.
2. **Hold Expiration**:
   - Holds are checked lazily when fetching slots and explicitly during confirmation.
   - If a hold expires without confirmation, its status transitions to `EXPIRED` and the linked `SlotReservation` status is updated to `RELEASED`.
   - Once `RELEASED`, the interval is excluded from the GiST constraint and immediately becomes available for other patients.
3. **Atomic Confirmation (`POST /api/appointments/holds/[id]/confirm`)**:
   - Confirms the hold, creates the `Appointment` record (`status: CONFIRMED`), transitions the hold to `CONSUMED`, and updates the reservation from `kind: HOLD` to `kind: APPOINTMENT`.

---

## 3. Doctor Leave Conflict Handling

When an Administrator schedules leave for a doctor (`POST /api/admin/doctors/[id]/leave`), future appointments falling within the leave window `[startAt, endAt)` are identified and reconciled transactionally.

### Conflict Resolution Transaction
1. **Leave Creation**: The `DoctorLeave` record is created.
2. **Identification**: Overlapping confirmed appointments are selected via:
   ```sql
   WHERE "doctorId" = :doctorId 
     AND "status" = 'CONFIRMED'
     AND "startAt" < :leaveEnd 
     AND "endAt" > :leaveStart;
   ```
3. **State Transition**:
   - Each affected appointment is updated to `status: CANCELLED` with `cancellationReason: "Doctor on leave: <reason>"`.
   - The underlying `SlotReservation` is updated to `status: RELEASED`.
4. **Durable Notification Enqueueing**:
   - A `NotificationJob` of type `DOCTOR_LEAVE` is inserted into the outbox for each affected patient with an idempotency key (`leave-cancel-<aptId>-<leaveId>`).
5. **Calendar Sync Enqueueing**:
   - Deletion of linked Google Calendar events is asynchronously queued for both patient and doctor.
6. **Future Availability**:
   - The slot generation engine filters out intervals overlapping any `DoctorLeave` records, preventing new holds on leave days.

---

## 4. Notification & Background Job Resilience

CareFlow utilizes an Outbox Pattern (`NotificationJob` table) to decouple transactional business operations from asynchronous external side-effects (email delivery and Google Calendar sync).

### Outbox Execution & Error Handling
1. **Durable Insertion**:
   - Outbox jobs are committed within the same database transaction as the appointment creation, cancellation, or leave operation.
   - If an email provider or external API fails, the core appointment transaction **never rolls back**.
2. **Worker Polling & Bounded Exponential Backoff**:
   - The background worker polls for `PENDING` or `RETRY_SCHEDULED` jobs where `scheduledAt <= now`.
   - Upon failure, the job's `attempts` counter increments and a new execution is scheduled using bounded backoff:
     $$\text{delay} = \min(60 \times 2^{\text{attempts}-1}, 14400) \text{ seconds}$$
     *(Sequence: 1m, 2m, 4m, 8m, 16m up to a maximum of 5 attempts).*
   - Once attempts reach 5, the job is marked `FAILED` with error metadata for operational inspection.
3. **Idempotency**:
   - Jobs carry unique `idempotencyKey` strings (e.g. `booking-patient-<aptId>`), guaranteeing that duplicated triggers or retries never deliver duplicate notifications.
