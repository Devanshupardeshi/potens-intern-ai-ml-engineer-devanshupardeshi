import { NextResponse, after } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { runComplaintPipeline } from "@/lib/agents/pipeline"

export const maxDuration = 60

const RowSchema = z.object({
  customer_name: z.string().min(1).max(200),
  customer_email: z.string().email(),
  product: z.string().max(200).optional().nullable(),
  subject: z.string().min(3).max(300),
  description: z.string().min(5).max(8000),
  channel: z.string().max(60).optional().nullable(),
})

const BodySchema = z.object({
  rows: z.array(RowSchema).min(1).max(2000),
  /** how many pipelines to run concurrently (default 6) */
  concurrency: z.number().int().min(1).max(20).optional(),
})

/**
 * Accepts a batch of complaint rows (already parsed client-side from
 * Excel/CSV). Inserts them all in one transaction, then fires off the
 * agentic pipeline for each one with a bounded concurrency limit.
 *
 * Returns the list of inserted complaint IDs immediately so the client
 * can start polling for live status.
 */
export async function POST(req: Request) {
  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const supabase = await createClient()
  // Default concurrency 4: with 5 Groq + 7 Gemini keys, 4 in-flight requests
  // means each step has plenty of cooled-down keys to choose from. Pushing
  // higher exhausts the pool faster than the 60s cooldown can recover.
  const concurrency = parsed.data.concurrency ?? 4

  const inserts = parsed.data.rows.map((r) => ({
    customer_name: r.customer_name,
    customer_email: r.customer_email,
    product: r.product ?? null,
    subject: r.subject,
    description: r.description,
    channel: r.channel ?? "bulk_upload",
    status: "pending" as const,
    pipeline_status: "queued" as const,
  }))

  const { data, error } = await supabase.from("complaints").insert(inserts).select("id")
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 })
  }

  const ids = data.map((d) => d.id as string)

  // Fire off pipelines with a bounded concurrency limit AFTER returning the
  // response. `after()` keeps the serverless function alive until all rows
  // are processed. Each pipeline call rotates through the API key pool, so
  // 6 concurrent workers fan out across all available Groq + Gemini keys.
  after(async () => {
    await runWithConcurrency(ids, concurrency, async (id) => {
      try {
        await runComplaintPipeline(id)
      } catch (err) {
        console.error(`[v0] Pipeline failed for ${id}:`, err instanceof Error ? err.message : err)
      }
    })
  })

  return NextResponse.json({ ids, count: ids.length, concurrency }, { status: 201 })
}

/**
 * Run an async fn over a list with a bounded number of concurrent workers.
 */
async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  const queue = items.slice()
  const runners: Promise<void>[] = []
  const start = async () => {
    while (queue.length > 0) {
      const item = queue.shift()
      if (item === undefined) return
      await worker(item)
    }
  }
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    runners.push(start())
  }
  await Promise.all(runners)
}
