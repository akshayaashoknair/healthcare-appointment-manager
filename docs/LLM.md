# Clinical AI Integration & Triage Engine

CareFlow integrates Large Language Models (OpenAI API with configurable model `gpt-4o-mini`) to provide clinical triage assistance before visits and patient-friendly care instructions after consultations.

---

> [!IMPORTANT]
> **Clinical Disclaimer**: AI-generated summaries and suggested questions are non-diagnostic assistive tools intended to support licensed medical professionals and patients. AI outputs never replace clinical evaluation, medical diagnoses, or physician judgment.

---

## 1. Pre-Visit Clinical AI Summary

When a patient books an appointment and provides their symptoms, CareFlow asynchronously triggers pre-visit AI processing to triage urgency and prepare clinical questions for the doctor.

### Prompt Specification
```text
Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: <symptoms>
```

### System Instruction & Structured Output
```json
{
  "urgencyLevel": "Low | Medium | High",
  "chiefComplaint": "Brief summary of the primary clinical complaint",
  "suggestedQuestions": [
    "Suggested question 1",
    "Suggested question 2",
    "Suggested question 3"
  ]
}
```

### Zod Validation Schema (`lib/validations.ts`)
```typescript
export const preVisitAIOutputSchema = z.object({
  urgencyLevel: z.enum(['Low', 'Medium', 'High', 'LOW', 'MEDIUM', 'HIGH']),
  chiefComplaint: z.string().min(1, 'Chief complaint is required'),
  suggestedQuestions: z.array(z.string().min(1)).length(3, 'Must contain exactly 3 suggested questions'),
})
```

---

## 2. Post-Visit Patient Care Plan Summary

Upon completion of a consultation, the doctor records clinical notes and verified prescriptions. CareFlow translates these notes into clear, empathetic guidance for the patient.

### Prompt Specification
```text
Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: <notes>
```

### System Instruction & Structured Output
```json
{
  "patientSummary": "Clear, empathetic explanation of the visit in plain English",
  "medicationSchedule": "Clear breakdown of when and how to take prescribed medications",
  "followUpSteps": "Actionable next steps, warning signs, and follow-up consultation timeframe"
}
```

### Zod Validation Schema (`lib/validations.ts`)
```typescript
export const postVisitAIOutputSchema = z.object({
  patientSummary: z.string().min(1, 'Patient summary is required'),
  medicationSchedule: z.string().default(''),
  followUpSteps: z.string().default(''),
})
```

---

## 3. Database Persistence

AI outputs are stored in dedicated PostgreSQL tables linked to the appointment and consultation:

1. **`PreVisitSummary`**:
   - `id`: Unique identifier
   - `appointmentId`: Foreign key to `Appointment` (Unique)
   - `urgencyLevel`: `UrgencyLevel` Enum (`LOW`, `MEDIUM`, `HIGH`)
   - `chiefComplaint`: Sanitized chief complaint string
   - `suggestedQuestions`: `text[]` (Array of exactly 3 questions)
   - `generationStatus`: `AIGenerationStatus` (`PENDING`, `COMPLETED`, `FAILED`)
   - `errorMetadata`: JSON field capturing failure diagnostics
   - `createdAt`, `updatedAt`

2. **`PostVisitSummary`**:
   - `id`: Unique identifier
   - `consultationId`: Foreign key to `Consultation` (Unique)
   - `patientSummary`: Plain-English summary
   - `medicationSchedule`: Structured intake instructions
   - `followUpSteps`: Actionable care plan
   - `generationStatus`: `AIGenerationStatus` (`PENDING`, `COMPLETED`, `FAILED`)
   - `errorMetadata`: JSON field capturing failure diagnostics
   - `createdAt`, `updatedAt`

---

## 4. Resilience & Error Handling Guarantees

1. **Non-Blocking Execution**:
   - AI generation runs asynchronously in background tasks.
   - Failures (API outages, invalid JSON, rate limits, timeouts) are caught and persisted in `errorMetadata`.
   - **Crucially, an AI failure never cancels, delays, or rolls back an appointment or consultation.**
2. **Interactive Retry**:
   - The Doctor Consultation Workspace (`/doctor/appointments/[id]`) provides a "Retry AI Summary" action to re-trigger generation if the initial background task failed.
3. **Privacy & Secrets**:
   - Patient identifiable information (PII) like full names and phone numbers is excluded from LLM prompts; only symptoms and clinical notes are analyzed.
   - API keys are never logged or returned in error payloads.
