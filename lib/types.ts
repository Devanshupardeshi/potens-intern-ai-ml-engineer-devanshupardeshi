export type Sentiment = "very_negative" | "negative" | "neutral" | "positive"
export type Priority = "critical" | "high" | "medium" | "low"
export type ComplaintStatus = "pending" | "processing" | "auto_resolved" | "escalated" | "resolved" | "rejected" | "failed"
export type PipelineStatus =
  | "queued"
  | "validating"
  | "categorizing"
  | "categorizing_and_sentiment"
  | "analyzing_sentiment"
  | "prioritizing"
  | "generating_response"
  | "completed"
  | "failed"

export interface Complaint {
  id: string
  customer_name: string
  customer_email: string
  product: string | null
  subject: string
  description: string
  channel: string
  is_valid: boolean | null
  validation_reason: string | null
  category: string | null
  subcategory: string | null
  sentiment: Sentiment | null
  sentiment_score: number | null
  priority: Priority | null
  priority_score: number | null
  suggested_response: string | null
  status: ComplaintStatus
  needs_human_review: boolean
  escalation_reason: string | null
  resolved_at: string | null
  resolved_by: string | null
  resolution_notes: string | null
  pipeline_status: PipelineStatus
  pipeline_error: string | null
  processing_time_ms: number | null
  created_at: string
  updated_at: string
}

export interface AgentRun {
  id: string
  complaint_id: string
  run_kind?: "pipeline" | "triage"
  agent_name: string
  agent_step: number
  model: string | null
  status: "running" | "completed" | "failed"
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  reasoning: string | null
  duration_ms: number | null
  error: string | null
  created_at: string
}

export const CATEGORIES = [
  "Billing & Payments",
  "Product Quality",
  "Shipping & Delivery",
  "Account & Login",
  "Technical Support",
  "Refunds & Returns",
  "Customer Service",
  "Feature Request",
  "Other",
] as const

export const PRIORITY_COLORS: Record<Priority, string> = {
  critical: "bg-red-500/15 text-red-400 border-red-500/30",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  low: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
}

export const SENTIMENT_COLORS: Record<Sentiment, string> = {
  very_negative: "bg-red-500/15 text-red-400 border-red-500/30",
  negative: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  neutral: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  positive: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
}

export const STATUS_COLORS: Record<ComplaintStatus, string> = {
  pending: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  processing: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  auto_resolved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  escalated: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  resolved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  rejected: "bg-red-500/15 text-red-400 border-red-500/30",
  failed: "bg-red-500/15 text-red-400 border-red-500/30",
}

export const PIPELINE_STEPS = [
  { key: "validating", label: "Validation", agent: "ValidatorAgent" },
  { key: "categorizing", label: "Categorization", agent: "CategorizerAgent" },
  { key: "analyzing_sentiment", label: "Sentiment", agent: "SentimentAgent" },
  { key: "prioritizing", label: "Priority", agent: "PriorityAgent" },
  { key: "generating_response", label: "Response", agent: "ResponseAgent" },
] as const

export const TRIAGE_CATEGORIES = [
  "billing",
  "product_defect",
  "shipping",
  "account_access",
  "safety_or_legal",
] as const

export type TriageCategory =
  (typeof TRIAGE_CATEGORIES)[number]

export type TriagePriority =
  | "P0"
  | "P1"
  | "P2"

export const TRIAGE_TOOL_NAMES = [
  "lookup_customer_history",
  "search_similar_past_complaints",
  "draft_acknowledgment",
  "escalate_to_human",
  "none",
] as const

export type TriageToolName =
  (typeof TRIAGE_TOOL_NAMES)[number]

export interface TriageDecision {
  category: TriageCategory
  priority: TriagePriority
  next_tool: TriageToolName
  reasoning: string
  why: string
  confidence: number
}

export type TriageTraceStep =
  | {
      kind: "thought"
      text: string
      timestamp: string
    }
  | {
      kind: "tool_call"
      tool: TriageToolName
      args: Record<string, unknown>
      timestamp: string
    }
  | {
      kind: "tool_result"
      tool: TriageToolName
      result: unknown
      ok: boolean
      timestamp: string
    }
  | {
      kind: "final"
      decision: TriageDecision
      timestamp: string
    }

export interface TriageRunResult {
  decision: TriageDecision
  trace: TriageTraceStep[]
  steps_used: number
  model: string
  duration_ms: number
}

export const TRIAGE_PRIORITY_COLORS: Record<
  TriagePriority,
  string
> = {
  P0: "bg-red-500/15 text-red-400 border-red-500/30",
  P1: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  P2: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
}
