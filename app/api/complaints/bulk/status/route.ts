import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

const BodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(2000),
})

/**
 * Returns the lightweight status of many complaints in one call so the
 * client can poll efficiently while a bulk upload is processing.
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
    return NextResponse.json({ error: "Validation failed" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("complaints")
    .select(
      "id,status,pipeline_status,category,sentiment,priority,needs_human_review,is_valid,pipeline_error,processing_time_ms",
    )
    .in("id", parsed.data.ids)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ statuses: data ?? [] })
}
