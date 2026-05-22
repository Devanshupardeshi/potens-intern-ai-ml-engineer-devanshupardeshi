import { NextResponse, after } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { runComplaintPipeline } from "@/lib/agents/pipeline"

export const maxDuration = 60

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()

  await supabase
    .from("complaints")
    .update({
      status: "processing",
      pipeline_status: "queued",
      pipeline_error: null,
    })
    .eq("id", id)

  after(async () => {
    try {
      await runComplaintPipeline(id)
    } catch (err) {
      console.error("[v0] retry pipeline error:", err)
    }
  })

  return NextResponse.json({ ok: true, id })
}
