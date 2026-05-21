import Link from "next/link"
import {
  ArrowRight,
  Bot,
  ShieldCheck,
  Tags,
  Activity,
  Flag,
  MessageSquareText,
  UserCheck,
  Search,
  History,
  FileText,
  AlertCircle,
  Workflow,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

// ---------------------------------------------------------------------------
// Triage tool cards
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    icon: History,
    name: "lookup_customer_history",
    desc: "Query prior complaints by email to detect repeat issues and churn risk.",
  },
  {
    icon: Search,
    name: "search_similar_past_complaints",
    desc: "Full-text search across resolved complaints to find known patterns.",
  },
  {
    icon: FileText,
    name: "draft_acknowledgment",
    desc: "Generate an empathetic, policy-compliant customer response via LLM.",
  },
  {
    icon: AlertCircle,
    name: "escalate_to_human",
    desc: "Route low-confidence or safety cases to a human reviewer immediately.",
  },
]

// ---------------------------------------------------------------------------
// Legacy pipeline steps
// ---------------------------------------------------------------------------

const PIPELINE = [
  { icon: ShieldCheck, label: "Validation", desc: "Filter spam & invalid input" },
  { icon: Tags, label: "Categorization", desc: "Classify into 9 domains" },
  { icon: Activity, label: "Sentiment", desc: "Score emotion -1 to +1" },
  { icon: Flag, label: "Priority", desc: "Critical / High / Med / Low" },
  { icon: MessageSquareText, label: "Response", desc: "Draft empathetic reply" },
  { icon: UserCheck, label: "HITL Escalation", desc: "Route ambiguous cases" },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HomePage() {
  return (
    <div className="relative overflow-hidden">
      {/* ================================================================= */}
      {/* HERO — Triage agent as headline                                   */}
      {/* ================================================================= */}
      <section className="relative">
        <div className="absolute inset-0 bg-grid opacity-30" aria-hidden />
        <div
          className="absolute inset-x-0 top-0 mx-auto h-[480px] max-w-3xl bg-gradient-to-b from-primary/15 to-transparent blur-3xl"
          aria-hidden
        />

        <div className="relative mx-auto max-w-7xl px-4 pt-16 pb-12 md:px-6 md:pt-24 md:pb-20">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs text-muted-foreground">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              Triage agent with real tool calling
            </div>
            <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-6xl">
              Free text in.{" "}
              <span className="text-primary">Structured decision</span> out.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-muted-foreground md:text-lg">
              Sentinel&apos;s triage agent reads a customer complaint, picks from three
              real tools, and returns{" "}
              <code className="rounded bg-secondary/60 px-1.5 py-0.5 font-mono text-sm text-foreground">
                {"{ category, priority, next_tool, reasoning }"}
              </code>{" "}
              — with a full reasoning trace you can inspect step by step.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" className="gap-2">
                <Link href="/triage">
                  Open Triage Console <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="/submit">Submit a Complaint</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Powered by Google Gemini · AI SDK 6 · Supabase · Next.js 16
            </p>
          </div>

          {/* -------------------------------------------------------------- */}
          {/* Triage output preview                                          */}
          {/* -------------------------------------------------------------- */}
          <div className="mx-auto mt-14 max-w-2xl">
            <Card className="border-border bg-card/60 backdrop-blur">
              <CardContent className="p-4 md:p-6">
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Example triage output
                </p>
                <pre className="overflow-x-auto rounded-md bg-background/60 p-4 font-mono text-[13px] leading-relaxed text-muted-foreground">
{`{
  "category": "billing",
  "priority": "P1",
  "next_tool": "draft_acknowledgment",
  "reasoning": "Duplicate charge confirmed…",
  "why": "Double-billed for Pro plan.",
  "confidence": 0.92
}`}
                </pre>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ================================================================= */}
      {/* TOOLS — The four capabilities the agent picks from                */}
      {/* ================================================================= */}
      <section className="mx-auto max-w-7xl px-4 pb-16 md:px-6">
        <div className="mb-3 flex items-center justify-between px-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Three real tools the LLM picks from
          </p>
          <p className="text-xs text-muted-foreground">+ escalation as a tool call</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TOOLS.map((t) => {
            const Icon = t.icon
            return (
              <Card
                key={t.name}
                className="border-border bg-card/60 transition-colors hover:bg-secondary/30"
              >
                <CardContent className="p-5">
                  <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 text-primary ring-1 ring-primary/30">
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="font-mono text-sm font-medium">{t.name}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                    {t.desc}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      {/* ================================================================= */}
      {/* FEATURE GRID                                                      */}
      {/* ================================================================= */}
      <section className="mx-auto max-w-7xl px-4 pb-16 md:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          <FeatureCard
            icon={Bot}
            title="Multi-Agent Orchestration"
            body="Five Gemini agents run in sequence, each with structured outputs validated by Zod. Every step is logged for auditability."
          />
          <FeatureCard
            icon={UserCheck}
            title="Human-in-the-Loop"
            body="Critical, ambiguous, or high-risk cases are auto-routed to a review queue. Humans approve, edit, or override the AI."
          />
          <FeatureCard
            icon={Activity}
            title="Operational Insights"
            body="Real-time dashboards track sentiment trends, category breakdown, priority mix, and pipeline throughput."
          />
        </div>
      </section>

      {/* ================================================================= */}
      {/* PRODUCTION ENRICHMENT PIPELINE — the legacy 5-stage system        */}
      {/* ================================================================= */}
      <section className="mx-auto max-w-7xl px-4 pb-24 md:px-6">
        <div className="mb-3 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Production enrichment pipeline
            </p>
          </div>
          <p className="text-xs text-muted-foreground">5 specialized agents · 1 orchestrator</p>
        </div>
        <Card className="border-border bg-card/60 backdrop-blur">
          <CardContent className="p-4 md:p-6">
            <p className="mb-4 max-w-2xl text-sm text-muted-foreground leading-relaxed">
              After triage, complaints can flow through the full 5-stage pipeline for
              operational processing — validation, categorization, sentiment scoring,
              priority assignment, and automated response drafting.
            </p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              {PIPELINE.map((step, i) => {
                const Icon = step.icon
                return (
                  <div
                    key={step.label}
                    className="group relative flex flex-col items-start gap-2 rounded-md border border-border bg-secondary/30 p-3 transition-colors hover:bg-secondary/60"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary ring-1 ring-primary/30">
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground">0{i + 1}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium">{step.label}</p>
                      <p className="text-xs text-muted-foreground">{step.desc}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  body: string
}) {
  return (
    <Card className="border-border bg-card/60">
      <CardContent className="p-6">
        <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 text-primary ring-1 ring-primary/30">
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{body}</p>
      </CardContent>
    </Card>
  )
}
