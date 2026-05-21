import { Output } from "ai"
import { z } from "zod"

import { runReasoning } from "@/lib/agents/models"

import {
  TRIAGE_CATEGORIES,
  TRIAGE_TOOL_NAMES,
  type TriageDecision,
} from "@/lib/types"

// =============================================================================
// Output schema — same shape as the triage agent's TriageDecision but enforced
// via a single-prompt completion without any tool calls.
// =============================================================================

const BaselineSchema = z.object({
  category: z.enum(TRIAGE_CATEGORIES),
  priority: z.enum(["P0", "P1", "P2"]),
  next_tool: z.enum(TRIAGE_TOOL_NAMES),
  reasoning: z.string().min(10),
  why: z.string().min(5),
  confidence: z.number().min(0).max(1),
})

// =============================================================================
// System prompt — deliberately kept simple. No tool instructions, no
// multi-step reasoning guidance. The point is to measure the gap.
// =============================================================================

const SYSTEM_PROMPT =
  "You are a single-prompt complaint triage classifier.\n" +
  "You have NO tools. You cannot look up customer history, " +
  "search past complaints, draft responses, or escalate tickets.\n\n" +
  "Given a customer complaint, produce a JSON triage decision.\n\n" +
  "Categories (pick exactly one):\n" +
  "  billing, product_defect, shipping, account_access, safety_or_legal\n\n" +
  "Priorities:\n" +
  "  P0 — immediate harm: safety, legal, fraud, severe outage\n" +
  "  P1 — significant impact: financial loss, repeat customer, churn risk\n" +
  "  P2 — routine\n\n" +
  "next_tool — recommend what a human operator should do next:\n" +
  "  lookup_customer_history, search_similar_past_complaints, " +
  "draft_acknowledgment, escalate_to_human, none\n\n" +
  "Always include:\n" +
  "  reasoning — multi-sentence explanation\n" +
  "  why — one-sentence summary\n" +
  "  confidence — 0.0 to 1.0\n\n" +
  "Make the best judgment from the complaint text alone. " +
  "You have no access to external data."

// =============================================================================
// runBaselineClassifier
//
// Single-prompt, no-tool classifier. Returns the same TriageDecision schema
// as the real triage agent so the comparison script can diff them directly.
// =============================================================================

export interface BaselineResult {
  decision: TriageDecision
  model: string
  duration_ms: number
}

export async function runBaselineClassifier(
  text: string,
  metadata?: Record<string, string>,
): Promise<BaselineResult> {
  const start = Date.now()

  const metaPart = metadata
    ? "\nMetadata:\n" +
      Object.entries(metadata)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join("\n") +
      "\n"
    : ""

  const { result, usedModelId } = await runReasoning({
    system: SYSTEM_PROMPT,
    prompt: `Complaint:\n${text}\n${metaPart}\nClassify this complaint.`,
    experimental_output: Output.object({ schema: BaselineSchema }),
  })

  const decision = result.experimental_output as TriageDecision | undefined
  if (!decision) {
    throw new Error(
      "Baseline classifier: model returned no structured output.",
    )
  }

  return {
    decision,
    model: usedModelId,
    duration_ms: Date.now() - start,
  }
}
