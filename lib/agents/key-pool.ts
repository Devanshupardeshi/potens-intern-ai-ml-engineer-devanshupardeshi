/**
 * Multi-key rotation pool for Groq + Google Gemini.
 *
 * Why this exists:
 *  - Free-tier keys hit RPM/RPD limits very quickly.
 *  - We rotate through a list of keys round-robin, mark a key as "cooling
 *    down" when it returns 429/quota errors, and seamlessly fall over to
 *    the next available key (or to the fallback provider).
 *
 * Configure via env (any of these formats works):
 *   GROQ_API_KEYS      = "key1,key2,key3"           # comma separated
 *   GROQ_API_KEY       = "key1"                      # single (back-compat)
 *   GEMINI_API_KEYS    = "key1,key2"                 # comma separated
 *   GOOGLE_GENERATIVE_AI_API_KEY / AI_GATEWAY_API_KEY = "key1"  # single fallback
 *
 * Cooldown is 60s by default for rate-limit errors. After cooldown the key
 * rejoins the pool automatically.
 */

const DEFAULT_COOLDOWN_MS = 60_000
const DAILY_COOLDOWN_MS = 60 * 60 * 1000 // 1h for daily-quota errors

export type ProviderKind = "groq" | "google"

interface KeyEntry {
  key: string
  cooldownUntil: number // epoch ms; 0 if available
  uses: number
  failures: number
}

class KeyPool {
  private entries: KeyEntry[]
  private cursor = 0

  constructor(keys: string[]) {
    const unique = Array.from(new Set(keys.map((k) => k.trim()).filter(Boolean)))
    this.entries = unique.map((key) => ({ key, cooldownUntil: 0, uses: 0, failures: 0 }))
  }

  get size() {
    return this.entries.length
  }

  /** Pick the next available key (round-robin). Returns null if none available. */
  next(): KeyEntry | null {
    if (this.entries.length === 0) return null
    const now = Date.now()
    for (let i = 0; i < this.entries.length; i++) {
      const idx = (this.cursor + i) % this.entries.length
      const entry = this.entries[idx]
      if (entry.cooldownUntil <= now) {
        this.cursor = (idx + 1) % this.entries.length
        entry.uses += 1
        return entry
      }
    }
    return null
  }

  /**
   * Soonest time at which ANY key in the pool will become available again.
   * Returns 0 if at least one key is already available, or +Infinity if
   * every key is permanently disabled.
   */
  soonestAvailableAt(): number {
    if (this.entries.length === 0) return Number.POSITIVE_INFINITY
    const now = Date.now()
    let soonest = Number.POSITIVE_INFINITY
    for (const e of this.entries) {
      if (e.cooldownUntil <= now) return 0
      if (e.cooldownUntil < soonest) soonest = e.cooldownUntil
    }
    return soonest
  }

  markRateLimited(key: string, isDailyQuota: boolean) {
    const entry = this.entries.find((e) => e.key === key)
    if (!entry) return
    entry.failures += 1
    entry.cooldownUntil = Date.now() + (isDailyQuota ? DAILY_COOLDOWN_MS : DEFAULT_COOLDOWN_MS)
  }

  /** Permanently disable a key (expired/invalid/revoked). */
  markDisabled(key: string) {
    const entry = this.entries.find((e) => e.key === key)
    if (!entry) return
    entry.failures += 1
    // Far-future cooldown effectively disables the key for this process lifetime.
    entry.cooldownUntil = Number.MAX_SAFE_INTEGER
  }

  stats() {
    const now = Date.now()
    return {
      total: this.entries.length,
      available: this.entries.filter((e) => e.cooldownUntil <= now).length,
      uses: this.entries.reduce((a, e) => a + e.uses, 0),
      failures: this.entries.reduce((a, e) => a + e.failures, 0),
    }
  }
}

function parseKeys(...sources: (string | undefined)[]): string[] {
  return sources
    .filter((s): s is string => !!s && s.trim().length > 0)
    .flatMap((s) => s.split(",").map((p) => p.trim()).filter(Boolean))
}

export const groqPool = new KeyPool(parseKeys(process.env.GROQ_API_KEYS, process.env.GROQ_API_KEY))

export const googlePool = new KeyPool(
  parseKeys(
    process.env.GEMINI_API_KEYS,
    process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    process.env.AI_GATEWAY_API_KEY,
  ),
)

export function getPool(kind: ProviderKind): KeyPool {
  return kind === "groq" ? groqPool : googlePool
}

export function isRateLimitError(err: unknown): { rateLimited: boolean; daily: boolean } {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  const rateLimited =
    lower.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("quota") ||
    lower.includes("resource_exhausted") ||
    lower.includes("rate_limit") ||
    lower.includes("too many requests")
  const daily =
    lower.includes("daily") ||
    lower.includes("free_tier") ||
    lower.includes("per day") ||
    lower.includes("perday")
  return { rateLimited, daily }
}

/** Detect keys that should be permanently disabled (not retried). */
export function isInvalidKeyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  return (
    lower.includes("api key expired") ||
    lower.includes("api_key_invalid") ||
    lower.includes("invalid api key") ||
    lower.includes("invalid_api_key") ||
    lower.includes("api key not valid") ||
    lower.includes("unauthorized") ||
    lower.includes("401") ||
    lower.includes("403")
  )
}

/**
 * Classify whether an error is transient (worth retrying with the same key
 * after a backoff). 5xx, timeouts, network issues are transient.
 */
export function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  return (
    lower.includes("503") ||
    lower.includes("502") ||
    lower.includes("500") ||
    lower.includes("504") ||
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("econnreset") ||
    lower.includes("network") ||
    lower.includes("fetch failed") ||
    lower.includes("overloaded") ||
    lower.includes("unavailable")
  )
}

/**
 * Detect malformed-output errors from the model itself (bad JSON, schema
 * violation). These are model-quality issues, not key issues - retrying with
 * a different key on the same provider often works (and even better, with
 * a different provider).
 */
export function isSchemaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  return (
    lower.includes("does not match the expected schema") ||
    lower.includes("no_object_generated") ||
    lower.includes("ai_noobjectgeneratederror") ||
    lower.includes("invalid json") ||
    lower.includes("failed to parse") ||
    lower.includes("could not parse")
  )
}

export function poolStats() {
  return {
    groq: groqPool.stats(),
    google: googlePool.stats(),
  }
}
