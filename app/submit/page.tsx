import { ComplaintForm } from "@/components/complaint-form"

export default function SubmitPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-6 md:py-16">
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Customer Portal</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Submit a complaint</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your message will be analyzed by our AI support pipeline in seconds. Critical issues are routed directly to a
          human specialist.
        </p>
      </div>
      <ComplaintForm />
    </div>
  )
}
