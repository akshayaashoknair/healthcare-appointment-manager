import { prisma } from '../prisma'
import { AIGenerationStatus, UrgencyLevel } from '../types'
import { preVisitAIOutputSchema, postVisitAIOutputSchema } from '../validations'

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

export class AIService {
  /**
   * Generates a Pre-Visit AI Urgency & Symptoms Summary for the doctor.
   * Required prompt: "Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: <symptoms>"
   */
  static async generatePreVisitSummary(appointmentId: string, symptoms: string) {
    const apiKey = process.env.OPENAI_API_KEY?.trim()

    // Ensure PreVisitSummary record exists in PENDING state
    await prisma.preVisitSummary.upsert({
      where: { appointmentId },
      update: { generationStatus: AIGenerationStatus.PENDING, errorMetadata: undefined },
      create: {
        appointmentId,
        generationStatus: AIGenerationStatus.PENDING,
      },
    })

    if (!apiKey) {
      // Missing API key in environment: Record safe failure state without breaking appointment
      return prisma.preVisitSummary.update({
        where: { appointmentId },
        data: {
          generationStatus: AIGenerationStatus.FAILED,
          errorMetadata: {
            message: 'OPENAI_API_KEY is not configured in the environment',
            timestamp: new Date().toISOString(),
          },
        },
      })
    }

    try {
      const prompt = `Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: ${symptoms}`

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 20000)

      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [
            {
              role: 'system',
              content:
                'You are a clinical triage AI assistant for doctors. Respond ONLY with valid JSON in this exact structure: {"urgencyLevel": "Low" | "Medium" | "High", "chiefComplaint": "string", "suggestedQuestions": ["question 1", "question 2", "question 3"]}. The suggestedQuestions array must have exactly 3 items.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`OpenAI API returned status ${response.status}: ${errorText}`)
      }

      const responseData = await response.json()
      const content = responseData.choices?.[0]?.message?.content
      if (!content) {
        throw new Error('OpenAI returned empty message content')
      }

      const parsedJson = JSON.parse(content)
      const validation = preVisitAIOutputSchema.safeParse(parsedJson)

      if (!validation.success) {
        throw new Error(`AI structured output validation failed: ${JSON.stringify(validation.error.flatten())}`)
      }

      const urgencyStr = validation.data.urgencyLevel.toUpperCase()
      const urgencyLevel: UrgencyLevel =
        urgencyStr === 'HIGH' ? UrgencyLevel.HIGH : urgencyStr === 'MEDIUM' ? UrgencyLevel.MEDIUM : UrgencyLevel.LOW

      return await prisma.preVisitSummary.update({
        where: { appointmentId },
        data: {
          urgencyLevel,
          chiefComplaint: validation.data.chiefComplaint.trim(),
          suggestedQuestions: validation.data.suggestedQuestions,
          generationStatus: AIGenerationStatus.COMPLETED,
          errorMetadata: undefined,
        },
      })
    } catch (error: unknown) {
      const err = error as { message?: string }
      console.warn(`[PreVisitAI] Non-fatal generation error for appointment ${appointmentId}:`, err.message)

      return await prisma.preVisitSummary.update({
        where: { appointmentId },
        data: {
          generationStatus: AIGenerationStatus.FAILED,
          errorMetadata: {
            message: err.message || 'Unknown LLM generation error',
            timestamp: new Date().toISOString(),
          },
        },
      })
    }
  }

  /**
   * Generates a patient-friendly Post-Visit Summary from doctor clinical notes and prescription.
   * Required prompt: "Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: <notes>"
   */
  static async generatePostVisitSummary(
    consultationId: string,
    clinicalNotes: string,
    additionalContext?: string,
  ) {
    const apiKey = process.env.OPENAI_API_KEY?.trim()

    // Ensure PostVisitSummary record exists in PENDING state
    await prisma.postVisitSummary.upsert({
      where: { consultationId },
      update: { generationStatus: AIGenerationStatus.PENDING, errorMetadata: undefined },
      create: {
        consultationId,
        generationStatus: AIGenerationStatus.PENDING,
      },
    })

    if (!apiKey) {
      return prisma.postVisitSummary.update({
        where: { consultationId },
        data: {
          generationStatus: AIGenerationStatus.FAILED,
          errorMetadata: {
            message: 'OPENAI_API_KEY is not configured in the environment',
            timestamp: new Date().toISOString(),
          },
        },
      })
    }

    try {
      const fullContext = additionalContext
        ? `${clinicalNotes}\n\nPrescription and instructions:\n${additionalContext}`
        : clinicalNotes

      const prompt = `Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: ${fullContext}`

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 20000)

      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [
            {
              role: 'system',
              content:
                'You are a compassionate healthcare AI assistant translating doctor clinical notes for the patient. Respond ONLY with valid JSON in this exact structure: {"patientSummary": "clear, empathetic explanation of the visit in plain English", "medicationSchedule": "clear breakdown of when and how to take prescribed medications", "followUpSteps": "actionable next steps, warning signs, and follow-up consultation timeframe"}.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`OpenAI API returned status ${response.status}: ${errorText}`)
      }

      const responseData = await response.json()
      const content = responseData.choices?.[0]?.message?.content
      if (!content) {
        throw new Error('OpenAI returned empty message content')
      }

      const parsedJson = JSON.parse(content)
      const validation = postVisitAIOutputSchema.safeParse(parsedJson)

      if (!validation.success) {
        throw new Error(`AI structured output validation failed: ${JSON.stringify(validation.error.flatten())}`)
      }

      return await prisma.postVisitSummary.update({
        where: { consultationId },
        data: {
          patientSummary: validation.data.patientSummary.trim(),
          medicationSchedule: validation.data.medicationSchedule.trim(),
          followUpSteps: validation.data.followUpSteps.trim(),
          generationStatus: AIGenerationStatus.COMPLETED,
          errorMetadata: undefined,
        },
      })
    } catch (error: unknown) {
      const err = error as { message?: string }
      console.warn(`[PostVisitAI] Non-fatal generation error for consultation ${consultationId}:`, err.message)

      return await prisma.postVisitSummary.update({
        where: { consultationId },
        data: {
          generationStatus: AIGenerationStatus.FAILED,
          errorMetadata: {
            message: err.message || 'Unknown LLM generation error',
            timestamp: new Date().toISOString(),
          },
        },
      })
    }
  }
}
