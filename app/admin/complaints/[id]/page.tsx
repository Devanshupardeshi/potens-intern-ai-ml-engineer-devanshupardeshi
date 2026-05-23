import { ComplaintDetail } from "@/components/complaint-detail"

export default async function DetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-6 md:py-12">
      <ComplaintDetail complaintId={id} />
    </div>
  )
}
