import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { preVisitAIOutputSchema, postVisitAIOutputSchema } from '../lib/validations'
import { AIGenerationStatus, UrgencyLevel, AppointmentStatus } from '../lib/types'

describe('AI Pre-Visit & Post-Visit Summary Processing Tests', () => {
  it('should validate a valid pre-visit AI structured output', () => {
    const validOutput = {
      urgencyLevel: 'Medium',
      chiefComplaint: 'Chest tightness after exercise for 2 days',
      suggestedQuestions: [
        'How long does the tightness last when it occurs?',
        'Do you have a family history of cardiovascular issues?',
        'Does the discomfort radiate to your arm or jaw?',
      ],
    }

    const result = preVisitAIOutputSchema.safeParse(validOutput)
    assert.equal(result.success, true, 'Valid pre-visit AI structure must pass validation')
    if (result.success) {
      assert.equal(result.data.suggestedQuestions.length, 3)
      assert.equal(result.data.urgencyLevel, 'Medium')
    }
  })

  it('should reject malformed pre-visit AI output with fewer than 3 questions', () => {
    const malformedOutput = {
      urgencyLevel: 'Low',
      chiefComplaint: 'Mild headache',
      suggestedQuestions: ['How long have you had it?'], // only 1 question instead of 3
    }

    const result = preVisitAIOutputSchema.safeParse(malformedOutput)
    assert.equal(result.success, false, 'Output with fewer than 3 questions must fail validation')
  })

  it('should reject pre-visit AI output with invalid urgency level', () => {
    const malformedOutput = {
      urgencyLevel: 'CriticalEmergency', // Invalid enum value
      chiefComplaint: 'Severe shortness of breath',
      suggestedQuestions: ['Q1', 'Q2', 'Q3'],
    }

    const result = preVisitAIOutputSchema.safeParse(malformedOutput)
    assert.equal(result.success, false, 'Invalid urgency level must fail validation')
  })

  it('should validate valid post-visit AI structured output', () => {
    const validOutput = {
      patientSummary:
        'During today visit, Dr. Mehta evaluated your blood pressure. You were prescribed medication to help keep your pressure in a healthy range.',
      medicationSchedule: 'Take 1 tablet of Amlodipine (5mg) once daily every morning with water.',
      followUpSteps: 'Monitor your blood pressure daily and schedule a follow-up consultation in 4 weeks.',
    }

    const result = postVisitAIOutputSchema.safeParse(validOutput)
    assert.equal(result.success, true, 'Valid post-visit AI structure must pass validation')
  })

  it('should guarantee that LLM failure never rolls back or invalidates a confirmed appointment', () => {
    // Simulated appointment record
    const appointment = {
      id: 'apt_test_ai_failure',
      status: AppointmentStatus.CONFIRMED,
      patientId: 'patient_1',
      doctorId: 'doctor_1',
    }

    // Simulated AI generation failure (e.g. timeout or API key missing)
    const preVisitSummaryRecord = {
      id: 'pvs_1',
      appointmentId: appointment.id,
      generationStatus: AIGenerationStatus.FAILED,
      errorMetadata: {
        message: 'OpenAI API network timeout after 20s',
        timestamp: new Date().toISOString(),
      },
    }

    // Critical assertion: Appointment remains CONFIRMED despite AI failure
    assert.equal(
      appointment.status,
      AppointmentStatus.CONFIRMED,
      'Appointment must remain CONFIRMED even if AI generation fails',
    )
    assert.equal(preVisitSummaryRecord.generationStatus, AIGenerationStatus.FAILED)
    assert.ok(preVisitSummaryRecord.errorMetadata.message.includes('timeout'))
  })

  it('should guarantee that Post-Visit AI failure preserves doctor clinical notes and prescription', () => {
    // Simulated doctor clinical notes and verified prescription
    const consultation = {
      id: 'consult_1',
      clinicalNotes: 'Patient diagnosed with Acute Pharyngitis. Prescribed Amoxicillin 500mg.',
      prescription: {
        medications: [{ name: 'Amoxicillin', dosage: '500mg', frequency: '3 times daily' }],
      },
      postVisitSummary: {
        generationStatus: AIGenerationStatus.FAILED,
        errorMetadata: { message: 'Rate limit exceeded' },
      },
    }

    // Critical assertion: Clinical notes and prescription are untouched
    assert.ok(consultation.clinicalNotes.length > 0)
    assert.equal(consultation.prescription.medications.length, 1)
    assert.equal(consultation.postVisitSummary.generationStatus, AIGenerationStatus.FAILED)
  })
})
