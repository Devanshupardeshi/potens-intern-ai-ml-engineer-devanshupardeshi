import { tool, stepCountIs, Output } from "ai"
import { z } from "zod"
import { runReasoning } from "@/lib/agents/models"
import {
  lookupCustomerHistory,
  lookupCustomerHistoryInput,
  searchSimilarPastComplaints,
  searchSimilarComplaintsInput,
  draftAcknowledgment,
  draftAcknowledgmentInput,
} from "@/lib/agents/tools"
import {
  TRIAGE_CATEGORIES,
  TRIAGE_TOOL_NAMES,
  type TriageDecision,
  type TriageRunResult,
  type TriageTraceStep,
} from "@/lib/types"
import { createClient } from "@/lib/supabase/server"

// =============================================================================
// Output schema — the structured decision the model must return.
// Mirrors TriageDecision from lib/types.ts but with Zod for AI SDK validation.
// =============================================================================

const TriageOutputSchema = z.object({
  category: z.enum(TRIAGE_CATEGORIES),
  priority: z.enum(["P0", "P1", "P2"]),
  next_tool: z.enum(TRIAGE_TOOL_NAMES),
  reasoning: z
    .string()
    .min(20)
    .describe("Multi-sentence explanation of the decision"),
  why: z
    .string()
    .min(10)
    .max(280)
    .describe("Single-sentence explanation for why this decision was made"),
  confidence: z.number().min(0).max(1),
})

// =============================================================================
// Escalation DB logic — extracted so it can be reused by both the standalone
// makeEscalateTool factory and the trace-aware inline tool in runTriageAgent.
// =============================================================================

async function executeEscalation(
  complaintId: string | null,
  reason: string,
): Promise<
  | { ok: true; ticket_id: string; queued_position: number; reason: string }
  | { ok: false; error: string }
> {
  if (!complaintId) {
    // Dry-run mode: no complaint row exists yet (e.g. called from tests or
    // a pre-insert triage path).
    return { ok: true, ticket_id: "dry-run", queued_position: 0, reason }
  }

  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from("complaints")
      .update({
        needs_human_review: true,
        escalation_reason: reason,
      })
      .eq("id", complaintId)

    if (error) {
      return { ok: false, error: error.message }
    }

    return {
      ok: true,
      ticket_id: complaintId,
      queued_position: -1, // exact position determined by the human review queue
      reason,
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// =============================================================================
// makeEscalateTool — standalone factory exported for reuse and testing.
// Wraps executeEscalation in an AI SDK tool definition without trace side-effects
// so it can be used outside of runTriageAgent if needed.
// =============================================================================

export function makeEscalateTool(complaintId: string | null) {
  return tool({
    description:
      "Call this when confidence is low (<0.7) OR when the complaint involves " +
      "safety, legal threats, fraud, or self-harm. This routes the complaint to a " +
      "human reviewer and returns the queue ticket id.",
    inputSchema: z.object({
      reason: z
        .string()
        .min(5)
        .describe("Why human review is needed"),
    }),
    execute: async ({ reason }: { reason: string }) =>
      executeEscalation(complaintId, reason),
  })
}

// =============================================================================
// runTriageAgent — the main triage agent with real tool calling.
//
// The model receives the complaint text and metadata, decides which tools to
// call (in any order, up to stepCountIs(6) steps), then returns a structured
// TriageDecision. Every tool call and result is recorded in the trace array so
// the caller has a full reasoning audit trail.
// =============================================================================

export async function runTriageAgent(args: {
  text: string
  metadata?: {
    customer_email?: string
    product?: string
    channel?: string
  }
  complaintId?: string | null
}): Promise<TriageRunResult> {
  const start = Date.now()
  const trace: TriageTraceStep[] = []

  /** ISO timestamp helper — called inline to capture the moment each event occurs */
  const ts = () => new Date().toISOString()

  // ---------------------------------------------------------------------------
  // System prompt
  // ---------------------------------------------------------------------------

  const system =
    "You are a triage agent for a customer support backlog. " +
    "You receive a free-text complaint plus optional metadata (customer_email, product, channel). " +
    "You have FOUR tools available; you decide which (if any) to call, in any order, before producing a final triage decision. " +
    "Categories (pick exactly one): billing, product_defect, shipping, account_access, safety_or_legal. " +
    "Priority: P0 (immediate harm: safety/legal/fraud/severe outage), P1 (significant impact: financial loss, repeat customer, churn risk), P2 (routine). " +
    "next_tool must be one of: lookup_customer_history, search_similar_past_complaints, draft_acknowledgment, escalate_to_human, none — " +
    "it represents what a human operator should do next AFTER you finish. " +
    "Always include `reasoning` and `why`. " +
    "If your confidence is below 0.7 OR the case involves safety/legal/fraud, you MUST call escalate_to_human before finishing."

  // ---------------------------------------------------------------------------
  // User prompt
  // ---------------------------------------------------------------------------

  const userPrompt =
    `Complaint:\n${args.text}\n\n` +
    `Metadata:\n` +
    `- customer_email: ${args.metadata?.customer_email ?? "(none)"}\n` +
    `- product: ${args.metadata?.product ?? "(none)"}\n` +
    `- channel: ${args.metadata?.channel ?? "web"}\n`

  // ---------------------------------------------------------------------------
  // Tool definitions — each wrapper pushes tool_call / tool_result trace events
  // before and after calling the real implementation.
  // ---------------------------------------------------------------------------

  const tools = {
    lookup_customer_history: tool({
      description:
        "Fetch this customer's prior complaint history (last 20 submissions). " +
        "Call this when the customer_email is known and you need to check for repeat issues, " +
        "last status, or the categories they have complained about before.",
      inputSchema: lookupCustomerHistoryInput,
      execute: async (input: { customer_email: string }) => {
        trace.push({
          kind: "tool_call",
          tool: "lookup_customer_history",
          args: input as Record<string, unknown>,
          timestamp: ts(),
        })
        const result = await lookupCustomerHistory(input)
        trace.push({
          kind: "tool_result",
          tool: "lookup_customer_history",
          result,
          ok: result.ok,
          timestamp: ts(),
        })
        return result
      },
    }),

    search_similar_past_complaints: tool({
      description:
        "Search the complaint archive using full-text search against past subjects and descriptions. " +
        "Call this when you want to find how similar cases were resolved, or to calibrate priority " +
        "based on how the team handled comparable issues before.",
      inputSchema: searchSimilarComplaintsInput,
      execute: async (input: { query: string; top_k: number }) => {
        trace.push({
          kind: "tool_call",
          tool: "search_similar_past_complaints",
          args: input as Record<string, unknown>,
          timestamp: ts(),
        })
        const result = await searchSimilarPastComplaints(input)
        trace.push({
          kind: "tool_result",
          tool: "search_similar_past_complaints",
          result,
          ok: result.ok,
          timestamp: ts(),
        })
        return result
      },
    }),

    draft_acknowledgment: tool({
      description:
        "Generate an AI-drafted initial acknowledgment message for the customer, " +
        "along with internal notes for the support reviewer. Call this when the case " +
        "is clear enough to auto-draft a response (confidence ≥ 0.7, no safety/legal concerns).",
      inputSchema: draftAcknowledgmentInput,
      execute: async (input: {
        category: (typeof TRIAGE_CATEGORIES)[number]
        priority: "P0" | "P1" | "P2"
        customer_name?: string
        complaint: string
      }) => {
        trace.push({
          kind: "tool_call",
          tool: "draft_acknowledgment",
          args: input as Record<string, unknown>,
          timestamp: ts(),
        })
        const result = await draftAcknowledgment(input)
        trace.push({
          kind: "tool_result",
          tool: "draft_acknowledgment",
          result,
          ok: result.ok,
          timestamp: ts(),
        })
        return result
      },
    }),

    // The escalation tool is defined inline (rather than via makeEscalateTool)
    // so it shares the trace array closure while still calling the same
    // executeEscalation logic that makeEscalateTool uses.
    escalate_to_human: tool({
      description:
        "Call this when confidence is low (<0.7) OR when the complaint involves " +
        "safety, legal threats, fraud, or self-harm. This routes the complaint to a " +
        "human reviewer and returns the queue ticket id.",
      inputSchema: z.object({
        reason: z
          .string()
          .min(5)
          .describe("Why human review is needed"),
      }),
      execute: async (input: { reason: string }) => {
        trace.push({
          kind: "tool_call",
          tool: "escalate_to_human",
          args: input as Record<string, unknown>,
          timestamp: ts(),
        })
        const result = await executeEscalation(
          args.complaintId ?? null,
          input.reason,
        )
        trace.push({
          kind: "tool_result",
          tool: "escalate_to_human",
          result,
          ok: result.ok,
          timestamp: ts(),
        })
        return result
      },
    }),
  }

  // ---------------------------------------------------------------------------
  // AI generation — reasoning model with structured output + tool calling
  // ---------------------------------------------------------------------------

  const { result, usedModelId } = await runReasoning({
    system,
    prompt: userPrompt,
    tools,
    stopWhen: stepCountIs(6),
    experimental_output: Output.object({ schema: TriageOutputSchema }),
  })

  // ---------------------------------------------------------------------------
  // Trace: collect model thought steps then append the final decision
  // ---------------------------------------------------------------------------

  for (const step of result.steps ?? []) {
    if (step.text) {
      trace.push({ kind: "thought", text: step.text, timestamp: ts() })
    }
  }

  const decision = result.experimental_output as TriageDecision | undefined
  if (!decision) {
    throw new Error(
      "Triage agent: model returned no structured output. " +
      "This usually means the model failed to conform to the output schema.",
    )
  }
  trace.push({ kind: "final", decision, timestamp: ts() })

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    decision,
    trace,
    steps_used: result.steps?.length ?? 1,
    model: usedModelId,
    duration_ms: Date.now() - start,
  }
}
