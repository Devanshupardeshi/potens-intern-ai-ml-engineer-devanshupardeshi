import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"

const ResolveSchema = z.object({
  action: z.enum(["resolve", "approve_response", "reject", "edit_response"]),
  resolution_notes: z.string().optional(),
  resolved_by: z.string().optional(),
  edited_response: z.string().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = ResolveSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 })
  }

  const supabase = await createClient()
  const update: Record<string, unknown> = {}

  if (parsed.data.action === "resolve" || parsed.data.action === "approve_response") {
    update.status = "resolved"
    update.resolved_at = new Date().toISOString()
    update.resolved_by = parsed.data.resolved_by ?? "Support Team"
    update.resolution_notes = parsed.data.resolution_notes ?? null
  } else if (parsed.data.action === "reject") {
    update.status = "rejected"
    update.resolved_at = new Date().toISOString()
    update.resolved_by = parsed.data.resolved_by ?? "Support Team"
    update.resolution_notes = parsed.data.resolution_notes ?? null
  } else if (parsed.data.action === "edit_response") {
    if (!parsed.data.edited_response) {
      return NextResponse.json({ error: "edited_response required" }, { status: 400 })
    }
    update.suggested_response = parsed.data.edited_response
  }

  const { data, error } = await supabase
    .from("complaints")
    .update(update)
    .eq("id", id)
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ complaint: data })
}
