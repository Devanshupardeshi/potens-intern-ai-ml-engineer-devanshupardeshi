/**
 * tests/types.test.ts
 *
 * Type-level and schema-level verification for the triage types.
 * Validates that a sample TriageDecision object round-trips through
 * the Zod output schema without data loss or type errors.
 *
 * No external dependencies — runs fully offline.
 */

import { describe, it, expect } from "vitest"
import { z } from "zod"
import {
  TRIAGE_CATEGORIES,
  TRIAGE_TOOL_NAMES,
  type TriageDecision,
  type TriageCategory,
  type TriagePriority,
  type TriageToolName,
  type TriageTraceStep,
} from "../lib/types"

// ---------------------------------------------------------------------------
// Schema mirror — same shape used in the triage agent and baseline classifier
// ---------------------------------------------------------------------------

const TriageDecisionSchema = z.object({
  category: z.enum(TRIAGE_CATEGORIES),
  priority: z.enum(["P0", "P1", "P2"]),
  next_tool: z.enum(TRIAGE_TOOL_NAMES),
  reasoning: z.string().min(1),
  why: z.string().min(1),
  confidence: z.number().min(0).max(1),
})

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const VALID_DECISION: TriageDecision = {
  category: "billing",
  priority: "P1",
  next_tool: "draft_acknowledgment",
  reasoning:
    "The customer was charged twice for the same subscription period. " +
    "This is a clear billing error requiring a refund acknowledgment.",
  why: "Duplicate charge on Pro Subscription — standard billing issue.",
  confidence: 0.92,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TriageDecision schema", () => {
  it("accepts a valid TriageDecision object", () => {
    const result = TriageDecisionSchema.safeParse(VALID_DECISION)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.category).toBe(VALID_DECISION.category)
      expect(result.data.priority).toBe(VALID_DECISION.priority)
      expect(result.data.next_tool).toBe(VALID_DECISION.next_tool)
      expect(result.data.reasoning).toBe(VALID_DECISION.reasoning)
      expect(result.data.why).toBe(VALID_DECISION.why)
      expect(result.data.confidence).toBe(VALID_DECISION.confidence)
    }
  })

  it("round-trips through parse → serialize → parse", () => {
    const first = TriageDecisionSchema.parse(VALID_DECISION)
    const serialized = JSON.stringify(first)
    const second = TriageDecisionSchema.parse(JSON.parse(serialized))

    expect(second).toEqual(first)
  })

  it("rejects invalid category", () => {
    const bad = { ...VALID_DECISION, category: "not_a_category" }
    const result = TriageDecisionSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it("rejects invalid priority", () => {
    const bad = { ...VALID_DECISION, priority: "P9" }
    const result = TriageDecisionSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it("rejects invalid next_tool", () => {
    const bad = { ...VALID_DECISION, next_tool: "launch_missiles" }
    const result = TriageDecisionSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it("rejects confidence outside 0-1", () => {
    expect(
      TriageDecisionSchema.safeParse({ ...VALID_DECISION, confidence: -0.1 }).success,
    ).toBe(false)
    expect(
      TriageDecisionSchema.safeParse({ ...VALID_DECISION, confidence: 1.5 }).success,
    ).toBe(false)
  })

  it("rejects empty reasoning", () => {
    const bad = { ...VALID_DECISION, reasoning: "" }
    const result = TriageDecisionSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it("accepts all valid categories", () => {
    for (const cat of TRIAGE_CATEGORIES) {
      const obj = { ...VALID_DECISION, category: cat }
      expect(TriageDecisionSchema.safeParse(obj).success).toBe(true)
    }
  })

  it("accepts all valid tool names", () => {
    for (const tool of TRIAGE_TOOL_NAMES) {
      const obj = { ...VALID_DECISION, next_tool: tool }
      expect(TriageDecisionSchema.safeParse(obj).success).toBe(true)
    }
  })

  it("accepts all valid priorities", () => {
    for (const pri of ["P0", "P1", "P2"]) {
      const obj = { ...VALID_DECISION, priority: pri }
      expect(TriageDecisionSchema.safeParse(obj).success).toBe(true)
    }
  })
})

describe("TriageTraceStep type completeness", () => {
  it("validates thought trace step shape", () => {
    const step: TriageTraceStep = {
      kind: "thought",
      text: "Analyzing the complaint",
      timestamp: new Date().toISOString(),
    }
    expect(step.kind).toBe("thought")
    expect(step.text.length).toBeGreaterThan(0)
  })

  it("validates tool_call trace step shape", () => {
    const step: TriageTraceStep = {
      kind: "tool_call",
      tool: "lookup_customer_history",
      args: { customer_email: "test@example.com" },
      timestamp: new Date().toISOString(),
    }
    expect(step.kind).toBe("tool_call")
    expect(step.tool).toBe("lookup_customer_history")
  })

  it("validates tool_result trace step shape", () => {
    const step: TriageTraceStep = {
      kind: "tool_result",
      tool: "lookup_customer_history",
      result: { ok: true, prior_count: 0 },
      ok: true,
      timestamp: new Date().toISOString(),
    }
    expect(step.kind).toBe("tool_result")
    expect(step.ok).toBe(true)
  })

  it("validates final trace step shape", () => {
    const step: TriageTraceStep = {
      kind: "final",
      decision: VALID_DECISION,
      timestamp: new Date().toISOString(),
    }
    expect(step.kind).toBe("final")
    expect(step.decision.category).toBe("billing")
  })
})
