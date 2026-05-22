import { Output } from "ai"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { CATEGORIES } from "@/lib/types"
import { runFast, runReasoning } from "@/lib/agents/models"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AgentContext {
  complaintId: string
  step: number
  agentName: string
}

async function logAgentRun(
  ctx: AgentContext,
  modelId: string,
  input: Record<string, unknown>,
  output: Record<string, unknown> | null,
  reasoning: string | null,
  durationMs: number,
  error?: string,
) {
  const supabase = await createClient()
  await supabase.from("agent_runs").insert({
    complaint_id: ctx.complaintId,
    agent_name: ctx.agentName,
    agent_step: ctx.step,
    model: modelId,
    status: error ? "failed" : "completed",
    input,
    output,
    reasoning,
    duration_ms: durationMs,
    error: error ?? null,
  })
}

async function updatePipelineStatus(complaintId: string, status: string, patch: Record<string, unknown> = {}) {
  const supabase = await createClient()
  await supabase
    .from("complaints")
    .update({ pipeline_status: status, ...patch })
    .eq("id", complaintId)
}

// ---------------------------------------------------------------------------
// Agent 1: Validator
// ---------------------------------------------------------------------------
const ValidationSchema = z.object({
  is_valid: z.boolean().describe("True if this is a legitimate, actionable customer complaint"),
  reason: z.string().describe("Short justification (1-2 sentences) for the decision"),
})

async function validatorAgent(complaintId: string, subject: string, description: string) {
  const ctx: AgentContext = { complaintId, step: 1, agentName: "ValidatorAgent" }
  const start = Date.now()
  await updatePipelineStatus(complaintId, "validating")

  try {
    const { result, usedModelId } = await runFast({
      experimental_output: Output.object({ schema: ValidationSchema }),
      system:
        "You are a strict but fair complaint validator. Reject only spam, abuse, gibberish, or empty content. " +
        "Anything that is a real, actionable concern from a customer should be marked valid even if it is short.",
      prompt: `Subject: ${subject}\n\nDescription: ${description}\n\nIs this a legitimate complaint that deserves a response?`,
    })

    const out = result.experimental_output
    await logAgentRun(ctx, usedModelId, { subject, description }, out, result.text, Date.now() - start)
    return out
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await logAgentRun(ctx, "unknown", { subject, description }, null, null, Date.now() - start, message)
    throw err
  }
}

// ---------------------------------------------------------------------------
// Agent 2: Categorizer
// ---------------------------------------------------------------------------
const CategorizationSchema = z.object({
  category: z.enum(CATEGORIES).describe("Primary category"),
  subcategory: z.string().describe("More specific subcategory (free-form, 2-4 words)"),
  reasoning: z.string().describe("Why this category was chosen (1 sentence)"),
})

async function categorizerAgent(complaintId: string, subject: string, description: string, product: string | null) {
  const ctx: AgentContext = { complaintId, step: 2, agentName: "CategorizerAgent" }
  const start = Date.now()

  try {
    const { result, usedModelId } = await runFast({
      experimental_output: Output.object({ schema: CategorizationSchema }),
      system:
        "You categorize customer complaints into exactly one of the predefined categories. " +
        "Pick the single best fit. The subcategory should be specific (e.g. 'wrong charge', 'late delivery').",
      prompt: `Product: ${product ?? "unknown"}\nSubject: ${subject}\nDescription: ${description}\n\nClassify this complaint.`,
    })

    const out = result.experimental_output
    await logAgentRun(ctx, usedModelId, { subject, description, product }, out, result.text, Date.now() - start)
    return out
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await logAgentRun(ctx, "unknown", { subject, description, product }, null, null, Date.now() - start, message)
    throw err
  }
}

// ---------------------------------------------------------------------------
// Agent 3: Sentiment Analyzer
// ---------------------------------------------------------------------------
const SentimentSchema = z.object({
  sentiment: z.enum(["very_negative", "negative", "neutral", "positive"]),
  score: z.number().min(-1).max(1).describe("Sentiment score from -1 (very negative) to 1 (positive)"),
  emotional_indicators: z.array(z.string()).describe("Key emotional words or phrases detected"),
})

async function sentimentAgent(complaintId: string, description: string) {
  const ctx: AgentContext = { complaintId, step: 3, agentName: "SentimentAgent" }
  const start = Date.now()

  try {
    const { result, usedModelId } = await runFast({
      experimental_output: Output.object({ schema: SentimentSchema }),
      system:
        "You are a sentiment analyzer for customer complaints. " +
        "Return a sentiment label, a numeric score from -1 to 1, and the emotional indicators that drove your decision.",
      prompt: description,
    })

    const out = result.experimental_output
    await logAgentRun(ctx, usedModelId, { description }, out, result.text, Date.now() - start)
    return out
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await logAgentRun(ctx, "unknown", { description }, null, null, Date.now() - start, message)
    throw err
  }
}

// ---------------------------------------------------------------------------
// Agent 4: Priority Assigner
// ---------------------------------------------------------------------------
const PrioritySchema = z.object({
  priority: z.enum(["critical", "high", "medium", "low"]),
  score: z.number().int().min(0).max(100).describe("Priority score 0-100"),
  factors: z.array(z.string()).describe("Factors that influenced the priority"),
  needs_human_review: z.boolean().describe("True if a human should review before auto-responding"),
  escalation_reason: z.string().nullable().describe("If needs_human_review, the reason; otherwise null"),
})

async function priorityAgent(
  complaintId: string,
  subject: string,
  description: string,
  category: string,
  sentiment: string,
  sentimentScore: number,
) {
  const ctx: AgentContext = { complaintId, step: 4, agentName: "PriorityAgent" }
  const start = Date.now()
  await updatePipelineStatus(complaintId, "prioritizing")

  try {
    const { result, usedModelId } = await runReasoning({
      experimental_output: Output.object({ schema: PrioritySchema }),
      system:
        "You assign priority to customer complaints AND decide if a human should review them.\n" +
        "Rules:\n" +
        "- 'critical': safety issues, legal threats, fraud, data breaches, severe outage, explicit intent to escalate publicly. ALWAYS needs_human_review=true.\n" +
        "- 'high': significant financial impact, repeat issues, very_negative sentiment, churn risk. needs_human_review=true.\n" +
        "- 'medium': standard complaints with negative sentiment. needs_human_review=false unless ambiguous.\n" +
        "- 'low': minor issues, neutral sentiment, simple questions. needs_human_review=false.\n" +
        "Also set needs_human_review=true if the complaint is ambiguous, mentions legal/regulatory action, or you cannot confidently respond.",
      prompt: `Category: ${category}\nSentiment: ${sentiment} (score ${sentimentScore})\nSubject: ${subject}\nDescription: ${description}\n\nAssign priority and decide on escalation.`,
    })

    const out = result.experimental_output
    await logAgentRun(
      ctx,
      usedModelId,
      { subject, description, category, sentiment, sentimentScore },
      out,
      result.text,
      Date.now() - start,
    )
    return out
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await logAgentRun(ctx, "unknown", { subject, description }, null, null, Date.now() - start, message)
    throw err
  }
}

// ---------------------------------------------------------------------------
// Agent 5: Response Generator
// ---------------------------------------------------------------------------
const ResponseSchema = z.object({
  response: z.string().describe("Empathetic, professional response to the customer (3-6 sentences)"),
  internal_notes: z.string().describe("Internal notes for the support agent (1-2 sentences)"),
  recommended_actions: z.array(z.string()).describe("Concrete next steps (e.g. 'issue refund', 'escalate to billing')"),
})

async function responseAgent(
  complaintId: string,
  customerName: string,
  subject: string,
  description: string,
  category: string,
  sentiment: string,
  priority: string,
) {
  const ctx: AgentContext = { complaintId, step: 5, agentName: "ResponseAgent" }
  const start = Date.now()
  await updatePipelineStatus(complaintId, "generating_response")

  try {
    const { result, usedModelId } = await runReasoning({
      experimental_output: Output.object({ schema: ResponseSchema }),
      system:
        "You are an empathetic, professional customer support agent. " +
        "Acknowledge the customer's frustration, take responsibility where appropriate, " +
        "and provide a clear next step. Never make promises about specific timelines or refund amounts " +
        "unless explicitly told to. Keep responses 3-6 sentences. Sign off as 'The Support Team'.",
      prompt:
        `Customer: ${customerName}\n` +
        `Category: ${category}\n` +
        `Priority: ${priority}\n` +
        `Sentiment: ${sentiment}\n` +
        `Subject: ${subject}\n` +
        `Complaint: ${description}\n\n` +
        `Draft a response and internal handoff notes.`,
    })

    const out = result.experimental_output
    await logAgentRun(
      ctx,
      usedModelId,
      { customerName, subject, description, category, sentiment, priority },
      out,
      result.text,
      Date.now() - start,
    )
    return out
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await logAgentRun(ctx, "unknown", { subject, description }, null, null, Date.now() - start, message)
    throw err
  }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function runComplaintPipeline(complaintId: string) {
  const supabase = await createClient()
  const startedAt = Date.now()

  const { data: complaint, error } = await supabase.from("complaints").select("*").eq("id", complaintId).single()
  if (error || !complaint) {
    throw new Error(`Complaint ${complaintId} not found: ${error?.message}`)
  }

  await supabase.from("complaints").update({ status: "processing" }).eq("id", complaintId)

  try {
    // Step 1: Validate (must run first - cheap rejection of spam)
    const validation = await validatorAgent(complaintId, complaint.subject, complaint.description)
    if (!validation.is_valid) {
      await supabase
        .from("complaints")
        .update({
          is_valid: false,
          validation_reason: validation.reason,
          status: "rejected",
          pipeline_status: "completed",
          processing_time_ms: Date.now() - startedAt,
        })
        .eq("id", complaintId)
      return { ok: true, rejected: true, reason: validation.reason }
    }

    await supabase
      .from("complaints")
      .update({ is_valid: true, validation_reason: validation.reason })
      .eq("id", complaintId)

    // Step 2 + 3: Categorize and sentiment-analyze in PARALLEL.
    // They are independent, so running concurrently roughly halves this stage's
    // wall time. Each call grabs a fresh key from the pool.
    await updatePipelineStatus(complaintId, "categorizing_and_sentiment")
    const [categorization, sentiment] = await Promise.all([
      categorizerAgent(complaintId, complaint.subject, complaint.description, complaint.product),
      sentimentAgent(complaintId, complaint.description),
    ])

    await supabase
      .from("complaints")
      .update({
        category: categorization.category,
        subcategory: categorization.subcategory,
        sentiment: sentiment.sentiment,
        sentiment_score: sentiment.score,
      })
      .eq("id", complaintId)

    // Step 4: Priority + HITL decision (depends on category + sentiment)
    const priority = await priorityAgent(
      complaintId,
      complaint.subject,
      complaint.description,
      categorization.category,
      sentiment.sentiment,
      sentiment.score,
    )
    await supabase
      .from("complaints")
      .update({
        priority: priority.priority,
        priority_score: priority.score,
        needs_human_review: priority.needs_human_review,
        escalation_reason: priority.escalation_reason,
      })
      .eq("id", complaintId)

    // Step 5: Response (depends on everything)
    const response = await responseAgent(
      complaintId,
      complaint.customer_name,
      complaint.subject,
      complaint.description,
      categorization.category,
      sentiment.sentiment,
      priority.priority,
    )

    const finalStatus: "auto_resolved" | "escalated" = priority.needs_human_review ? "escalated" : "auto_resolved"

    await supabase
      .from("complaints")
      .update({
        suggested_response: response.response,
        status: finalStatus,
        pipeline_status: "completed",
        processing_time_ms: Date.now() - startedAt,
      })
      .eq("id", complaintId)

    return {
      ok: true,
      rejected: false,
      status: finalStatus,
      category: categorization.category,
      priority: priority.priority,
      sentiment: sentiment.sentiment,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await supabase
      .from("complaints")
      .update({
        pipeline_status: "failed",
        pipeline_error: message,
        status: "failed",
        processing_time_ms: Date.now() - startedAt,
      })
      .eq("id", complaintId)
    throw err
  }
}
