"use client"

import useSWR from "swr"
import { useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  XCircle,
  AlertTriangle,
  MessageSquareText,
  Save,
  ThumbsUp,
  RefreshCw,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import {
  PIPELINE_STEPS,
  PRIORITY_COLORS,
  SENTIMENT_COLORS,
  STATUS_COLORS,
  type AgentRun,
  type Complaint,
} from "@/lib/types"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function ComplaintDetail({ complaintId }: { complaintId: string }) {
  const { data, mutate, isLoading } = useSWR<{ complaint: Complaint; runs: AgentRun[] }>(
    `/api/complaints/${complaintId}`,
    fetcher,
    {
      refreshInterval: (latest) => {
        const status = latest?.complaint?.pipeline_status
        return status === "completed" || status === "failed" ? 0 : 1500
      },
    },
  )

  const [editedResponse, setEditedResponse] = useState<string | null>(null)
  const [resolutionNotes, setResolutionNotes] = useState("")
  const [reviewer, setReviewer] = useState("Human Reviewer")
  const [busy, setBusy] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
      </div>
    )
  }
  if (!data?.complaint) {
    return <p className="text-sm text-destructive-foreground">Not found.</p>
  }

  const { complaint, runs } = data
  const responseValue = editedResponse ?? complaint.suggested_response ?? ""

  async function act(action: string, body: Record<string, unknown> = {}) {
    setBusy(action)
    try {
      const res = await fetch(`/api/complaints/${complaintId}/resolve`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, resolved_by: reviewer, ...body }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? "Action failed")
        return
      }
      toast.success(`${action.replace("_", " ")} successful`)
      await mutate()
    } finally {
      setBusy(null)
    }
  }

  async function retryPipeline() {
    setBusy("retry")
    try {
      const res = await fetch(`/api/complaints/${complaintId}/retry`, {
        method: "POST",
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? "Retry failed")
        return
      }
      toast.success("Pipeline restarted")
      await mutate()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="gap-2">
          <Link href="/admin/queue">
            <ArrowLeft className="h-4 w-4" /> Back to queue
          </Link>
        </Button>
        <p className="font-mono text-xs text-muted-foreground">{complaint.id}</p>
      </div>

      <Card className="border-border bg-card/60">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold tracking-tight">{complaint.subject}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                from <span className="text-foreground">{complaint.customer_name}</span>{" "}
                ({complaint.customer_email})
                {complaint.product && (
                  <>
                    {" · "}product: <span className="text-foreground">{complaint.product}</span>
                  </>
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Submitted {new Date(complaint.created_at).toLocaleString()}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn("border", STATUS_COLORS[complaint.status])}>
                {complaint.status.replace("_", " ")}
              </Badge>
              {complaint.priority && (
                <Badge variant="outline" className={cn("border", PRIORITY_COLORS[complaint.priority])}>
                  {complaint.priority} ({complaint.priority_score})
                </Badge>
              )}
              {complaint.sentiment && (
                <Badge variant="outline" className={cn("border", SENTIMENT_COLORS[complaint.sentiment])}>
                  {complaint.sentiment.replace("_", " ")}
                </Badge>
              )}
            </div>
          </div>

          <Separator className="my-5" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{complaint.description}</p>
          </div>

          {complaint.category && (
            <>
              <Separator className="my-5" />
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary">{complaint.category}</Badge>
                {complaint.subcategory && <Badge variant="outline">{complaint.subcategory}</Badge>}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {complaint.escalation_reason && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-400" />
              <div>
                <p className="font-medium text-amber-300">Flagged for human review</p>
                <p className="mt-1 text-sm text-muted-foreground">{complaint.escalation_reason}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {complaint.status === "failed" && (
        <Card className="border-red-500/40 bg-red-500/5">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-3">
                <XCircle className="mt-0.5 h-5 w-5 text-red-400" />
                <div>
                  <p className="font-medium text-red-300">Pipeline failed</p>
                  {complaint.pipeline_error && (
                    <p className="mt-1 text-sm text-muted-foreground">{complaint.pipeline_error}</p>
                  )}
                </div>
              </div>
              <Button
                variant="secondary"
                onClick={retryPipeline}
                disabled={busy !== null}
                className="gap-2"
              >
                {busy === "retry" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Retry pipeline
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Drafted response with edit/approve/reject controls */}
      {complaint.suggested_response && (
        <Card className="border-border bg-card/60">
          <CardContent className="p-6">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquareText className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Drafted response
                </h3>
              </div>
              {complaint.status === "resolved" && (
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Resolved by {complaint.resolved_by}
                </span>
              )}
            </div>

            <Textarea
              value={responseValue}
              onChange={(e) => setEditedResponse(e.target.value)}
              rows={8}
              className="font-mono text-sm"
              disabled={complaint.status === "resolved" || complaint.status === "rejected"}
            />

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="reviewer">Reviewer name</Label>
                <Input id="reviewer" value={reviewer} onChange={(e) => setReviewer(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="notes">Resolution notes (optional)</Label>
                <Input
                  id="notes"
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="e.g. issued partial refund"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {editedResponse !== null && editedResponse !== complaint.suggested_response && (
                <Button
                  variant="secondary"
                  onClick={() => act("edit_response", { edited_response: editedResponse })}
                  disabled={busy !== null}
                  className="gap-2"
                >
                  {busy === "edit_response" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save edits
                </Button>
              )}
              <Button
                onClick={() => act("approve_response", { resolution_notes: resolutionNotes })}
                disabled={busy !== null || complaint.status === "resolved"}
                className="gap-2"
              >
                {busy === "approve_response" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ThumbsUp className="h-4 w-4" />
                )}
                Approve & Send
              </Button>
              <Button
                variant="destructive"
                onClick={() => act("reject", { resolution_notes: resolutionNotes })}
                disabled={busy !== null || complaint.status === "rejected"}
                className="gap-2"
              >
                {busy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Reject
              </Button>
            </div>
            {complaint.resolution_notes && (
              <>
                <Separator className="my-4" />
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Resolution notes</p>
                <p className="mt-1 text-sm">{complaint.resolution_notes}</p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Agent run audit trail */}
      <Card className="border-border bg-card/60">
        <CardContent className="p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Agent audit trail
          </h3>
          <div className="space-y-3">
            {PIPELINE_STEPS.map((step, i) => {
              const run = runs.find((r) => r.agent_step === i + 1)
              return (
                <div
                  key={step.key}
                  className={cn(
                    "rounded-md border p-4",
                    run ? "border-border bg-secondary/30" : "border-dashed border-border bg-secondary/10",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">0{i + 1}</span>
                      <p className="text-sm font-medium">{step.label}</p>
                      <span className="text-xs text-muted-foreground">{step.agent}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {run?.model && <span className="font-mono">{run.model}</span>}
                      {run?.duration_ms != null && <span>{run.duration_ms}ms</span>}
                      {run?.status === "completed" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                      {run?.status === "failed" && <XCircle className="h-3.5 w-3.5 text-red-400" />}
                    </div>
                  </div>
                  {run?.output && (
                    <pre className="mt-3 overflow-x-auto rounded bg-background/60 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                      {JSON.stringify(run.output, null, 2)}
                    </pre>
                  )}
                  {run?.error && <p className="mt-2 text-xs text-red-400">{run.error}</p>}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
