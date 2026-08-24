-- Initial CareFlow schema. Prisma cannot express the PostgreSQL exclusion
-- constraint at the end of this migration, so it is maintained as custom SQL.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE "UserRole" AS ENUM ('PATIENT', 'DOCTOR', 'ADMIN');
CREATE TYPE "AppointmentStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'COMPLETED', 'LEAVE_AFFECTED');
CREATE TYPE "HoldStatus" AS ENUM ('HELD', 'EXPIRED', 'CONSUMED', 'RELEASED');
CREATE TYPE "ReservationKind" AS ENUM ('HOLD', 'APPOINTMENT');
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'RELEASED');
CREATE TYPE "AIGenerationStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
CREATE TYPE "UrgencyLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "NotificationType" AS ENUM ('BOOKING_CONFIRMATION', 'APPOINTMENT_REMINDER', 'CANCELLATION', 'DOCTOR_LEAVE', 'MEDICATION_REMINDER');
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'RETRY_SCHEDULED', 'FAILED');
CREATE TYPE "CalendarSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED', 'DELETE_PENDING', 'DELETED');

CREATE TABLE "User" (
    "id" TEXT NOT NULL, "email" TEXT NOT NULL, "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientProfile" (
    "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "firstName" TEXT NOT NULL, "lastName" TEXT NOT NULL,
    "phone" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PatientProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DoctorProfile" (
    "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "firstName" TEXT NOT NULL, "lastName" TEXT NOT NULL,
    "specialisation" TEXT NOT NULL, "slotDurationMinutes" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "DoctorProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DoctorWorkingHours" (
    "id" TEXT NOT NULL, "doctorId" TEXT NOT NULL, "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL, "endTime" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "DoctorWorkingHours_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DoctorLeave" (
    "id" TEXT NOT NULL, "doctorId" TEXT NOT NULL, "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL, "reason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "DoctorLeave_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SlotReservation" (
    "id" TEXT NOT NULL, "doctorId" TEXT NOT NULL, "patientId" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL, "endAt" TIMESTAMPTZ(3) NOT NULL,
    "kind" "ReservationKind" NOT NULL, "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SlotReservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppointmentHold" (
    "id" TEXT NOT NULL, "reservationId" TEXT NOT NULL, "doctorId" TEXT NOT NULL, "patientId" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL, "endAt" TIMESTAMPTZ(3) NOT NULL, "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "HoldStatus" NOT NULL DEFAULT 'HELD', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "AppointmentHold_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL, "reservationId" TEXT NOT NULL, "patientId" TEXT NOT NULL, "doctorId" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL, "endAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'CONFIRMED', "cancellationReason" TEXT,
    "cancelledAt" TIMESTAMPTZ(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SymptomSubmission" (
    "id" TEXT NOT NULL, "patientId" TEXT NOT NULL, "appointmentId" TEXT, "holdId" TEXT,
    "symptoms" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SymptomSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PreVisitSummary" (
    "id" TEXT NOT NULL, "appointmentId" TEXT NOT NULL, "urgencyLevel" "UrgencyLevel",
    "chiefComplaint" TEXT, "suggestedQuestions" JSONB, "generationStatus" "AIGenerationStatus" NOT NULL DEFAULT 'PENDING',
    "errorMetadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PreVisitSummary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL, "appointmentId" TEXT NOT NULL, "doctorId" TEXT NOT NULL, "clinicalNotes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL, "consultationId" TEXT NOT NULL, "instructions" TEXT, "followUpInformation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Medication" (
    "id" TEXT NOT NULL, "prescriptionId" TEXT NOT NULL, "name" TEXT NOT NULL, "dosage" TEXT NOT NULL,
    "instructions" TEXT, "frequency" TEXT NOT NULL, "startDate" TIMESTAMP(3), "endDate" TIMESTAMP(3),
    "reminderTime" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Medication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PostVisitSummary" (
    "id" TEXT NOT NULL, "consultationId" TEXT NOT NULL, "patientSummary" TEXT,
    "medicationSchedule" TEXT, "followUpSteps" TEXT, "generationStatus" "AIGenerationStatus" NOT NULL DEFAULT 'PENDING',
    "errorMetadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PostVisitSummary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationJob" (
    "id" TEXT NOT NULL, "type" "NotificationType" NOT NULL, "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "recipientId" TEXT NOT NULL, "appointmentId" TEXT, "prescriptionId" TEXT, "payload" JSONB,
    "attemptCount" INTEGER NOT NULL DEFAULT 0, "nextAttemptAt" TIMESTAMPTZ(3), "lastError" TEXT,
    "idempotencyKey" TEXT NOT NULL, "providerMessageId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "NotificationJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalendarConnection" (
    "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "googleAccountEmail" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalendarEventMapping" (
    "id" TEXT NOT NULL, "appointmentId" TEXT NOT NULL, "calendarConnectionId" TEXT NOT NULL,
    "googleEventId" TEXT, "syncStatus" "CalendarSyncStatus" NOT NULL DEFAULT 'PENDING', "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CalendarEventMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "PatientProfile_userId_key" ON "PatientProfile"("userId");
CREATE UNIQUE INDEX "DoctorProfile_userId_key" ON "DoctorProfile"("userId");
CREATE INDEX "DoctorProfile_specialisation_isActive_idx" ON "DoctorProfile"("specialisation", "isActive");
CREATE INDEX "DoctorWorkingHours_doctorId_weekday_idx" ON "DoctorWorkingHours"("doctorId", "weekday");
CREATE UNIQUE INDEX "DoctorWorkingHours_doctorId_weekday_startTime_endTime_key" ON "DoctorWorkingHours"("doctorId", "weekday", "startTime", "endTime");
CREATE INDEX "DoctorLeave_doctorId_startAt_endAt_idx" ON "DoctorLeave"("doctorId", "startAt", "endAt");
CREATE INDEX "SlotReservation_doctorId_startAt_idx" ON "SlotReservation"("doctorId", "startAt");
CREATE INDEX "SlotReservation_patientId_startAt_idx" ON "SlotReservation"("patientId", "startAt");
CREATE INDEX "SlotReservation_status_startAt_idx" ON "SlotReservation"("status", "startAt");
CREATE UNIQUE INDEX "AppointmentHold_reservationId_key" ON "AppointmentHold"("reservationId");
CREATE INDEX "AppointmentHold_doctorId_startAt_idx" ON "AppointmentHold"("doctorId", "startAt");
CREATE INDEX "AppointmentHold_status_expiresAt_idx" ON "AppointmentHold"("status", "expiresAt");
CREATE INDEX "AppointmentHold_patientId_expiresAt_idx" ON "AppointmentHold"("patientId", "expiresAt");
CREATE UNIQUE INDEX "Appointment_reservationId_key" ON "Appointment"("reservationId");
CREATE INDEX "Appointment_doctorId_startAt_idx" ON "Appointment"("doctorId", "startAt");
CREATE INDEX "Appointment_patientId_startAt_idx" ON "Appointment"("patientId", "startAt");
CREATE INDEX "Appointment_status_startAt_idx" ON "Appointment"("status", "startAt");
CREATE UNIQUE INDEX "SymptomSubmission_appointmentId_key" ON "SymptomSubmission"("appointmentId");
CREATE UNIQUE INDEX "SymptomSubmission_holdId_key" ON "SymptomSubmission"("holdId");
CREATE INDEX "SymptomSubmission_patientId_createdAt_idx" ON "SymptomSubmission"("patientId", "createdAt");
CREATE UNIQUE INDEX "PreVisitSummary_appointmentId_key" ON "PreVisitSummary"("appointmentId");
CREATE UNIQUE INDEX "Consultation_appointmentId_key" ON "Consultation"("appointmentId");
CREATE INDEX "Consultation_doctorId_createdAt_idx" ON "Consultation"("doctorId", "createdAt");
CREATE UNIQUE INDEX "Prescription_consultationId_key" ON "Prescription"("consultationId");
CREATE INDEX "Medication_prescriptionId_idx" ON "Medication"("prescriptionId");
CREATE UNIQUE INDEX "PostVisitSummary_consultationId_key" ON "PostVisitSummary"("consultationId");
CREATE UNIQUE INDEX "NotificationJob_idempotencyKey_key" ON "NotificationJob"("idempotencyKey");
CREATE INDEX "NotificationJob_status_nextAttemptAt_idx" ON "NotificationJob"("status", "nextAttemptAt");
CREATE INDEX "NotificationJob_recipientId_createdAt_idx" ON "NotificationJob"("recipientId", "createdAt");
CREATE INDEX "NotificationJob_appointmentId_idx" ON "NotificationJob"("appointmentId");
CREATE INDEX "NotificationJob_prescriptionId_idx" ON "NotificationJob"("prescriptionId");
CREATE UNIQUE INDEX "CalendarConnection_userId_googleAccountEmail_key" ON "CalendarConnection"("userId", "googleAccountEmail");
CREATE INDEX "CalendarEventMapping_syncStatus_updatedAt_idx" ON "CalendarEventMapping"("syncStatus", "updatedAt");
CREATE UNIQUE INDEX "CalendarEventMapping_appointmentId_calendarConnectionId_key" ON "CalendarEventMapping"("appointmentId", "calendarConnectionId");
CREATE UNIQUE INDEX "CalendarEventMapping_calendarConnectionId_googleEventId_key" ON "CalendarEventMapping"("calendarConnectionId", "googleEventId");

ALTER TABLE "PatientProfile" ADD CONSTRAINT "PatientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DoctorProfile" ADD CONSTRAINT "DoctorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DoctorWorkingHours" ADD CONSTRAINT "DoctorWorkingHours_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DoctorLeave" ADD CONSTRAINT "DoctorLeave_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SlotReservation" ADD CONSTRAINT "SlotReservation_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SlotReservation" ADD CONSTRAINT "SlotReservation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppointmentHold" ADD CONSTRAINT "AppointmentHold_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "SlotReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppointmentHold" ADD CONSTRAINT "AppointmentHold_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppointmentHold" ADD CONSTRAINT "AppointmentHold_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "SlotReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SymptomSubmission" ADD CONSTRAINT "SymptomSubmission_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SymptomSubmission" ADD CONSTRAINT "SymptomSubmission_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SymptomSubmission" ADD CONSTRAINT "SymptomSubmission_holdId_fkey" FOREIGN KEY ("holdId") REFERENCES "AppointmentHold"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PreVisitSummary" ADD CONSTRAINT "PreVisitSummary_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Medication" ADD CONSTRAINT "Medication_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostVisitSummary" ADD CONSTRAINT "PostVisitSummary_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationJob" ADD CONSTRAINT "NotificationJob_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NotificationJob" ADD CONSTRAINT "NotificationJob_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationJob" ADD CONSTRAINT "NotificationJob_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarEventMapping" ADD CONSTRAINT "CalendarEventMapping_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarEventMapping" ADD CONSTRAINT "CalendarEventMapping_calendarConnectionId_fkey" FOREIGN KEY ("calendarConnectionId") REFERENCES "CalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DoctorProfile" ADD CONSTRAINT "DoctorProfile_slotDurationMinutes_positive" CHECK ("slotDurationMinutes" > 0);
ALTER TABLE "DoctorWorkingHours" ADD CONSTRAINT "DoctorWorkingHours_weekday_valid" CHECK ("weekday" BETWEEN 0 AND 6);
ALTER TABLE "DoctorWorkingHours" ADD CONSTRAINT "DoctorWorkingHours_time_order" CHECK ("startTime" < "endTime");
ALTER TABLE "DoctorLeave" ADD CONSTRAINT "DoctorLeave_time_order" CHECK ("startAt" < "endAt");
ALTER TABLE "SlotReservation" ADD CONSTRAINT "SlotReservation_time_order" CHECK ("startAt" < "endAt");
ALTER TABLE "AppointmentHold" ADD CONSTRAINT "AppointmentHold_time_order" CHECK ("startAt" < "endAt");
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_time_order" CHECK ("startAt" < "endAt");

-- Canonical cross-table reservation guarantee. The partial predicate means a
-- released/expired/cancelled reservation no longer blocks a later booking.
-- tstzrange(..., '[)') permits adjacent appointments but rejects overlap.
ALTER TABLE "SlotReservation"
  ADD CONSTRAINT "SlotReservation_active_doctor_time_excl"
  EXCLUDE USING gist (
    "doctorId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  )
  WHERE ("status" = 'ACTIVE'::"ReservationStatus");
