"use client"

import useSWR from "swr"
import { CheckCircle2, Loader2, AlertTriangle, XCircle, Clock, ArrowRight, MessageSquareText } from "lucide-react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ReasoningTree } from "@/components/reasoning-tree"
import {
  PIPELINE_STEPS,
  PRIORITY_COLORS,
  SENTIMENT_COLORS,
  STATUS_COLORS,
  type Complaint,
  type AgentRun,
  type TriageTraceStep,
  type TriageToolName,
} from "@/lib/types"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function TrackView({ complaintId }: { complaintId: string }) {
  const { data, error, isLoading } = useSWR<{ complaint: Complaint; runs: AgentRun[] }>(
    `/api/complaints/${complaintId}`,
    fetcher,
    {
      refreshInterval: (latest) => {
        const status = latest?.complaint?.pipeline_status
        return status === "completed" || status === "failed" ? 0 : 1200
      },
    },
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
      </div>
    )
  }
  if (error || !data?.complaint) {
    return (
      <Card className="border-destructive/40 bg-card">
        <CardContent className="p-6 text-sm text-destructive-foreground">
          Could not load complaint. {(error as Error)?.message}
        </CardContent>
      </Card>
    )
  }

  const { complaint, runs } = data
  const completed = complaint.pipeline_status === "completed"
  const failed = complaint.pipeline_status === "failed"

  const stepIndex = (() => {
    const map: Record<string, number> = {
      queued: -1,
      validating: 0,
      categorizing: 1,
      categorizing_and_sentiment: 1,
      analyzing_sentiment: 2,
      prioritizing: 3,
      generating_response: 4,
      completed: 5,
      failed: 5,
    }
    return map[complaint.pipeline_status] ?? -1
  })()

  return (
    <div className="space-y-6">
      {/* Header summary */}
      <Card className="border-border bg-card/60">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Subject</p>
              <h2 className="mt-1 text-lg font-semibold">{complaint.subject}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                from <span className="text-foreground">{complaint.customer_name}</span>{" "}
                ({complaint.customer_email})
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn("border", STATUS_COLORS[complaint.status])}>
                {complaint.status.replace("_", " ")}
              </Badge>
              {complaint.priority && (
                <Badge variant="outline" className={cn("border", PRIORITY_COLORS[complaint.priority])}>
                  {complaint.priority}
                </Badge>
              )}
              {complaint.sentiment && (
                <Badge variant="outline" className={cn("border", SENTIMENT_COLORS[complaint.sentiment])}>
                  {complaint.sentiment.replace("_", " ")}
                </Badge>
              )}
              {complaint.category && <Badge variant="secondary">{complaint.category}</Badge>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pipeline / Reasoning Tree — tabbed when triage runs exist */}
      {(() => {
        const triageRuns = runs
          .filter((r: AgentRun) => r.run_kind === "triage")
          .sort((a: AgentRun, b: AgentRun) => a.agent_step - b.agent_step)
        const hasTriageRuns = triageRuns.length > 0

        const pipelineCard = (
          <Card className="border-border bg-card/60">
            <CardContent className="p-6">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Agent Pipeline
                </h3>
                {completed && (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Completed in {complaint.processing_time_ms ?? 0}ms
                  </span>
                )}
                {failed && (
                  <span className="flex items-center gap-1.5 text-xs text-red-400">
                    <XCircle className="h-3.5 w-3.5" /> Failed: {complaint.pipeline_error}
                  </span>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-5">
                {PIPELINE_STEPS.map((step, i) => {
                  const run = runs.find((r: AgentRun) => r.agent_step === i + 1 && r.run_kind !== "triage")
                  const state =
                    i < stepIndex
                      ? "done"
                      : i === stepIndex
                        ? failed
                          ? "failed"
                          : "active"
                        : "pending"
                  return (
                    <PipelineStep
                      key={step.key}
                      index={i + 1}
                      label={step.label}
                      agent={step.agent}
                      state={state}
                      run={run}
                    />
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )

        if (!hasTriageRuns) return pipelineCard

        // Reconstruct TriageTraceStep[] from agent_runs
        const trace: TriageTraceStep[] = triageRuns.map((r: AgentRun) => {
          if (r.reasoning) {
            return {
              kind: "thought" as const,
              text: r.reasoning,
              timestamp: r.created_at,
            }
          }
          if (r.input && !r.output) {
            return {
              kind: "tool_call" as const,
              tool: r.agent_name as TriageToolName,
              args: r.input,
              timestamp: r.created_at,
            }
          }
          if (r.output && r.agent_name !== "triage_agent") {
            return {
              kind: "tool_result" as const,
              tool: r.agent_name as TriageToolName,
              result: r.output,
              ok: !r.error,
              timestamp: r.created_at,
            }
          }
          // Final decision
          return {
            kind: "final" as const,
            decision: (r.output ?? {}) as TriageTraceStep extends { kind: "final"; decision: infer D } ? D : never,
            timestamp: r.created_at,
          }
        })

        return (
          <Tabs defaultValue="pipeline">
            <TabsList>
              <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
              <TabsTrigger value="reasoning">Reasoning Tree</TabsTrigger>
            </TabsList>
            <TabsContent value="pipeline">
              {pipelineCard}
            </TabsContent>
            <TabsContent value="reasoning">
              <Card className="border-border bg-card/60">
                <CardContent className="p-6">
                  <ReasoningTree trace={trace} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )
      })()}

      {/* Result */}
      {complaint.is_valid === false && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <XCircle className="mt-0.5 h-5 w-5 text-red-400" />
              <div>
                <p className="font-medium text-red-300">Complaint rejected</p>
                <p className="mt-1 text-sm text-muted-foreground">{complaint.validation_reason}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {complaint.suggested_response && (
        <Card className="border-border bg-card/60">
          <CardContent className="p-6">
            <div className="mb-3 flex items-center gap-2">
              <MessageSquareText className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {complaint.needs_human_review ? "Drafted response (pending human review)" : "AI response"}
              </h3>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{complaint.suggested_response}</p>
            {complaint.escalation_reason && (
              <>
                <Separator className="my-4" />
                <div className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-400" />
                  <div>
                    <p className="font-medium text-amber-300">Escalated for human review</p>
                    <p className="text-muted-foreground">{complaint.escalation_reason}</p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {(completed || failed) && (
        <div className="flex justify-center">
          <Button asChild variant="secondary">
            <Link href="/admin">
              View in dashboard <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}

function PipelineStep({
  index,
  label,
  agent,
  state,
  run,
}: {
  index: number
  label: string
  agent: string
  state: "pending" | "active" | "done" | "failed"
  run?: AgentRun
}) {
  return (
    <div
      className={cn(
        "relative rounded-md border p-3 transition-colors",
        state === "done" && "border-emerald-500/30 bg-emerald-500/5",
        state === "active" && "border-primary/40 bg-primary/5 animate-pulse-ring",
        state === "pending" && "border-border bg-secondary/30",
        state === "failed" && "border-red-500/40 bg-red-500/5",
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-[10px] text-muted-foreground">0{index}</span>
        <StateIcon state={state} />
      </div>
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{agent}</p>
      {run?.duration_ms != null && state === "done" && (
        <p className="mt-2 font-mono text-[10px] text-emerald-400">{run.duration_ms}ms</p>
      )}
    </div>
  )
}

function StateIcon({ state }: { state: "pending" | "active" | "done" | "failed" }) {
  if (state === "done") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
  if (state === "active") return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
  if (state === "failed") return <XCircle className="h-3.5 w-3.5 text-red-400" />
  return <Clock className="h-3.5 w-3.5 text-muted-foreground" />
}
