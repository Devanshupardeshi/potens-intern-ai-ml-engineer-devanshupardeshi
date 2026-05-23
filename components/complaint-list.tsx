"use client"

import Link from "next/link"
import { ArrowRight, Inbox, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  PRIORITY_COLORS,
  SENTIMENT_COLORS,
  STATUS_COLORS,
  type Complaint,
} from "@/lib/types"
import { cn } from "@/lib/utils"

export function ComplaintList({
  complaints,
  emptyLabel = "No complaints yet.",
}: {
  complaints: Complaint[]
  emptyLabel?: string
}) {
  if (complaints.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-secondary/20 py-10 text-center text-sm text-muted-foreground">
        <Inbox className="h-5 w-5" />
        {emptyLabel}
      </div>
    )
  }

  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {complaints.map((c) => (
        <li key={c.id}>
          <Link
            href={`/admin/complaints/${c.id}`}
            className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-secondary/40"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium">{c.subject}</p>
                {c.pipeline_status !== "completed" && c.pipeline_status !== "failed" && (
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {c.customer_name} · {new Date(c.created_at).toLocaleString()}
              </p>
            </div>
            <div className="hidden flex-wrap items-center gap-1.5 sm:flex">
              {c.priority && (
                <Badge variant="outline" className={cn("border text-[10px]", PRIORITY_COLORS[c.priority])}>
                  {c.priority}
                </Badge>
              )}
              {c.sentiment && (
                <Badge variant="outline" className={cn("border text-[10px]", SENTIMENT_COLORS[c.sentiment])}>
                  {c.sentiment.replace("_", " ")}
                </Badge>
              )}
              <Badge variant="outline" className={cn("border text-[10px]", STATUS_COLORS[c.status])}>
                {c.status.replace("_", " ")}
              </Badge>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  )
}
