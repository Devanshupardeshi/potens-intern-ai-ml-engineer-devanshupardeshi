"use client"

import { useState } from "react"
import { Loader2, Send, Sparkles, Timer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { ReasoningTree } from "@/components/reasoning-tree"
import {
  TRIAGE_PRIORITY_COLORS,
  type TriageDecision,
  type TriageTraceStep,
  type TriagePriority,
} from "@/lib/types"

// =============================================================================
// Category display color mapping (same as reasoning-tree.tsx)
// =============================================================================

const CATEGORY_COLORS: Record<string, string> = {
  billing: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  product_defect: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  shipping: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  account_access: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  safety_or_legal: "bg-red-500/15 text-red-400 border-red-500/30",
}

// =============================================================================
// Sample presets — inspired by the examples/ folder
// =============================================================================

const SAMPLES = [
  {
    label: "Double charge",
    text: "I was charged twice for my Pro subscription this month — once on the 1st and again on the 3rd. Both charges are $29. I have screenshots of my bank statement. Please refund the duplicate charge immediately.",
    email: "sarah.m@example.com",
    product: "Pro Subscription",
  },
  {
    label: "Legal threat",
    text: "My order #82471 never arrived and no one has responded to my three emails. If I don't receive a full refund by Friday I will be filing a chargeback, reporting you to the Better Business Bureau, and contacting my attorney.",
    email: "angry.customer@example.com",
    product: "Order #82471",
  },
  {
    label: "Account locked",
    text: "I've been locked out of my account since last night. I'm a paying customer and I have a critical presentation in 2 hours that depends on data inside my dashboard. My password reset emails aren't arriving. This is absolutely urgent.",
    email: "carlos.r@example.com",
    product: "Enterprise Dashboard",
  },
  {
    label: "Shipping sarcasm",
    text: "Oh fantastic, day 13 of my package being 'in transit'. At this point I'm starting to think my order is on a world tour. Would be great if someone could actually tell me where it is instead of copy-pasting the same 'we're looking into it' response.",
    email: "chloe@example.com",
    product: "Standard Shipping",
  },
  {
    label: "Product fire hazard",
    text: "Your ProHeat 3000 space heater caught fire last night during normal operation. I have photos and video of the fire and the damage to my living room wall. I've already spoken with a product liability attorney. This device needs an immediate recall before someone is seriously hurt.",
    email: "david.chen@example.com",
    product: "ProHeat 3000",
  },
]

// =============================================================================
// API response shape
// =============================================================================

interface TriageResponse {
  complaint_id: string
  decision: TriageDecision
  trace: TriageTraceStep[]
  model: string
  steps_used: number
  duration_ms: number
}

// =============================================================================
// TriageConsole — the interactive triage agent frontend
// =============================================================================

export function TriageConsole() {
  const [text, setText] = useState("")
  const [email, setEmail] = useState("")
  const [product, setProduct] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<TriageResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  function applySample(i: number) {
    setText(SAMPLES[i].text)
    setEmail(SAMPLES[i].email)
    setProduct(SAMPLES[i].product)
    setResult(null)
    setError(null)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting || text.length < 10) return

    setSubmitting(true)
    setResult(null)
    setError(null)

    try {
      const res = await fetch("/api/triage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text,
          metadata: {
            ...(email && { customer_email: email }),
            ...(product && { product }),
          },
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`)
        return
      }

      setResult(data as TriageResponse)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Input form                                                         */}
      {/* ------------------------------------------------------------------ */}
      <Card className="border-border bg-card/60">
        <CardContent className="p-6">
          {/* Sample buttons */}
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Try a sample:</span>
            {SAMPLES.map((s, i) => (
              <Button
                key={s.label}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => applySample(i)}
                className="gap-1.5 text-xs"
              >
                <Sparkles className="h-3 w-3" />
                {s.label}
              </Button>
            ))}
          </div>

          <form className="grid gap-4" onSubmit={onSubmit}>
            {/* Complaint text */}
            <div className="grid gap-1.5">
              <Label htmlFor="triage-text">Complaint</Label>
              <Textarea
                id="triage-text"
                required
                minLength={10}
                maxLength={5000}
                rows={6}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste or type a free-text customer complaint here…"
              />
              <p className="text-xs text-muted-foreground">
                {text.length}/5000 characters
              </p>
            </div>

            {/* Optional metadata */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="triage-email">Customer email (optional)</Label>
                <Input
                  id="triage-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="customer@example.com"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="triage-product">Product (optional)</Label>
                <Input
                  id="triage-product"
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                  placeholder="Pro Subscription, Order #1234, etc."
                />
              </div>
            </div>

            {/* Submit */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="submit"
                disabled={submitting || text.length < 10}
                className="gap-2 min-w-36"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Running…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" /> Run Triage
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Error                                                              */}
      {/* ------------------------------------------------------------------ */}
      {error && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-6">
            <p className="text-sm text-red-400">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Result card                                                        */}
      {/* ------------------------------------------------------------------ */}
      {result && (
        <>
          <ResultCard result={result} />
          <Card className="border-border bg-card/60">
            <CardContent className="p-6">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Reasoning Trace
              </h3>
              <ReasoningTree trace={result.trace} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

// =============================================================================
// ResultCard — summary of the triage decision
// =============================================================================

function ResultCard({ result }: { result: TriageResponse }) {
  const d = result.decision
  const confidencePercent = Math.round(d.confidence * 100)

  return (
    <Card className="border-border bg-card/60">
      <CardContent className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Triage Decision
          </h3>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Timer className="h-3 w-3" />
              {result.duration_ms}ms
            </span>
            <span>{result.steps_used} steps</span>
            <span className="font-mono">{result.model}</span>
          </div>
        </div>

        {/* Badge row */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "border",
              CATEGORY_COLORS[d.category] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
            )}
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
        </div>

        <Separator className="my-4" />

        {/* Why */}
        <p className="text-sm font-medium">{d.why}</p>

        {/* Reasoning */}
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {d.reasoning}
        </p>

        <Separator className="my-4" />

        {/* Confidence bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Confidence</span>
            <span className="font-mono font-medium">{confidencePercent}%</span>
          </div>
          <Progress value={confidencePercent} />
        </div>
      </CardContent>
    </Card>
  )
}
