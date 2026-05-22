import { NextResponse, after } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { runComplaintPipeline } from "@/lib/agents/pipeline"
import { z } from "zod"

export const maxDuration = 60

const SubmitSchema = z.object({
  customer_name: z.string().min(1).max(120),
  customer_email: z.string().email(),
  product: z.string().max(120).optional().nullable(),
  subject: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  channel: z.string().max(40).optional(),
})

export async function POST(req: Request) {
  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = SubmitSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("complaints")
    .insert({
      customer_name: parsed.data.customer_name,
      customer_email: parsed.data.customer_email,
      product: parsed.data.product ?? null,
      subject: parsed.data.subject,
      description: parsed.data.description,
      channel: parsed.data.channel ?? "web",
      status: "pending",
      pipeline_status: "queued",
    })
    .select("id")
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 })
  }

  // Kick off the pipeline AFTER returning the response. `after()` keeps the
  // serverless function alive until the work completes, which means this
  // works in production on Vercel as well as locally in dev.
  after(async () => {
    try {
      await runComplaintPipeline(data.id)
    } catch (err) {
      console.error("[v0] Pipeline error:", err instanceof Error ? err.message : err)
    }
  })

  return NextResponse.json({ id: data.id }, { status: 201 })
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const status = url.searchParams.get("status")
  const priority = url.searchParams.get("priority")
  const needsReview = url.searchParams.get("needs_review")
  const limit = Math.min(Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200)

  const supabase = await createClient()
  let query = supabase
    .from("complaints")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (status) query = query.eq("status", status)
  if (priority) query = query.eq("priority", priority)
  if (needsReview === "true") query = query.eq("needs_human_review", true)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ complaints: data ?? [] })
}
