import { BulkUpload } from "@/components/bulk-upload"
import { SiteHeader } from "@/components/site-header"

export const metadata = {
  title: "Bulk Upload — Sentinel",
  description: "Upload an Excel or CSV file of customer complaints and let the multi-agent pipeline triage all of them in parallel.",
}

export default function BulkPage() {
  return (
    <div className="min-h-svh bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-14">
        <header className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Batch processing
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            Drop your complaint spreadsheet. We&apos;ll triage all of them.
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-muted-foreground">
            Upload Excel (.xlsx, .xls) or CSV. The pipeline rotates across multiple Groq and Gemini API keys to
            process thousands of complaints in parallel without hitting rate limits.
          </p>
        </header>
        <BulkUpload />
      </main>
    </div>
  )
}
