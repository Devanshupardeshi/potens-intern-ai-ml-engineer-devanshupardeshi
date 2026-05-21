"use client"

import { useState } from "react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@radix-ui/react-collapsible"
import {
  ChevronRight,
  Brain,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  TRIAGE_PRIORITY_COLORS,
  type TriageTraceStep,
  type TriageCategory,
  type TriagePriority,
} from "@/lib/types"

// =============================================================================
// Category display color mapping — mirrors the existing PRIORITY_COLORS pattern
// =============================================================================

const CATEGORY_COLORS: Record<TriageCategory, string> = {
  billing: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  product_defect: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  shipping: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  account_access: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  safety_or_legal: "bg-red-500/15 text-red-400 border-red-500/30",
}

// =============================================================================
// ReasoningTree — renders a vertical stack of collapsible trace nodes
// =============================================================================

export function ReasoningTree({ trace }: { trace: TriageTraceStep[] }) {
  if (trace.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No reasoning trace available.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {trace.map((step, i) => (
        <TraceNode key={i} step={step} index={i} isLast={i === trace.length - 1} />
      ))}
    </div>
  )
}

// =============================================================================
// TraceNode — dispatches to the correct visual representation per step kind
// =============================================================================

function TraceNode({
  step,
  index,
  isLast,
}: {
  step: TriageTraceStep
  index: number
  isLast: boolean
}) {
  switch (step.kind) {
    case "thought":
      return <ThoughtNode step={step} index={index} />
    case "tool_call":
      return <ToolCallNode step={step} index={index} />
    case "tool_result":
      return <ToolResultNode step={step} index={index} />
    case "final":
      return <FinalNode step={step} index={index} defaultOpen={isLast} />
    default:
      return null
  }
}

// =============================================================================
// ThoughtNode
// =============================================================================

function ThoughtNode({
  step,
  index,
}: {
  step: Extract<TriageTraceStep, { kind: "thought" }>
  index: number
}) {
  return (
    <div className="flex gap-3 pl-2">
      <div className="flex flex-col items-center">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-500/15 text-zinc-400">
          <Brain className="h-3.5 w-3.5" />
        </div>
        <div className="mt-1 w-px flex-1 bg-border/40" />
      </div>
      <div className="pb-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Step {index + 1} · Reasoning
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {step.text}
        </p>
      </div>
    </div>
  )
}

// =============================================================================
// ToolCallNode — expandable JSON args
// =============================================================================

function ToolCallNode({
  step,
  index,
}: {
  step: Extract<TriageTraceStep, { kind: "tool_call" }>
  index: number
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex gap-3 pl-2">
      <div className="flex flex-col items-center">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-400">
          <Wrench className="h-3.5 w-3.5" />
        </div>
        <div className="mt-1 w-px flex-1 bg-border/40" />
      </div>
      <div className="min-w-0 flex-1 pb-4">
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 text-left">
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground transition-transform",
                open && "rotate-90",
              )}
            />
            <span className="text-xs font-medium uppercase tracking-wider text-blue-400">
              Step {index + 1} · Tool Call
            </span>
            <Badge variant="secondary" className="text-[10px]">
              {step.tool}
            </Badge>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="mt-2 overflow-x-auto rounded bg-muted p-3 text-xs">
              {JSON.stringify(step.args, null, 2)}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  )
}

// =============================================================================
// ToolResultNode — expandable JSON result, green/red based on ok
// =============================================================================

function ToolResultNode({
  step,
  index,
}: {
  step: Extract<TriageTraceStep, { kind: "tool_result" }>
  index: number
}) {
  const [open, setOpen] = useState(false)
  const ok = step.ok

  return (
    <div className="flex gap-3 pl-2">
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
            ok
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-red-500/15 text-red-400",
          )}
        >
          {ok ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5" />
          )}
        </div>
        <div className="mt-1 w-px flex-1 bg-border/40" />
      </div>
      <div className="min-w-0 flex-1 pb-4">
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 text-left">
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground transition-transform",
                open && "rotate-90",
              )}
            />
            <span
              className={cn(
                "text-xs font-medium uppercase tracking-wider",
                ok ? "text-emerald-400" : "text-red-400",
              )}
            >
              Step {index + 1} · {ok ? "Tool Result" : "Tool Failed"}
            </span>
            <Badge variant="secondary" className="text-[10px]">
              {step.tool}
            </Badge>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="mt-2 overflow-x-auto rounded bg-muted p-3 text-xs">
              {JSON.stringify(step.result, null, 2)}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  )
}

// =============================================================================
// FinalNode — expanded by default, shows the full decision
// =============================================================================

function FinalNode({
  step,
  index,
  defaultOpen,
}: {
  step: Extract<TriageTraceStep, { kind: "final" }>
  index: number
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const d = step.decision

  return (
    <div className="flex gap-3 pl-2">
      <div className="flex flex-col items-center">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="min-w-0 flex-1 pb-2">
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 text-left">
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground transition-transform",
                open && "rotate-90",
              )}
            />
            <span className="text-xs font-medium uppercase tracking-wider text-amber-400">
              Step {index + 1} · Final Decision
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-3 space-y-3 rounded-md border border-border bg-card/60 p-4">
              {/* Badges row */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn("border", CATEGORY_COLORS[d.category])}
                >
                  {d.category.replace("_", " ")}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn("border", TRIAGE_PRIORITY_COLORS[d.priority as TriagePriority])}
                >
                  {d.priority}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  next → {d.next_tool}
                </Badge>
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {Math.round(d.confidence * 100)}% confidence
                </span>
              </div>

              {/* Why */}
              <p className="text-sm font-medium">{d.why}</p>

              {/* Reasoning */}
              <p className="text-sm leading-relaxed text-muted-foreground">
                {d.reasoning}
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  )
}
