import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase.from("complaints").select(
    "id,status,priority,sentiment,category,needs_human_review,created_at,processing_time_ms,is_valid",
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []
  const total = rows.length
  const byStatus: Record<string, number> = {}
  const byPriority: Record<string, number> = {}
  const bySentiment: Record<string, number> = {}
  const byCategory: Record<string, number> = {}
  const byDay: Record<string, number> = {}
  let needsReview = 0
  let resolved = 0
  let rejected = 0
  let totalProcessingMs = 0
  let processedCount = 0

  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
    if (r.priority) byPriority[r.priority] = (byPriority[r.priority] ?? 0) + 1
    if (r.sentiment) bySentiment[r.sentiment] = (bySentiment[r.sentiment] ?? 0) + 1
    if (r.category) byCategory[r.category] = (byCategory[r.category] ?? 0) + 1
    if (r.needs_human_review) needsReview++
    if (r.status === "resolved" || r.status === "auto_resolved") resolved++
    if (r.status === "rejected") rejected++
    if (typeof r.processing_time_ms === "number") {
      totalProcessingMs += r.processing_time_ms
      processedCount++
    }
    const day = (r.created_at as string).slice(0, 10)
    byDay[day] = (byDay[day] ?? 0) + 1
  }

  // Last 7 days, fill gaps
  const days: { date: string; count: number }[] = []
  const today = new Date()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    days.push({ date: key, count: byDay[key] ?? 0 })
  }

  return NextResponse.json({
    total,
    needsReview,
    resolved,
    rejected,
    autoResolveRate: total
      ? Math.round(((byStatus.auto_resolved ?? 0) / total) * 100)
      : 0,
    avgProcessingMs: processedCount ? Math.round(totalProcessingMs / processedCount) : 0,
    byStatus,
    byPriority,
    bySentiment,
    byCategory,
    days,
  })
}
