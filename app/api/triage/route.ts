import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { runTriageAgent } from "@/lib/agents/triage-agent"
import type { TriageTraceStep } from "@/lib/types"

export const maxDuration = 60

// =============================================================================
// Request validation schema
// =============================================================================

const TriageSubmitSchema = z.object({
  text: z.string().min(10).max(5000),
  metadata: z
    .object({
      customer_name: z.string().min(1).max(120).optional(),
      customer_email: z.string().email().optional(),
      product: z.string().max(120).optional(),
      channel: z.string().max(40).optional(),
      subject: z.string().max(200).optional(),
    })
    .optional(),
})

// =============================================================================
// POST /api/triage
// =============================================================================

export async function POST(req: Request) {
  // ---------------------------------------------------------------------------
  // 1. Parse and validate the request body
  // ---------------------------------------------------------------------------

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = TriageSubmitSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { text, metadata } = parsed.data

  // ---------------------------------------------------------------------------
  // 2. Insert complaint row — the agent run is attached to this row
  // ---------------------------------------------------------------------------

  const supabase = await createClient()

  const { data: row, error: insertError } = await supabase
    .from("complaints")
    .insert({
      customer_name: metadata?.customer_name ?? "Triage Submitter",
      customer_email: metadata?.customer_email ?? "triage@unknown.local",
      product: metadata?.product ?? null,
      subject: metadata?.subject ?? text.slice(0, 80),
      description: text,
      channel: metadata?.channel ?? "triage",
      status: "processing",
      pipeline_status: "queued",
    })
    .select("id")
    .single()

  if (insertError || !row) {
    return NextResponse.json(
      { error: insertError?.message ?? "Insert failed" },
      { status: 500 },
    )
  }

  const complaintId = row.id

  // ---------------------------------------------------------------------------
  // 3. Run the triage agent
  // ---------------------------------------------------------------------------

  let triage: Awaited<ReturnType<typeof runTriageAgent>>

  try {
    triage = await runTriageAgent({
      text,
      metadata: {
        customer_email: metadata?.customer_email,
        product: metadata?.product,
        channel: metadata?.channel,
      },
      complaintId,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // Mark the complaint as failed so it doesn't sit in "processing" forever
    await supabase
      .from("complaints")
      .update({
        status: "failed",
        pipeline_status: "failed",
        pipeline_error: message,
      })
      .eq("id", complaintId)

    return NextResponse.json({ error: message }, { status: 500 })
  }

  // ---------------------------------------------------------------------------
  // 4. Persist the triage decision back onto the complaint row
  // ---------------------------------------------------------------------------

  const finalStatus =
    triage.decision.next_tool === "escalate_to_human"
      ? "escalated"
      : "auto_resolved"

  await supabase
    .from("complaints")
    .update({
      triage_category: triage.decision.category,
      triage_priority: triage.decision.priority,
      triage_next_tool: triage.decision.next_tool,
      triage_reasoning: triage.decision.reasoning,
      triage_why: triage.decision.why,
      triage_confidence: triage.decision.confidence,
      status: finalStatus,
      pipeline_status: "completed",
      processing_time_ms: triage.duration_ms,
    })
    .eq("id", complaintId)

  // ---------------------------------------------------------------------------
  // 5. Persist each trace step as an agent_runs row for full audit visibility
  // ---------------------------------------------------------------------------

  if (triage.trace.length > 0) {
    const agentRunRows = triage.trace.map(
      (step: TriageTraceStep, i: number) => ({
        complaint_id: complaintId,
        agent_name:
          step.kind === "tool_call" || step.kind === "tool_result"
            ? step.tool
            : "triage_agent",
        agent_step: i + 1,
        model: triage.model,
        status: "completed",
        run_kind: "triage",
        input:
          step.kind === "tool_call"
            ? (step.args as Record<string, unknown>)
            : null,
        output:
          step.kind === "tool_result"
            ? (step.result as Record<string, unknown>)
            : step.kind === "final"
              ? (step.decision as unknown as Record<string, unknown>)
              : null,
        reasoning: step.kind === "thought" ? step.text : null,
        duration_ms: null,
        error:
          step.kind === "tool_result" && !step.ok ? "tool_failed" : null,
      }),
    )

    // Fire-and-forget — trace persistence failure must not block the response.
    // A failed insert is logged but the triage result is still returned.
    supabase
      .from("agent_runs")
      .insert(agentRunRows)
      .then(({ error }: { error: { message: string } | null }) => {
        if (error) {
          console.error("[triage] agent_runs insert error:", error.message)
        }
      })
      .catch((err: unknown) => {
        console.error(
          "[triage] agent_runs insert rejected:",
          err instanceof Error ? err.message : err,
        )
      })
  }

  // ---------------------------------------------------------------------------
  // 6. Return the full triage result to the client
  // ---------------------------------------------------------------------------

  return NextResponse.json(
    {
      complaint_id: complaintId,
      decision: triage.decision,
      trace: triage.trace,
      model: triage.model,
      steps_used: triage.steps_used,
      duration_ms: triage.duration_ms,
    },
    { status: 200 },
  )
}
