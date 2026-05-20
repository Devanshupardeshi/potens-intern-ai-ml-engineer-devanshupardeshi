import { Output } from "ai"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { runReasoning } from "@/lib/agents/models"
import { TRIAGE_CATEGORIES } from "@/lib/types"

// =============================================================================
// Tool 1 — lookupCustomerHistory
// Query the complaints table for all prior submissions from a customer email
// and summarise the history into a compact signal for the triage agent.
// =============================================================================

export const lookupCustomerHistoryInput = z.object({
  customer_email: z
    .string()
    .email()
    .describe("Customer email to look up history for"),
})

export type LookupCustomerHistoryInput = z.infer<
  typeof lookupCustomerHistoryInput
>

export const lookupCustomerHistoryOutput = z.object({
  prior_count: z.number(),
  last_status: z.string().nullable(),
  last_priority: z.string().nullable(),
  repeat_categories: z.array(z.string()),
  most_recent_subject: z.string().nullable(),
  ok: z.literal(true),
})

export type LookupCustomerHistoryOutput = z.infer<
  typeof lookupCustomerHistoryOutput
>

export async function lookupCustomerHistory(
  input: LookupCustomerHistoryInput,
): Promise<LookupCustomerHistoryOutput | { ok: false; error: string }> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("complaints")
      .select("category, triage_category, priority, triage_priority, status, subject, created_at")
      .eq("customer_email", input.customer_email)
      .order("created_at", { ascending: false })
      .limit(20)

    if (error) {
      return { ok: false, error: error.message }
    }

    const rows = data ?? []
    const prior_count = rows.length

    // Most recent row is first because of descending order
    const last_status = rows[0]?.status ?? null
    // Prefer triage_priority (P0/P1/P2) for complaints routed via the triage
    // agent; fall back to legacy priority for complaints from the old pipeline.
    const last_priority = rows[0]?.triage_priority ?? rows[0]?.priority ?? null
    const most_recent_subject = rows[0]?.subject ?? null

    // Resolve effective category per row, preferring triage_category
    const categoryFreq: Record<string, number> = {}
    for (const row of rows) {
      const cat = (row as { triage_category?: string | null; category?: string | null }).triage_category ?? row.category
      if (cat) {
        categoryFreq[cat] = (categoryFreq[cat] ?? 0) + 1
      }
    }
    const repeat_categories = Object.entries(categoryFreq)
      .filter(([, count]) => count >= 2)
      .map(([cat]) => cat)

    return {
      ok: true,
      prior_count,
      last_status,
      last_priority,
      repeat_categories,
      most_recent_subject,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}

// =============================================================================
// Tool 2 — searchSimilarPastComplaints
// Use the description_tsv GIN-indexed generated column (added in migration 002)
// to find complaints whose subject+description text is similar to the query.
// The ranking score is a simple 1/rank approximation since Supabase JS client
// does not expose the raw ts_rank value directly.
// =============================================================================

export const searchSimilarComplaintsInput = z.object({
  query: z.string().min(3),
  top_k: z.number().int().min(1).max(10).default(5),
})

export type SearchSimilarComplaintsInput = z.infer<
  typeof searchSimilarComplaintsInput
>

export const searchSimilarComplaintsOutput = z.object({
  matches: z.array(
    z.object({
      id: z.string(),
      subject: z.string(),
      category: z.string().nullable(),
      priority: z.string().nullable(),
      status: z.string(),
      rank: z.number(),
      resolution_notes: z.string().nullable(),
    }),
  ),
  ok: z.literal(true),
})

export type SearchSimilarComplaintsOutput = z.infer<
  typeof searchSimilarComplaintsOutput
>

export async function searchSimilarPastComplaints(
  input: SearchSimilarComplaintsInput,
): Promise<SearchSimilarComplaintsOutput | { ok: false; error: string }> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("complaints")
      .select(
        "id, subject, category, triage_category, priority, triage_priority, status, resolution_notes",
      )
      // Pass the raw query — websearch_to_tsquery handles tokenisation and
      // punctuation correctly. Pre-splitting on whitespace produces malformed
      // tsquery strings when the input contains punctuation.
      .textSearch("description_tsv", input.query, { type: "websearch" })
      .limit(input.top_k)

    if (error) {
      return { ok: false, error: error.message }
    }

    const rows = data ?? []

    if (rows.length === 0) {
      return { ok: true, matches: [] }
    }

    // Assign a linearly decreasing rank score: first result = 1.0, last ≥ 0.1
    const total = rows.length
    const matches = rows.map(
      (
        row: {
          id: string
          subject: string
          category: string | null
          triage_category: string | null
          priority: string | null
          triage_priority: string | null
          status: string
          resolution_notes: string | null
        },
        idx: number,
      ) => ({
        id: row.id,
        subject: row.subject,
        // Prefer triage_category/triage_priority for complaints that went
        // through the new triage agent; fall back to legacy values otherwise.
        category: row.triage_category ?? row.category ?? null,
        priority: row.triage_priority ?? row.priority ?? null,
        status: row.status,
        resolution_notes: row.resolution_notes ?? null,
        rank: parseFloat(
          (1.0 - (idx / Math.max(total - 1, 1)) * 0.9).toFixed(3),
        ),
      }),
    )

    return { ok: true, matches }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}

// =============================================================================
// Tool 3 — draftAcknowledgment
// Use the reasoning model (via runReasoning) to generate a real AI-drafted
// acknowledgment message and internal notes. Structured output is extracted
// via the AI SDK's experimental_output mechanism — same pattern as the
// existing pipeline agents.
// =============================================================================

export const draftAcknowledgmentInput = z.object({
  category: z.enum(TRIAGE_CATEGORIES),
  priority: z.enum(["P0", "P1", "P2"]),
  // Optional — when absent the prompt omits the name line entirely so the
  // model doesn't produce "Dear there," or similar awkward phrasing.
  customer_name: z.string().optional(),
  complaint: z.string().min(10),
})

export type DraftAcknowledgmentInput = z.infer<
  typeof draftAcknowledgmentInput
>

export const draftAcknowledgmentOutput = z.object({
  response: z.string(),
  internal_notes: z.string(),
  ok: z.literal(true),
})

export type DraftAcknowledgmentOutput = z.infer<
  typeof draftAcknowledgmentOutput
>

const AcknowledgmentSchema = z.object({
  response: z
    .string()
    .describe("Customer-facing acknowledgment message (3–6 sentences)"),
  internal_notes: z
    .string()
    .describe("Internal reviewer notes (1–2 sentences, not shown to customer)"),
})

// Priority-to-urgency label mapping — used only to inform the prompt tone,
// not to gate logic or route by keyword.
const PRIORITY_URGENCY: Record<"P0" | "P1" | "P2", string> = {
  P0: "critically urgent (safety / legal risk — respond within 1 hour)",
  P1: "high-urgency (significant customer impact — respond within 4 hours)",
  P2: "standard priority (respond within 24 hours)",
}

export async function draftAcknowledgment(
  input: DraftAcknowledgmentInput,
): Promise<DraftAcknowledgmentOutput | { ok: false; error: string }> {
  try {
    const urgencyLabel = PRIORITY_URGENCY[input.priority as "P0" | "P1" | "P2"]

    // Only include the name line when we have a real name — avoids prompts
    // like "Customer name: there" that confuse the model into a literal greeting.
    const namePart =
      input.customer_name && input.customer_name !== "there"
        ? `Customer name: ${input.customer_name}\n`
        : ""

    const { result } = await runReasoning({
      experimental_output: Output.object({ schema: AcknowledgmentSchema }),
      system:
        "You are an empathetic, professional customer support agent drafting an initial acknowledgment.\n" +
        "Rules:\n" +
        "- Write 3–6 sentences maximum for the customer response.\n" +
        "- Acknowledge the issue clearly and show genuine empathy.\n" +
        "- Do NOT promise specific refund amounts, timelines, or outcomes.\n" +
        "- Do NOT use hollow filler phrases like 'We apologise for the inconvenience'.\n" +
        "- Sign off as 'The Support Team'.\n" +
        "- The internal_notes field is for reviewers only and must NOT repeat the customer response; " +
        "use it to flag context or risks the reviewer should know.\n" +
        "- Match the tone to the urgency level provided.",
      prompt:
        namePart +
        `Category: ${input.category}\n` +
        `Priority: ${input.priority} — ${urgencyLabel}\n` +
        `Complaint:\n${input.complaint}\n\n` +
        `Draft an acknowledgment response and internal notes.`,
    })

    const out = result.experimental_output
    if (!out) {
      return { ok: false, error: "Model returned no structured output" }
    }

    return {
      ok: true,
      response: out.response,
      internal_notes: out.internal_notes,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}
