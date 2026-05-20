import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createGroq } from "@ai-sdk/groq"
import { generateText } from "ai"
import {
  groqPool,
  googlePool,
  isRateLimitError,
  isInvalidKeyError,
  isTransientError,
  isSchemaError,
  type ProviderKind,
} from "@/lib/agents/key-pool"

// Model identifiers used both as the actual model name and as the provider/model
// label in the audit trail.
const GROQ_FAST_MODEL = "openai/gpt-oss-20b"
const GROQ_REASONING_MODEL = "openai/gpt-oss-120b"
const GOOGLE_FAST_MODEL = "gemini-2.0-flash"
const GOOGLE_REASONING_MODEL = "gemini-2.0-flash"

export const FAST_MODEL_ID = groqPool.size > 0 ? `groq/${GROQ_FAST_MODEL}` : `google/${GOOGLE_FAST_MODEL}`
export const REASONING_MODEL_ID =
  groqPool.size > 0 ? `groq/${GROQ_REASONING_MODEL}` : `google/${GOOGLE_REASONING_MODEL}`

export const isUsingGroq = groqPool.size > 0

type GenerateTextOpts = Parameters<typeof generateText>[0]
type GenerateTextResult = Awaited<ReturnType<typeof generateText>>

interface RunOptions extends Omit<GenerateTextOpts, "model"> {
  /** override model selection priority */
  prefer?: ProviderKind
}

/**
 * Build a model instance for a specific provider + key.
 */
function buildModel(kind: ProviderKind, modelName: string, apiKey: string) {
  if (kind === "groq") {
    const groq = createGroq({ apiKey })
    return groq(modelName)
  }
  const google = createGoogleGenerativeAI({ apiKey })
  return google(modelName)
}

interface AttemptPlan {
  kind: ProviderKind
  modelName: string
}

/**
 * Run generateText with key rotation, retry, and provider fallover.
 *
 * Strategy:
 *  1. Try the preferred provider with each available key (round-robin).
 *  2. If a key returns 429/quota, mark it cooling down and try the next key.
 *  3. If all keys of the preferred provider are exhausted, fall over to the
 *     other provider with a comparable model.
 */
async function runWithRotation(
  plans: AttemptPlan[],
  opts: Omit<GenerateTextOpts, "model">,
  attemptCap = 20,
  // If every key in every pool is cooling down, wait up to this many ms for
  // one to free up before failing.
  maxWaitForKeyMs = 30_000,
): Promise<{ result: GenerateTextResult; usedModelId: string; attempts: number }> {
  let lastErr: unknown
  let attempts = 0
  const overallDeadline = Date.now() + maxWaitForKeyMs

  for (const plan of plans) {
    const pool = plan.kind === "groq" ? groqPool : googlePool
    // Up to one full sweep through the pool, plus a couple of extras for
    // transient retries on the same key.
    const tries = Math.min(pool.size + 2, attemptCap - attempts)

    for (let i = 0; i < tries; i++) {
      let entry = pool.next()
      if (!entry) {
        // No key available right now in this pool. Decide whether to wait or
        // move on to the fallback provider.
        const otherPool = plan.kind === "groq" ? googlePool : groqPool
        const otherAvail = otherPool.soonestAvailableAt() === 0
        if (otherAvail) break // fallback provider has capacity, switch now

        // No fallback capacity either. Wait briefly for whichever pool comes
        // back first, capped by overallDeadline.
        const soonest = Math.min(pool.soonestAvailableAt(), otherPool.soonestAvailableAt())
        const waitFor = Math.min(soonest - Date.now(), overallDeadline - Date.now())
        if (!Number.isFinite(soonest) || waitFor <= 0) break
        await sleep(Math.min(waitFor, 5_000))
        entry = pool.next()
        if (!entry) break
      }
      attempts += 1
      const model = buildModel(plan.kind, plan.modelName, entry.key)
      const usedModelId = `${plan.kind}/${plan.modelName}`
      try {
        // maxRetries: 0 disables the AI SDK's internal retry loop so our
        // rotation layer is the single source of truth for retries. Otherwise
        // the SDK retries 2 extra times on the SAME key before bubbling up,
        // which wastes quota and slows everything down on rate limits.
        const result = await generateText({ ...opts, model, maxRetries: 0 })
        return { result, usedModelId, attempts }
      } catch (err) {
        lastErr = err

        // Permanently disable expired / invalid / revoked keys so we never
        // hand them out again this process lifetime.
        if (isInvalidKeyError(err)) {
          pool.markDisabled(entry.key)
          continue
        }

        const { rateLimited, daily } = isRateLimitError(err)
        if (rateLimited) {
          pool.markRateLimited(entry.key, daily)
          continue
        }

        // Transient errors (5xx, timeout, network): brief backoff then retry
        // with the next key from the same pool.
        if (isTransientError(err)) {
          await sleep(300 + Math.random() * 400)
          continue
        }

        // Malformed JSON / schema mismatch: smaller models occasionally emit
        // bad JSON. Falling over to the other provider (different model)
        // almost always succeeds. Don't blame the key.
        if (isSchemaError(err)) {
          break // try fallback provider with a different model
        }

        // Anything else: try fallback provider.
        break
      }
      if (attempts >= attemptCap) break
    }
    if (attempts >= attemptCap) break
  }

  throw lastErr ?? new Error("No API keys available across all providers")
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Run a "fast" agent (validation, categorization, sentiment).
 * Uses Groq's small model as primary, Gemini Flash as fallback.
 */
export async function runFast(opts: RunOptions) {
  const plans: AttemptPlan[] = []
  if (groqPool.size > 0) plans.push({ kind: "groq", modelName: GROQ_FAST_MODEL })
  if (googlePool.size > 0) plans.push({ kind: "google", modelName: GOOGLE_FAST_MODEL })
  if (plans.length === 0) {
    throw new Error(
      "No AI provider keys configured. Set GROQ_API_KEYS or GEMINI_API_KEYS in your environment.",
    )
  }
  const { prefer, ...rest } = opts
  if (prefer === "google") plans.reverse()
  return runWithRotation(plans, rest)
}

/**
 * Run a "reasoning" agent (priority, response generation).
 * Uses Groq's larger model as primary, Gemini Flash as fallback.
 */
export async function runReasoning(opts: RunOptions) {
  const plans: AttemptPlan[] = []
  if (groqPool.size > 0) plans.push({ kind: "groq", modelName: GROQ_REASONING_MODEL })
  if (googlePool.size > 0) plans.push({ kind: "google", modelName: GOOGLE_REASONING_MODEL })
  if (plans.length === 0) {
    throw new Error(
      "No AI provider keys configured. Set GROQ_API_KEYS or GEMINI_API_KEYS in your environment.",
    )
  }
  const { prefer, ...rest } = opts
  if (prefer === "google") plans.reverse()
  return runWithRotation(plans, rest)
}
