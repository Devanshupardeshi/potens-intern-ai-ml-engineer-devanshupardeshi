"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Send, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"

const SAMPLES = [
  {
    subject: "Charged twice for my subscription",
    description:
      "I was billed twice this month for my Pro subscription — $29 on the 1st and again on the 3rd. I have screenshots of both charges. Please refund the duplicate charge.",
    product: "Pro Subscription",
  },
  {
    subject: "Package never arrived — escalating to my lawyer",
    description:
      "Order #82471 was supposed to arrive 12 days ago. Tracking has been stuck in 'in transit' for over a week. No one is responding to my emails. If this isn't resolved by Friday I'm filing a chargeback and contacting my attorney.",
    product: "Order #82471",
  },
  {
    subject: "Small typo on the dashboard",
    description: "Just letting you know there's a typo on the analytics page — it says 'recieve' instead of 'receive'.",
    product: "Web App",
  },
]

export function ComplaintForm() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    customer_name: "",
    customer_email: "",
    product: "",
    subject: "",
    description: "",
  })

  function applySample(i: number) {
    setForm((f) => ({
      ...f,
      subject: SAMPLES[i].subject,
      description: SAMPLES[i].description,
      product: SAMPLES[i].product,
      customer_name: f.customer_name || "Demo User",
      customer_email: f.customer_email || "demo@example.com",
    }))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch("/api/complaints", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Failed to submit")
        return
      }
      toast.success("Submitted — running pipeline")
      router.push(`/track/${data.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="border-border bg-card/60">
      <CardContent className="p-6">
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Try a sample:</span>
          {SAMPLES.map((s, i) => (
            <Button
              key={s.subject}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => applySample(i)}
              className="gap-1.5 text-xs"
            >
              <Sparkles className="h-3 w-3" />
              {s.subject.length > 28 ? s.subject.slice(0, 28) + "…" : s.subject}
            </Button>
          ))}
        </div>

        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                required
                value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                placeholder="Jane Doe"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={form.customer_email}
                onChange={(e) => setForm({ ...form, customer_email: e.target.value })}
                placeholder="jane@example.com"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="product">Product (optional)</Label>
            <Input
              id="product"
              value={form.product}
              onChange={(e) => setForm({ ...form, product: e.target.value })}
              placeholder="Pro Subscription, Order #1234, etc."
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              required
              minLength={3}
              maxLength={200}
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="Brief summary of the issue"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              required
              minLength={10}
              maxLength={5000}
              rows={6}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Tell us what happened, when, and what outcome you're hoping for."
            />
            <p className="text-xs text-muted-foreground">
              {form.description.length}/5000 characters
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button type="submit" disabled={submitting} className="gap-2 min-w-32">
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Sending
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" /> Submit
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
