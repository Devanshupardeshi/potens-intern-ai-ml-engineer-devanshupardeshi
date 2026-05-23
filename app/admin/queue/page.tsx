import { ReviewQueue } from "@/components/review-queue"

export default function QueuePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-12">
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Human-in-the-loop</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Review queue</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cases the AI flagged for human review — high-priority, ambiguous, or critical complaints.
        </p>
      </div>
      <ReviewQueue />
    </div>
  )
}
