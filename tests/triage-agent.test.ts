/**
 * tests/triage-agent.test.ts
 *
 * Integration tests for the triage agent. Runs the agent on 3 hand-picked
 * examples and validates structure, schema compliance, and diversity
 * of predictions.
 *
 * Requires LLM API keys (GOOGLE_GENERATIVE_AI_API_KEY or GROQ_API_KEY)
 * and Supabase env vars. Skips cleanly when unavailable.
 */

import { describe, it, expect } from "vitest"
import { runTriageAgent } from "../lib/agents/triage-agent"
import {
  TRIAGE_CATEGORIES,
  TRIAGE_TOOL_NAMES,
  type TriageDecision,
  type TriageTraceStep,
} from "../lib/types"

// ---------------------------------------------------------------------------
// Env gate
// ---------------------------------------------------------------------------

const hasLLMKey =
  !!process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
  !!process.env.GROQ_API_KEY

const hasSupabase =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const canRun = hasLLMKey && hasSupabase

// ---------------------------------------------------------------------------
// Test inputs
// ---------------------------------------------------------------------------

const INPUTS = [
  {
    name: "billing_double_charge",
    text:
      "I was charged twice for my Pro subscription this month — once on the 1st and again on the 3rd. " +
      "Both charges are $29. I have screenshots of my bank statement. Please refund the duplicate charge.",
    metadata: { customer_email: "test-billing@example.com", product: "Pro Subscription" },
  },
  {
    name: "vague_low_confidence",
    text:
      "Something seems off with the thing I bought recently. It doesn't really do what I expected. " +
      "Not sure if it's broken or I'm using it wrong.",
    metadata: { customer_email: "vague-user@example.com" },
  },
  {
    name: "safety_serious",
    text:
      "Your ProHeat 3000 space heater caught fire last night during normal operation. I have photos " +
      "and video of the fire and damage to my living room wall. I've already spoken with a product " +
      "liability attorney. This device needs an immediate recall before someone is seriously hurt.",
    metadata: { customer_email: "safety-test@example.com", product: "ProHeat 3000" },
  },
] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidDecision(d: TriageDecision): boolean {
  return (
    (TRIAGE_CATEGORIES as readonly string[]).includes(d.category) &&
    ["P0", "P1", "P2"].includes(d.priority) &&
    (TRIAGE_TOOL_NAMES as readonly string[]).includes(d.next_tool) &&
    typeof d.reasoning === "string" &&
    d.reasoning.length > 0 &&
    typeof d.why === "string" &&
    d.why.length > 0 &&
    typeof d.confidence === "number" &&
    d.confidence >= 0 &&
    d.confidence <= 1
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runTriageAgent", () => {
  it.skipIf(!canRun)(
    "returns valid structured decisions for 3 diverse inputs",
    async () => {
      const results = []

      for (const input of INPUTS) {
        const result = await runTriageAgent({
          text: input.text,
          metadata: input.metadata as {
            customer_email?: string
            product?: string
            channel?: string
          },
          complaintId: null,
        })

        // Structural assertions
        expect(result).toHaveProperty("decision")
        expect(result).toHaveProperty("trace")
        expect(result).toHaveProperty("steps_used")
        expect(result).toHaveProperty("model")
        expect(result).toHaveProperty("duration_ms")

        // Decision schema
        expect(isValidDecision(result.decision)).toBe(true)

        // Trace is array
        expect(Array.isArray(result.trace)).toBe(true)
        expect(result.trace.length).toBeGreaterThan(0)

        // Trace entries have valid kinds
        for (const step of result.trace) {
          expect(
            ["thought", "tool_call", "tool_result", "final"].includes(step.kind),
          ).toBe(true)
        }

        results.push(result)
      }

      // Diversity: the 3 inputs should produce at least 2 distinct next_tool values
      const distinctTools = new Set(results.map((r) => r.decision.next_tool))
      expect(distinctTools.size).toBeGreaterThanOrEqual(2)
    },
    { timeout: 120_000 },
  )
})
