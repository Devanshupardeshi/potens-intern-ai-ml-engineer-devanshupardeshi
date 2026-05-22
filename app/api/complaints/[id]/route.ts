import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: complaint, error: cErr }, { data: runs, error: rErr }] = await Promise.all([
    supabase.from("complaints").select("*").eq("id", id).single(),
    supabase
      .from("agent_runs")
      .select("*")
      .eq("complaint_id", id)
      .order("agent_step", { ascending: true }),
  ])

  if (cErr || !complaint) {
    return NextResponse.json({ error: cErr?.message ?? "Not found" }, { status: 404 })
  }
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })

  return NextResponse.json({ complaint, runs: runs ?? [] })
}
