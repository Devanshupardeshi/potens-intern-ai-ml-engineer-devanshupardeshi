"use client"

import useSWR from "swr"
import Link from "next/link"
import { ArrowRight, Activity, AlertTriangle, CheckCircle2, Inbox, Timer } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Line,
  LineChart,
} from "recharts"
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart"
import { ComplaintList } from "@/components/complaint-list"
import { type Complaint, PRIORITY_COLORS, SENTIMENT_COLORS } from "@/lib/types"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Analytics {
  total: number
  needsReview: number
  resolved: number
  rejected: number
  avgProcessingMs: number
  byStatus: Record<string, number>
  byPriority: Record<string, number>
  bySentiment: Record<string, number>
  byCategory: Record<string, number>
  days: { date: string; count: number }[]
}

const PRIORITY_CHART_COLORS: Record<string, string> = {
  critical: "var(--color-chart-4)",
  high: "var(--color-chart-3)",
  medium: "var(--color-chart-1)",
  low: "var(--color-chart-2)",
}

const SENTIMENT_CHART_COLORS: Record<string, string> = {
  very_negative: "var(--color-chart-4)",
  negative: "var(--color-chart-3)",
  neutral: "var(--color-chart-5)",
  positive: "var(--color-chart-2)",
}

export function AdminDashboard() {
  const { data: analytics } = useSWR<Analytics>("/api/analytics", fetcher, { refreshInterval: 5000 })
  const { data: list } = useSWR<{ complaints: Complaint[] }>("/api/complaints?limit=20", fetcher, {
    refreshInterval: 5000,
  })

  const a = analytics
  const priorityData = a
    ? Object.entries(a.byPriority).map(([name, value]) => ({ name, value, fill: PRIORITY_CHART_COLORS[name] }))
    : []
  const sentimentData = a
    ? Object.entries(a.bySentiment).map(([name, value]) => ({
        name: name.replace("_", " "),
        value,
        fill: SENTIMENT_CHART_COLORS[name] ?? "var(--color-chart-5)",
      }))
    : []
  const categoryData = a
    ? Object.entries(a.byCategory)
        .sort((x, y) => y[1] - x[1])
        .slice(0, 8)
        .map(([name, value]) => ({ name, value }))
    : []
  const trendData = a?.days ?? []

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={Inbox}
          label="Total Complaints"
          value={a?.total ?? "—"}
          accent="text-primary"
        />
        <StatCard
          icon={AlertTriangle}
          label="Needs Human Review"
          value={a?.needsReview ?? "—"}
          accent="text-amber-400"
          href="/admin/queue"
        />
        <StatCard
          icon={CheckCircle2}
          label="Resolved"
          value={a?.resolved ?? "—"}
          accent="text-emerald-400"
        />
        <StatCard icon={Activity} label="Rejected" value={a?.rejected ?? "—"} accent="text-red-400" />
        <StatCard
          icon={Timer}
          label="Avg Pipeline Time"
          value={a ? `${(a.avgProcessingMs / 1000).toFixed(1)}s` : "—"}
          accent="text-foreground"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Priority Mix">
          <ChartContainer
            className="aspect-auto h-[220px] w-full"
            config={{ value: { label: "Count" } }}
          >
            <ResponsiveContainer>
              <PieChart>
                <Tooltip content={<ChartTooltipContent />} />
                <Pie data={priorityData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {priorityData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </ChartContainer>
          <Legend
            items={priorityData.map((d) => ({
              name: d.name,
              value: d.value,
              className: PRIORITY_COLORS[d.name as keyof typeof PRIORITY_COLORS],
            }))}
          />
        </ChartCard>

        <ChartCard title="Sentiment Distribution">
          <ChartContainer className="aspect-auto h-[220px] w-full" config={{ value: { label: "Count" } }}>
            <ResponsiveContainer>
              <PieChart>
                <Tooltip content={<ChartTooltipContent />} />
                <Pie data={sentimentData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {sentimentData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </ChartContainer>
          <Legend
            items={sentimentData.map((d) => ({
              name: d.name,
              value: d.value,
              className:
                SENTIMENT_COLORS[
                  d.name.replace(" ", "_") as keyof typeof SENTIMENT_COLORS
                ],
            }))}
          />
        </ChartCard>

        <ChartCard title="Last 7 Days">
          <ChartContainer
            className="aspect-auto h-[220px] w-full"
            config={{ count: { label: "Complaints", color: "var(--color-chart-1)" } }}
          >
            <ResponsiveContainer>
              <LineChart data={trendData}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) => v.slice(5)}
                  fontSize={11}
                  stroke="var(--color-muted-foreground)"
                />
                <YAxis fontSize={11} stroke="var(--color-muted-foreground)" allowDecimals={false} />
                <Tooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </ChartCard>
      </div>

      <ChartCard title="Top Categories">
        <ChartContainer
          className="aspect-auto h-[260px] w-full"
          config={{ value: { label: "Count", color: "var(--color-chart-1)" } }}
        >
          <ResponsiveContainer>
            <BarChart data={categoryData} layout="vertical" margin={{ left: 16, right: 16 }}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={11} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                stroke="var(--color-muted-foreground)"
                fontSize={11}
                width={150}
              />
              <Tooltip content={<ChartTooltipContent />} />
              <Bar dataKey="value" fill="var(--color-chart-1)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </ChartCard>

      <Card className="border-border bg-card/60">
        <CardContent className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Recent complaints
            </h3>
            <Link
              href="/admin/queue"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              View review queue <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <ComplaintList complaints={list?.complaints ?? []} />
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  accent: string
  href?: string
}) {
  const inner = (
    <Card className="border-border bg-card/60 transition-colors hover:bg-card">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <Icon className={cn("h-4 w-4", accent)} />
        </div>
        <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="border-border bg-card/60">
      <CardContent className="p-5">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {children}
      </CardContent>
    </Card>
  )
}

function Legend({ items }: { items: { name: string; value: number; className?: string }[] }) {
  if (items.length === 0) return null
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Badge key={item.name} variant="outline" className={cn("border text-xs", item.className)}>
          {item.name} · {item.value}
        </Badge>
      ))}
    </div>
  )
}
