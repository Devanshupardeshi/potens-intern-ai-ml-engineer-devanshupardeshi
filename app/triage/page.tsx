import { TriageConsole } from "@/components/triage-console"

export const metadata = {
  title: "Triage — Sentinel AI",
  description: "Real-tool-calling triage agent",
}

export default function TriagePage() {
  return (
    <main className="container mx-auto px-4 py-10 max-w-4xl">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          Triage Agent
        </h1>

        <p className="text-muted-foreground mt-2 text-pretty leading-relaxed">
          Free-text complaint in. Structured decision out.
          Watch the agent decide which tools to call.
        </p>
      </header>

      <TriageConsole />
    </main>
  )
}
