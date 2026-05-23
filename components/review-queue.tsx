"use client"

import useSWR from "swr"
import { Card, CardContent } from "@/components/ui/card"
import { ComplaintList } from "@/components/complaint-list"
import type { Complaint } from "@/lib/types"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function ReviewQueue() {
  const { data } = useSWR<{ complaints: Complaint[] }>(
    "/api/complaints?needs_review=true&limit=100",
    fetcher,
    { refreshInterval: 5000 },
  )
  const items = (data?.complaints ?? []).filter((c) => c.status !== "resolved" && c.status !== "rejected")

  return (
    <Card className="border-border bg-card/60">
      <CardContent className="p-6">
        <ComplaintList complaints={items} emptyLabel="The queue is clear. AI is handling everything." />
      </CardContent>
    </Card>
  )
}
