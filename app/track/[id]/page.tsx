import { TrackView } from "@/components/track-view"

export default async function TrackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-6 md:py-12">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Live Pipeline</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Tracking complaint</h1>
      <p className="mt-1 font-mono text-xs text-muted-foreground">{id}</p>
      <div className="mt-8">
        <TrackView complaintId={id} />
      </div>
    </div>
  )
}
