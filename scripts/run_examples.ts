/**
 * scripts/run_examples.ts
 *
 * Runs every example in examples/*\/input.json through the triage agent and
 * regenerates output.json and trace.json for each one.
 *
 * Usage:
 *   npx tsx scripts/run_examples.ts
 *
 * Requires GEMINI_API_KEYS or GROQ_API_KEYS in the environment.
 */

import { readFile, writeFile, readdir } from "node:fs/promises"
import { join, resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { runTriageAgent } from "../lib/agents/triage-agent"
import type { TriageTraceStep } from "../lib/types"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const EXAMPLES_DIR = resolve(__dirname, "../examples")

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pad(s: string, n: number) {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length)
}

function extractToolsUsed(trace: TriageTraceStep[]): string {
  const tools = trace
    .filter((s): s is Extract<TriageTraceStep, { kind: "tool_call" }> => s.kind === "tool_call")
    .map((s) => s.tool)
  // deduplicate while preserving order
  return [...new Set(tools)].join(", ") || "(none)"
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Collect all example directories (skip files and _-prefixed dirs)
  const entries = await readdir(EXAMPLES_DIR, { withFileTypes: true })
  const dirs = entries
    .filter((d: { isDirectory(): boolean; name: string }) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d: { name: string }) => d.name)
    .sort()

  if (dirs.length === 0) {
    console.error("No example directories found in", EXAMPLES_DIR)
    process.exit(1)
  }

  console.log(`\n🧪 Running ${dirs.length} triage examples...\n`)

  const header = [
    pad("Example", 32),
    pad("Category", 16),
    pad("Pri", 5),
    pad("Next Tool", 32),
    "Tools Called",
  ].join(" | ")

  console.log(header)
  console.log("-".repeat(header.length + 12))

  let passed = 0
  let failed = 0

  for (const dir of dirs) {
    const exampleDir = join(EXAMPLES_DIR, dir)
    const inputPath = join(exampleDir, "input.json")

    let rawInput: { text: string; metadata?: Record<string, string> }

    try {
      rawInput = JSON.parse(await readFile(inputPath, "utf-8"))
    } catch (err) {
      console.error(`[ERROR] ${dir}: could not read input.json —`, err)
      failed++
      continue
    }

    try {
      const result = await runTriageAgent({
        text: rawInput.text,
        metadata: rawInput.metadata as {
          customer_email?: string
          product?: string
          channel?: string
        },
        complaintId: null,
      })

      const { trace, ...rest } = result

      // Write output.json (decision + model/timing metadata, no trace)
      await writeFile(
        join(exampleDir, "output.json"),
        JSON.stringify({ complaint_id: "dry-run", ...rest }, null, 2),
        "utf-8",
      )

      // Write trace.json (full TriageTraceStep[])
      await writeFile(
        join(exampleDir, "trace.json"),
        JSON.stringify(trace, null, 2),
        "utf-8",
      )

      const toolsUsed = extractToolsUsed(trace)

      console.log(
        [
          pad(dir, 32),
          pad(result.decision.category, 16),
          pad(result.decision.priority, 5),
          pad(result.decision.next_tool, 32),
          toolsUsed,
        ].join(" | "),
      )

      passed++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[ERROR] ${dir}: ${message}`)
      failed++
    }
  }

  console.log(`\n${"─".repeat(60)}`)
  console.log(`✅ Passed: ${passed}   ❌ Failed: ${failed}`)
  console.log(`\noutput.json and trace.json updated for all passing examples.\n`)
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
