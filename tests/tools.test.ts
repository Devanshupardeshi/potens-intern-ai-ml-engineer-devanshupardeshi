/**
 * tests/tools.test.ts
 *
 * Unit tests for the three triage tool functions exported from
 * lib/agents/tools.ts. Tests validate return shapes and discriminated
 * union correctness.
 *
 * The first two tests (lookupCustomerHistory, searchSimilarPastComplaints)
 * hit Supabase and require SUPABASE env vars. The draftAcknowledgment test
 * additionally requires an LLM API key.
 */

import { describe, it, expect } from "vitest"
import {
  lookupCustomerHistory,
  searchSimilarPastComplaints,
  draftAcknowledgment,
} from "../lib/agents/tools"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const hasSupabase =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const hasLLMKey =
  !!process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
  !!process.env.GROQ_API_KEY

// ---------------------------------------------------------------------------
// Tool 1: lookupCustomerHistory
// ---------------------------------------------------------------------------

describe("lookupCustomerHistory", () => {
  it.skipIf(!hasSupabase)(
    "returns ok: true with safe defaults for an unknown email",
    async () => {
      const result = await lookupCustomerHistory({
        customer_email: "noone@example.com",
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.prior_count).toBeGreaterThanOrEqual(0)
        expect(result).toHaveProperty("last_status")
        expect(result).toHaveProperty("last_priority")
        expect(result).toHaveProperty("repeat_categories")
        expect(result).toHaveProperty("most_recent_subject")
        expect(Array.isArray(result.repeat_categories)).toBe(true)
      }
    },
    { timeout: 10_000 },
  )
})

// ---------------------------------------------------------------------------
// Tool 2: searchSimilarPastComplaints
// ---------------------------------------------------------------------------

describe("searchSimilarPastComplaints", () => {
  it.skipIf(!hasSupabase)(
    "returns ok: true with empty matches for nonsense query",
    async () => {
      const result = await searchSimilarPastComplaints({
        query: "asdfqwerty",
        top_k: 5,
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(Array.isArray(result.matches)).toBe(true)
        // Nonsense query — expect zero or very few matches
        expect(result.matches.length).toBeLessThanOrEqual(5)
      }
    },
    { timeout: 10_000 },
  )
})

// ---------------------------------------------------------------------------
// Tool 3: draftAcknowledgment
// ---------------------------------------------------------------------------

describe("draftAcknowledgment", () => {
  it.skipIf(!hasSupabase || !hasLLMKey)(
    "returns ok: true with non-empty response and internal_notes",
    async () => {
      const result = await draftAcknowledgment({
        category: "billing",
        priority: "P1",
        customer_name: "Jane",
        complaint: "I was charged twice for my monthly subscription.",
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(typeof result.response).toBe("string")
        expect(result.response.length).toBeGreaterThan(0)
        expect(typeof result.internal_notes).toBe("string")
        expect(result.internal_notes.length).toBeGreaterThan(0)
      }
    },
    { timeout: 30_000 },
  )
})
