# Design Notes

Five key decisions and the reasoning behind each.

---

## 1. Why the triage agent and the legacy 5-stage pipeline coexist

The triage agent is the brief deliverable — a single-call, tool-calling system that takes free text in and returns a structured decision out. The 5-stage pipeline is the production enrichment path: validation, categorization, sentiment scoring, priority assignment, and response drafting. Both write to the same `complaints` table, so the admin dashboard, analytics, and HITL queue work regardless of which system processed a complaint. Keeping both means the triage agent can be demonstrated independently while the pipeline handles the operational depth that a real support team would need downstream.

---

## 2. Why full-text search was chosen instead of pgvector by default

The `search_similar_past_complaints` tool uses Postgres `tsvector` with a GIN index on the `description_tsv` generated column. This requires zero new infrastructure — no embedding model, no vector extension, no backfill job. It works out of the box on every Supabase project. A `pgvector` migration script exists in `scripts/` for teams that want semantic similarity, but it is not the default because it would add setup friction and a dependency on an embedding provider for what is already a multi-model system.

---

## 3. Why escalation is a tool the agent calls, not just a downstream flag

The brief requires a low-confidence escalation path. Making `escalate_to_human` a tool the agent explicitly calls (rather than a post-hoc confidence threshold) keeps the reasoning trace honest: the model's decision to escalate appears as a `tool_call` step in the trace, with visible arguments and a timestamp. This makes it auditable. The agent's system prompt enforces a 0.7 confidence floor — if it cannot commit to a category at ≥ 0.7, it must call the escalation tool, and that call is logged as a first-class trace event.

---

## 4. Why `stopWhen: stepCountIs(6)` was used

The AI SDK's `maxSteps` equivalent — `stopWhen: stepCountIs(6)` — caps the triage agent at 6 reasoning steps. Without a hard cap, the model can loop through tool calls indefinitely, especially on ambiguous inputs where each tool result raises new questions. Six steps is generous enough for the agent to call 2–3 tools and still produce a final decision, but tight enough to force commitment. In practice, most examples resolve in 2–4 steps. The cap is a safety rail, not a performance optimization.

---

## 5. What two more weeks would buy

Three concrete improvements: **(1)** Replace the `tsvector` full-text search with `pgvector` embeddings and a backfill job that embeds all existing complaint descriptions, enabling genuine semantic similarity rather than keyword overlap. **(2)** Expand the evaluation dataset from 12 hand-labeled examples to 100+ sourced from real support ticket dumps, with inter-annotator agreement checks on the ground truth labels. **(3)** Add an MCP (Model Context Protocol) adapter so the triage agent can be called from external orchestrators (Claude Desktop, LangChain agents, custom CLI tools) without going through the HTTP API — this would make Sentinel a pluggable triage service rather than a standalone app.
