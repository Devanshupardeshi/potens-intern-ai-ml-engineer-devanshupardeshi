"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import * as XLSX from "xlsx"
import { motion, AnimatePresence } from "framer-motion"
import {
  Upload,
  FileSpreadsheet,
  Download,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sparkles,
  ArrowRight,
  Trash2,
  Zap,
  ListChecks,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedRow {
  customer_name: string
  customer_email: string
  product: string | null
  subject: string
  description: string
  channel: string | null
  /** Original 1-based row number in the spreadsheet */
  rowNumber: number
  /** True if this row failed our shape validation */
  invalid: boolean
  invalidReason?: string
}

interface RowStatus {
  id: string
  status: string | null
  pipeline_status: string | null
  category: string | null
  sentiment: string | null
  priority: string | null
  needs_human_review: boolean | null
  is_valid: boolean | null
  pipeline_error: string | null
  processing_time_ms: number | null
}

type Phase = "idle" | "parsing" | "preview" | "processing" | "done"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const COLUMN_ALIASES: Record<keyof Omit<ParsedRow, "rowNumber" | "invalid" | "invalidReason">, string[]> = {
  customer_name: ["customer_name", "customername", "name", "full_name", "fullname", "customer", "client"],
  customer_email: ["customer_email", "customeremail", "email", "e-mail", "mail"],
  product: ["product", "product_name", "productname", "service", "plan"],
  subject: ["subject", "title", "summary", "complaint_subject", "issue", "topic"],
  description: ["description", "body", "complaint", "message", "details", "content", "text"],
  channel: ["channel", "source", "origin"],
}

function normalize(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

function pickColumn(headers: string[], aliases: string[]): number {
  const normalized = headers.map((h) => normalize(h))
  for (const alias of aliases) {
    const idx = normalized.indexOf(normalize(alias))
    if (idx !== -1) return idx
  }
  return -1
}

function parseWorkbook(file: File): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Failed to read file"))
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: "array" })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const aoa = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: false, defval: "" })
        if (aoa.length < 2) {
          resolve([])
          return
        }
        const headers = aoa[0].map((h) => String(h ?? ""))
        const colName = pickColumn(headers, COLUMN_ALIASES.customer_name)
        const colEmail = pickColumn(headers, COLUMN_ALIASES.customer_email)
        const colProduct = pickColumn(headers, COLUMN_ALIASES.product)
        const colSubject = pickColumn(headers, COLUMN_ALIASES.subject)
        const colDescription = pickColumn(headers, COLUMN_ALIASES.description)
        const colChannel = pickColumn(headers, COLUMN_ALIASES.channel)

        const rows: ParsedRow[] = []
        for (let r = 1; r < aoa.length; r++) {
          const row = aoa[r]
          const get = (idx: number) => (idx === -1 ? "" : String(row[idx] ?? "").trim())
          const rec: ParsedRow = {
            customer_name: get(colName),
            customer_email: get(colEmail),
            product: get(colProduct) || null,
            subject: get(colSubject),
            description: get(colDescription),
            channel: get(colChannel) || null,
            rowNumber: r + 1,
            invalid: false,
          }
          // shape validation
          const reasons: string[] = []
          if (!rec.customer_name) reasons.push("missing name")
          if (!rec.customer_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rec.customer_email))
            reasons.push("invalid email")
          if (!rec.subject || rec.subject.length < 3) reasons.push("missing subject")
          if (!rec.description || rec.description.length < 5) reasons.push("missing description")
          if (reasons.length > 0) {
            rec.invalid = true
            rec.invalidReason = reasons.join(", ")
          }
          // skip totally empty rows silently
          if (!rec.customer_name && !rec.subject && !rec.description) continue
          rows.push(rec)
        }
        resolve(rows)
      } catch (err) {
        reject(err)
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

function downloadSample() {
  const csv = [
    ["customer_name", "customer_email", "product", "subject", "description", "channel"].join(","),
    [
      "Sarah Chen",
      "sarah@example.com",
      "Pro Plan",
      "Charged twice for subscription",
      '"I was billed $29 twice this month. Third time this happened. Extremely frustrated."',
      "web",
    ].join(","),
    [
      "Marcus Johnson",
      "marcus@enterprise.com",
      "Enterprise Plan",
      "Account locked",
      '"Account locked since yesterday, blocking my entire team. Major demo in 2 hours."',
      "email",
    ].join(","),
    [
      "Priya Patel",
      "priya@gmail.com",
      "Mobile App",
      "App crashes on photo upload",
      '"Every time I try to upload a photo from my iPhone the app crashes."',
      "in_app",
    ].join(","),
    [
      "Anna Rodriguez",
      "anna@startup.io",
      "Team Plan",
      "Slack integration request",
      '"Love the product. Would be amazing to have a Slack integration. Not urgent."',
      "email",
    ].join(","),
    [
      "David Kim",
      "david@example.com",
      "Free Plan",
      "Cannot find export button",
      '"I am trying to export my data but I cannot find the export button anywhere."',
      "web",
    ].join(","),
  ].join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "sentinel-sample-complaints.csv"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BulkUpload() {
  const [phase, setPhase] = useState<Phase>("idle")
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [submittedIds, setSubmittedIds] = useState<string[]>([])
  const [statuses, setStatuses] = useState<Record<string, RowStatus>>({})
  const inputRef = useRef<HTMLInputElement>(null)

  const validRows = useMemo(() => rows.filter((r) => !r.invalid), [rows])
  const invalidCount = rows.length - validRows.length

  // -------------------- File handling --------------------
  const handleFile = useCallback(async (f: File) => {
    setFile(f)
    setPhase("parsing")
    setParseError(null)
    setScanProgress(0)
    try {
      // animated scanning visual: tick progress while we parse
      const tickStart = Date.now()
      const interval = window.setInterval(() => {
        const elapsed = Date.now() - tickStart
        setScanProgress(Math.min(95, (elapsed / 800) * 95))
      }, 60)
      const parsed = await parseWorkbook(f)
      window.clearInterval(interval)
      setScanProgress(100)
      setRows(parsed)
      // small delay so the 100% bar is perceptible
      setTimeout(() => setPhase("preview"), 250)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to parse file")
      setPhase("idle")
    }
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault()
      setDragActive(false)
      const f = e.dataTransfer.files?.[0]
      if (f) handleFile(f)
    },
    [handleFile],
  )

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      if (f) handleFile(f)
    },
    [handleFile],
  )

  const reset = useCallback(() => {
    setPhase("idle")
    setFile(null)
    setRows([])
    setSubmittedIds([])
    setStatuses({})
    setScanProgress(0)
    setParseError(null)
    if (inputRef.current) inputRef.current.value = ""
  }, [])

  // -------------------- Submission --------------------
  const submit = useCallback(async () => {
    if (validRows.length === 0) return
    setPhase("processing")
    try {
      const res = await fetch("/api/complaints/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rows: validRows.map((r) => ({
            customer_name: r.customer_name,
            customer_email: r.customer_email,
            product: r.product,
            subject: r.subject,
            description: r.description,
            channel: r.channel ?? "bulk_upload",
          })),
          concurrency: 4,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Bulk submit failed")
      setSubmittedIds(json.ids as string[])
      // seed initial statuses
      setStatuses(
        Object.fromEntries(
          (json.ids as string[]).map((id) => [
            id,
            {
              id,
              status: "pending",
              pipeline_status: "queued",
              category: null,
              sentiment: null,
              priority: null,
              needs_human_review: null,
              is_valid: null,
              pipeline_error: null,
              processing_time_ms: null,
            } satisfies RowStatus,
          ]),
        ),
      )
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Submit failed")
      setPhase("preview")
    }
  }, [validRows])

  // -------------------- Polling --------------------
  useEffect(() => {
    if (phase !== "processing" || submittedIds.length === 0) return
    let cancelled = false
    const poll = async () => {
      try {
        const res = await fetch("/api/complaints/bulk/status", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids: submittedIds }),
        })
        if (!res.ok) return
        const json = await res.json()
        if (cancelled) return
        const map: Record<string, RowStatus> = {}
        for (const s of json.statuses as RowStatus[]) map[s.id] = s
        setStatuses((prev) => ({ ...prev, ...map }))
        const allDone = (json.statuses as RowStatus[]).every(
          (s) => s.pipeline_status === "completed" || s.pipeline_status === "failed",
        )
        if (allDone && (json.statuses as RowStatus[]).length === submittedIds.length) {
          setPhase("done")
        }
      } catch {
        /* swallow - keep polling */
      }
    }
    poll()
    const interval = window.setInterval(poll, 1500)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [phase, submittedIds])

  // -------------------- Derived stats --------------------
  const stats = useMemo(() => {
    const list = Object.values(statuses)
    const total = submittedIds.length || list.length
    const completed = list.filter((s) => s.pipeline_status === "completed").length
    const failed = list.filter((s) => s.pipeline_status === "failed").length
    const autoResolved = list.filter((s) => s.status === "auto_resolved").length
    const escalated = list.filter((s) => s.status === "escalated").length
    const rejected = list.filter((s) => s.status === "rejected").length
    return {
      total,
      done: completed + failed,
      autoResolved,
      escalated,
      rejected,
      failed,
      pct: total > 0 ? Math.round(((completed + failed) / total) * 100) : 0,
    }
  }, [statuses, submittedIds])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <AnimatePresence mode="wait">
        {phase === "idle" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <DropZone
              dragActive={dragActive}
              setDragActive={setDragActive}
              onDrop={onDrop}
              onPick={onPick}
              inputRef={inputRef}
              error={parseError}
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/50 p-4">
              <div className="flex items-start gap-3">
                <ListChecks className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div className="text-sm">
                  <div className="font-medium">Expected columns</div>
                  <div className="text-muted-foreground">
                    customer_name, customer_email, subject, description, product (optional), channel (optional)
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={downloadSample}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Download sample CSV
              </Button>
            </div>
          </motion.div>
        )}

        {phase === "parsing" && file && (
          <motion.div
            key="parsing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-border bg-card p-8"
          >
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <div className="font-medium">{file.name}</div>
              <div className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</div>
            </div>
            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="inline-flex h-3.5 w-3.5"
                >
                  <Loader2 className="h-3.5 w-3.5" />
                </motion.span>
                Scanning rows…
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-primary/70 via-primary to-primary/70"
                  initial={{ width: 0 }}
                  animate={{ width: `${scanProgress}%` }}
                  transition={{ ease: "easeOut", duration: 0.2 }}
                />
              </div>
              {/* fake row scan flash */}
              <div className="grid grid-cols-12 gap-1 pt-1" aria-hidden>
                {Array.from({ length: 60 }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="h-2 rounded-sm bg-secondary"
                    animate={{
                      backgroundColor: [
                        "rgb(var(--secondary-rgb, 30 30 30))",
                        "hsl(var(--primary) / 0.6)",
                        "rgb(var(--secondary-rgb, 30 30 30))",
                      ],
                    }}
                    transition={{ duration: 0.9, delay: i * 0.012, repeat: Infinity, repeatDelay: 0.4 }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {phase === "preview" && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                <div>
                  <div className="font-medium">{file?.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {validRows.length} valid rows
                    {invalidCount > 0 && (
                      <span className="ml-2 text-amber-500">· {invalidCount} skipped</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={reset}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Remove
                </Button>
                <Button onClick={submit} disabled={validRows.length === 0}>
                  <Zap className="mr-1.5 h-3.5 w-3.5" />
                  Process {validRows.length} complaints
                </Button>
              </div>
            </div>

            <PreviewTable rows={rows.slice(0, 20)} />
            {rows.length > 20 && (
              <div className="text-center text-xs text-muted-foreground">
                Showing first 20 of {rows.length} rows
              </div>
            )}
          </motion.div>
        )}

        {phase === "processing" && <ProcessingView stats={stats} statuses={statuses} ids={submittedIds} />}

        {phase === "done" && (
          <DoneView stats={stats} reset={reset} ids={submittedIds} statuses={statuses} />
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Drop zone
// ---------------------------------------------------------------------------

function DropZone({
  dragActive,
  setDragActive,
  onDrop,
  onPick,
  inputRef,
  error,
}: {
  dragActive: boolean
  setDragActive: (v: boolean) => void
  onDrop: (e: React.DragEvent<HTMLLabelElement>) => void
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  error: string | null
}) {
  return (
    <label
      htmlFor="bulk-file"
      onDragOver={(e) => {
        e.preventDefault()
        setDragActive(true)
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={onDrop}
      className={cn(
        "group relative flex min-h-[260px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed bg-card text-center transition-all",
        dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/60",
      )}
    >
      {/* animated grid background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] [background-size:32px_32px]"
      />
      <motion.div
        aria-hidden
        animate={{ opacity: dragActive ? 0.7 : 0.25, scale: dragActive ? 1.05 : 1 }}
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(closest-side,hsl(var(--primary)/0.18),transparent)]"
      />

      <div className="relative flex flex-col items-center gap-3 px-6 py-10">
        <motion.div
          animate={{ y: dragActive ? -3 : 0 }}
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30"
        >
          <Upload className="h-5 w-5" />
        </motion.div>
        <div className="text-base font-medium">
          {dragActive ? "Drop to upload" : "Drag and drop your spreadsheet"}
        </div>
        <div className="text-sm text-muted-foreground">
          or <span className="text-primary underline-offset-4 group-hover:underline">click to browse</span> ·
          .xlsx, .xls, .csv up to 5&nbsp;MB
        </div>
        <input
          ref={inputRef}
          id="bulk-file"
          type="file"
          className="sr-only"
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          onChange={onPick}
        />
      </div>
      {error && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-destructive">{error}</div>
      )}
    </label>
  )
}

// ---------------------------------------------------------------------------
// Preview table
// ---------------------------------------------------------------------------

function PreviewTable({ rows }: { rows: ParsedRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-left">Subject</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <motion.tr
                key={r.rowNumber}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02, duration: 0.18 }}
                className={cn(
                  "border-t border-border/60",
                  r.invalid ? "bg-destructive/5" : "hover:bg-secondary/30",
                )}
              >
                <td className="px-3 py-2 text-muted-foreground">{r.rowNumber}</td>
                <td className="px-3 py-2">{r.customer_name || <em className="text-muted-foreground">—</em>}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.customer_email || "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.product ?? "—"}</td>
                <td className="max-w-[220px] truncate px-3 py-2">{r.subject || "—"}</td>
                <td className="max-w-[320px] truncate px-3 py-2 text-muted-foreground">
                  {r.description || "—"}
                </td>
                <td className="px-3 py-2">
                  {r.invalid ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-md bg-destructive/15 px-1.5 py-0.5 text-xs text-destructive"
                      title={r.invalidReason}
                    >
                      <AlertTriangle className="h-3 w-3" />
                      Skip
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-1.5 py-0.5 text-xs text-primary">
                      Ready
                    </span>
                  )}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Processing view
// ---------------------------------------------------------------------------

function ProcessingView({
  stats,
  statuses,
  ids,
}: {
  stats: DerivedStats
  statuses: Record<string, RowStatus>
  ids: string[]
}) {
  return (
    <motion.div
      key="processing"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-5"
    >
      {/* Top progress bar */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
              <Sparkles className="h-4 w-4" />
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-lg ring-2 ring-primary/40"
                animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 1.6, repeat: Infinity }}
              />
            </div>
            <div>
              <div className="text-sm font-medium">Multi-agent pipeline running</div>
              <div className="text-xs text-muted-foreground">
                Rotating across all available API keys · concurrency 4
              </div>
            </div>
          </div>
          <div className="text-sm tabular-nums text-muted-foreground">
            <span className="font-medium text-foreground">{stats.done}</span> / {stats.total} ·{" "}
            {stats.pct}%
          </div>
        </div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-secondary">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-primary/60 via-primary to-primary/60 [background-size:200%_100%]"
            animate={{ width: `${stats.pct}%`, backgroundPosition: ["0% 0%", "200% 0%"] }}
            transition={{
              width: { ease: "easeOut", duration: 0.4 },
              backgroundPosition: { repeat: Infinity, duration: 3, ease: "linear" },
            }}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatPill label="Auto-resolved" value={stats.autoResolved} tone="success" />
          <StatPill label="Escalated" value={stats.escalated} tone="warning" />
          <StatPill label="Rejected" value={stats.rejected} tone="muted" />
          <StatPill label="Errors" value={stats.failed} tone="danger" />
        </div>
      </div>

      {/* Live grid */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {ids.map((id, idx) => {
          const s = statuses[id]
          return <RowCard key={id} index={idx} status={s} />
        })}
      </div>
    </motion.div>
  )
}

type DerivedStats = {
  total: number
  done: number
  autoResolved: number
  escalated: number
  rejected: number
  failed: number
  pct: number
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: "success" | "warning" | "danger" | "muted"
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-500"
      : tone === "warning"
        ? "text-amber-500"
        : tone === "danger"
          ? "text-destructive"
          : "text-muted-foreground"
  return (
    <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-semibold tabular-nums", toneClass)}>
        <motion.span
          key={value}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-block"
        >
          {value}
        </motion.span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Per-row card with animated stage chip
// ---------------------------------------------------------------------------

const STAGE_LABEL: Record<string, string> = {
  queued: "Queued",
  validating: "Validating",
  categorizing: "Categorizing",
  analyzing_sentiment: "Sentiment",
  categorizing_and_sentiment: "Classify + sentiment",
  prioritizing: "Prioritizing",
  generating_response: "Drafting reply",
  completed: "Done",
  failed: "Error",
}

function RowCard({ index, status }: { index: number; status: RowStatus | undefined }) {
  const stage = status?.pipeline_status ?? "queued"
  const isDone = stage === "completed"
  const isFailed = stage === "failed"

  let label: string
  let tone: "active" | "success" | "warning" | "muted" | "danger"
  if (isFailed) {
    label = "Error"
    tone = "danger"
  } else if (status?.status === "rejected") {
    label = "Rejected"
    tone = "muted"
  } else if (status?.status === "escalated") {
    label = "Escalated"
    tone = "warning"
  } else if (status?.status === "auto_resolved") {
    label = "Auto-resolved"
    tone = "success"
  } else if (isDone) {
    label = "Done"
    tone = "success"
  } else {
    label = STAGE_LABEL[stage] ?? stage
    tone = "active"
  }

  const toneClass =
    tone === "success"
      ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30"
      : tone === "warning"
        ? "bg-amber-500/15 text-amber-400 ring-amber-500/30"
        : tone === "danger"
          ? "bg-destructive/15 text-destructive ring-destructive/30"
          : tone === "muted"
            ? "bg-secondary text-muted-foreground ring-border"
            : "bg-primary/15 text-primary ring-primary/30"

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.01, 0.4), duration: 0.2 }}
      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/60 px-3 py-2 text-sm"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-xs tabular-nums text-muted-foreground">#{index + 1}</span>
        <span className="truncate font-mono text-xs text-muted-foreground">{status?.id?.slice(0, 8) ?? "…"}</span>
        {status?.category && (
          <span className="hidden truncate rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground sm:inline">
            {status.category}
          </span>
        )}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={label}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1",
            toneClass,
          )}
        >
          {tone === "active" && (
            <motion.span
              className="h-1.5 w-1.5 rounded-full bg-current"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
            />
          )}
          {tone === "success" && <CheckCircle2 className="h-3 w-3" />}
          {tone === "warning" && <AlertTriangle className="h-3 w-3" />}
          {tone === "danger" && <XCircle className="h-3 w-3" />}
          {label}
        </motion.span>
      </AnimatePresence>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Done view
// ---------------------------------------------------------------------------

function DoneView({
  stats,
  reset,
  ids,
  statuses,
}: {
  stats: DerivedStats
  reset: () => void
  ids: string[]
  statuses: Record<string, RowStatus>
}) {
  return (
    <motion.div
      key="done"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-5"
    >
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 18 }}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
          >
            <CheckCircle2 className="h-5 w-5" />
          </motion.div>
          <div>
            <div className="text-base font-medium">All {stats.total} complaints triaged</div>
            <div className="text-sm text-muted-foreground">
              {stats.autoResolved} auto-resolved · {stats.escalated} escalated to humans · {stats.rejected}{" "}
              rejected
              {stats.failed > 0 && ` · ${stats.failed} errored`}
            </div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatPill label="Auto-resolved" value={stats.autoResolved} tone="success" />
          <StatPill label="Escalated" value={stats.escalated} tone="warning" />
          <StatPill label="Rejected" value={stats.rejected} tone="muted" />
          <StatPill label="Errors" value={stats.failed} tone="danger" />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/admin">
              View dashboard <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/queue">Review escalations</Link>
          </Button>
          <Button variant="ghost" onClick={reset}>
            Upload another
          </Button>
        </div>
      </div>

      {/* Compact list */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {ids.map((id, idx) => (
          <RowCard key={id} index={idx} status={statuses[id]} />
        ))}
      </div>
    </motion.div>
  )
}
