import { AdminDashboard } from "@/components/admin-dashboard"

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Operations</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live view of your AI support pipeline. Auto-refreshes every 5s.
          </p>
        </div>
      </div>
      <AdminDashboard />
    </div>
  )
}
