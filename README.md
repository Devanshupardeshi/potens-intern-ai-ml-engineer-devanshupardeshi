<div align="center">

# 🛡️ Sentinel AI

### Triage Agent with Real Tool Calling

**Candidate:** Devanshu Pardeshi | **Role:** AI/ML Engineer Intern

[![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![Groq](https://img.shields.io/badge/Groq-F55036?style=for-the-badge&logo=groq&logoColor=white)](https://groq.com/)
[![Gemini](https://img.shields.io/badge/Google_Gemini-8E75B2?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/)
[![AI SDK](https://img.shields.io/badge/AI_SDK_6-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://sdk.vercel.ai/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

</div>

**Sentinel AI is a triage agent that accepts free-text customer complaints and returns structured decisions — category, priority, next recommended action, and a confidence-scored reasoning trace.** The agent calls real tools (customer history lookup, similar complaint search, acknowledgment drafting, human escalation) and exposes every step for inspection. A production 5-stage enrichment pipeline coexists for full operational processing when needed.

---

## Demo

![Triage Console Demo](docs/demo.gif)

> The `/triage` console: paste a multi-issue complaint → watch the agent call `lookup_customer_history` and `search_similar_past_complaints` → inspect the final decision and full reasoning trace.

---

## Run in 3 Commands

```bash
pnpm install
cp .env.example .env.local   # add your Supabase + Groq/Gemini keys
pnpm dev                     # → http://localhost:3000
```

---

## Output Schema

The triage agent returns a single structured decision:

```json
{
  "category": "billing",
  "priority": "P1",
  "next_tool": "draft_acknowledgment",
  "reasoning": "Duplicate charge confirmed via customer history…",
  "why": "Double-billed for Pro plan.",
  "confidence": 0.92
}
```

| Field | Type | Description |
|:------|:-----|:------------|
| `category` | `billing` · `product_defect` · `shipping` · `account_access` · `safety_or_legal` | Primary complaint category |
| `priority` | `P0` · `P1` · `P2` | Urgency level |
| `next_tool` | `lookup_customer_history` · `search_similar_past_complaints` · `draft_acknowledgment` · `escalate_to_human` · `none` | Recommended next action |
| `reasoning` | string | Multi-sentence explanation |
| `why` | string | One-sentence summary |
| `confidence` | 0.0–1.0 | Model confidence score |

---

## Architecture

```
                        ┌────────────────────────────────┐
                        │     Free-text complaint in      │
                        └──────────────┬─────────────────┘
                                       │
                                       ▼
                        ┌────────────────────────────────┐
                        │       TRIAGE AGENT             │
                        │   (Gemini · structured output) │
                        │                                │
                        │   Picks tools, reasons, and    │
                        │   returns a TriageDecision     │
                        └──┬──────┬──────┬──────┬───────┘
                           │      │      │      │
               ┌───────────┘      │      │      └───────────┐
               ▼                  ▼      ▼                  ▼
    ┌─────────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
    │ lookup_customer │ │ search   │ │ draft    │ │ escalate_to  │
    │ _history        │ │ _similar │ │ _ack     │ │ _human       │
    │                 │ │ _past    │ │          │ │              │
    │ Supabase query  │ │ FTS GIN  │ │ LLM call │ │ Confidence   │
    │ by email        │ │ index    │ │ via      │ │ < 0.7 or     │
    │                 │ │          │ │ Gemini   │ │ safety flag  │
    └─────────────────┘ └──────────┘ └──────────┘ └──────────────┘

                                       │
                   ┌───────────────────┴───────────────────┐
                   │  PRODUCTION ENRICHMENT PIPELINE       │
                   │  (optional downstream processing)     │
                   │                                       │
                   │  ① Validator → ②③ Categorizer +      │
                   │  Sentiment (parallel) → ④ Priority    │
                   │  → ⑤ Response Generator → HITL        │
                   └───────────────────────────────────────┘
```

The **triage agent** is the primary entry point — fast, tool-calling, single-decision. The **production enrichment pipeline** runs downstream when complaints need full operational processing (validation, categorization, sentiment scoring, priority assignment, response drafting, and HITL escalation).

Both systems share the `complaints` table, so the admin dashboard and analytics work regardless of which path a complaint took.

---

## Key Links

| Resource | Description |
|:---------|:------------|
| [`examples/`](examples/) | 12 hand-crafted evaluation examples with input, expected output, and traces |
| [`BASELINE_COMPARISON.md`](BASELINE_COMPARISON.md) | Tool-calling agent vs. no-tool baseline — accuracy, confusion matrices, and honest analysis |
| [`DESIGN_NOTES.md`](DESIGN_NOTES.md) | Five key design decisions explained |
| [`examples/_ground_truth.json`](examples/_ground_truth.json) | Ground truth labels for evaluation |

---

## ✨ Highlights

<table>
<tr>
<td width="50%">

### 🤖 Triage Agent + Tool Calling
The agent picks from four real tools — customer history lookup, similar complaint search, acknowledgment drafting, and human escalation — and returns a structured decision with a full reasoning trace.

### 🔄 Smart Key Rotation
Built-in multi-key pool with automatic round-robin rotation, rate-limit detection, cooldown management, and seamless provider fallover between **Groq** and **Google Gemini**.

### 👨‍💼 Human-in-the-Loop (HITL)
Critical, ambiguous, or high-risk cases are automatically escalated to a review queue. Humans can approve, edit, or override AI responses before they go out.

</td>
<td width="50%">

### 📊 Real-Time Analytics Dashboard
Live KPI cards, priority/sentiment/category breakdowns with interactive Recharts, 7-day trend lines, and a complete complaint management interface.

### 🔍 Full Audit Trail
Every agent invocation is persisted in `agent_runs` — model used, input/output, reasoning chain, duration, and errors — ready for compliance reviews.

### ⚡ Parallel Processing
Categorization and Sentiment Analysis run **concurrently** via `Promise.all()`, cutting pipeline latency nearly in half.

</td>
</tr>
</table>

<br />

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|:------|:-----------|:--------|
| **Framework** | Next.js 16 (App Router, RSC) | Full-stack React with server components |
| **Language** | TypeScript (strict mode) | End-to-end type safety |
| **AI Orchestration** | Vercel AI SDK 6 | Structured outputs with `Output.object()` + Zod |
| **Fast Agents** | Groq `openai/gpt-oss-20b` | Validation, categorization, sentiment (~200ms) |
| **Reasoning Agents** | Groq `openai/gpt-oss-120b` | Priority assignment, response generation |
| **Fallback LLM** | Google Gemini 2.0 Flash | Automatic failover when Groq is rate-limited |
| **Database** | Supabase (Postgres 17 + RLS) | Complaints + agent audit trail |
| **UI Components** | shadcn/ui + Radix | Accessible, composable component library |
| **Styling** | Tailwind CSS v4 | Utility-first CSS framework |
| **Charts** | Recharts | Interactive analytics visualizations |
| **Data Fetching** | SWR | Real-time polling with smart revalidation |
| **Animations** | Framer Motion | Smooth UI transitions |

<br />

## 📸 Pages & Routes

### Customer-Facing
| Route | Description |
|:------|:-----------|
| `/` | 🏠 Landing — triage agent overview with tool cards and pipeline preview |
| `/triage` | 🧠 **Triage console** — submit free-text, watch tool calls, inspect reasoning trace |
| `/submit` | 📝 Complaint intake form with real-time validation |
| `/track/[id]` | 🔍 **Live pipeline viewer** — polls every 1.2s, shows each agent activating in real-time |

### Admin Dashboard
| Route | Description |
|:------|:-----------|
| `/admin` | 📊 KPI cards + analytics (status/priority/sentiment/category charts + 7-day trend) |
| `/admin/queue` | 🚨 Escalation queue — only `needs_human_review = true` complaints |
| `/admin/complaints/[id]` | 📋 Detail view — approve/edit/reject + full agent run audit log |
| `/bulk` | 📁 Bulk upload — CSV/XLSX import for batch processing |

### API Endpoints
| Method | Path | Purpose |
|:-------|:-----|:--------|
| `POST` | `/api/triage` | Submit free-text complaint to triage agent |
| `POST` | `/api/complaints` | Create complaint & trigger legacy pipeline |
| `GET` | `/api/complaints` | List complaints (filter by `?status=...`) |
| `GET` | `/api/complaints/[id]` | Get one complaint + agent runs |
| `PATCH` | `/api/complaints/[id]/resolve` | Approve / edit / reject AI response |
| `POST` | `/api/complaints/[id]/retry` | Retry a failed pipeline run |
| `GET` | `/api/analytics` | Aggregated stats for dashboard |

<br />

## ⚡ Quick Start

### Prerequisites

- **Node.js 20+**
- **pnpm** (`npm i -g pnpm`)
- Free accounts on:
  - [Supabase](https://supabase.com) — Postgres database
  - [Groq](https://console.groq.com/keys) — fast LLM inference *(recommended)*
  - [Google AI Studio](https://aistudio.google.com/apikey) — Gemini fallback *(optional)*

### 1. Clone & Install

```bash
git clone https://github.com/Devanshupardeshi/sentinel-ai.git
cd sentinel-ai
pnpm install
```

### 2. Configure Environment

Copy the example file and add your keys:

```bash
cp .env.example .env.local
```

```env
# ─── Supabase ──────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>

# ─── AI Providers (multi-key rotation supported) ──────────
# Comma-separated for key rotation across free tiers
GROQ_API_KEYS=gsk_xxx,gsk_yyy,gsk_zzz
GEMINI_API_KEYS=AIzaSy_xxx,AIzaSy_yyy

# Single-key fallbacks
# GROQ_API_KEY=gsk_xxx
# GOOGLE_GENERATIVE_AI_API_KEY=AIzaSy_xxx
```

### 3. Set Up the Database

Run this SQL in your **Supabase SQL Editor** (Dashboard → SQL Editor → New query):

<details>
<summary>📋 Click to expand database schema</summary>

```sql
-- Complaints: main entity tracked through the pipeline
create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_email text not null,
  product text,
  subject text not null,
  description text not null,
  channel text not null default 'web',
  -- Pipeline outputs
  is_valid boolean,
  validation_reason text,
  category text,
  subcategory text,
  sentiment text,
  sentiment_score numeric,
  priority text,
  priority_score integer,
  suggested_response text,
  -- Status / HITL
  status text not null default 'pending',
  needs_human_review boolean not null default false,
  escalation_reason text,
  resolved_at timestamptz,
  resolved_by text,
  resolution_notes text,
  -- Pipeline metadata
  pipeline_status text not null default 'queued',
  pipeline_error text,
  processing_time_ms integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Audit trail: one row per agent invocation
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  agent_name text not null,
  agent_step integer not null,
  model text,
  status text not null default 'running',
  input jsonb,
  output jsonb,
  reasoning text,
  duration_ms integer,
  error text,
  created_at timestamptz not null default now()
);

-- Indexes for performance
create index if not exists complaints_status_idx on public.complaints(status);
create index if not exists complaints_priority_idx on public.complaints(priority);
create index if not exists complaints_category_idx on public.complaints(category);
create index if not exists complaints_created_at_idx on public.complaints(created_at desc);
create index if not exists complaints_needs_review_idx
  on public.complaints(needs_human_review) where needs_human_review = true;
create index if not exists agent_runs_complaint_idx on public.agent_runs(complaint_id, agent_step);

-- Auto-update timestamp trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists complaints_set_updated_at on public.complaints;
create trigger complaints_set_updated_at
  before update on public.complaints
  for each row execute function public.set_updated_at();

-- RLS policies (open for demo; restrict for production)
alter table public.complaints enable row level security;
alter table public.agent_runs enable row level security;

create policy "complaints_public_select" on public.complaints for select using (true);
create policy "complaints_public_insert" on public.complaints for insert with check (true);
create policy "complaints_public_update" on public.complaints for update using (true);
create policy "agent_runs_public_select" on public.agent_runs for select using (true);
create policy "agent_runs_public_insert" on public.agent_runs for insert with check (true);
```

</details>

### 4. Run

```bash
pnpm dev
```

Open **[http://localhost:3000](http://localhost:3000)** 🎉

<br />

## 📁 Project Structure

```
sentinel-ai/
├── app/
│   ├── api/
│   │   ├── analytics/route.ts          # Aggregated dashboard stats
│   │   ├── triage/route.ts             # POST — triage agent endpoint
│   │   └── complaints/
│   │       ├── route.ts                # POST (create + pipeline) + GET (list)
│   │       └── [id]/
│   │           ├── route.ts            # GET single complaint + agent runs
│   │           ├── resolve/route.ts    # PATCH approve/reject/edit
│   │           └── retry/route.ts      # POST retry failed pipeline
│   ├── admin/
│   │   ├── page.tsx                    # Analytics dashboard
│   │   ├── queue/page.tsx              # HITL escalation queue
│   │   └── complaints/[id]/page.tsx    # Complaint detail + audit log
│   ├── bulk/page.tsx                   # CSV/XLSX bulk upload
│   ├── submit/page.tsx                 # Customer complaint form
│   ├── triage/page.tsx                 # Triage console
│   ├── track/[id]/page.tsx             # Live pipeline tracker
│   ├── layout.tsx                      # Root layout with theme
│   └── globals.css                     # Design tokens + animations
│
├── components/
│   ├── admin-dashboard.tsx             # KPI cards + charts (Recharts)
│   ├── bulk-upload.tsx                 # Batch import component
│   ├── complaint-detail.tsx            # Detail view + resolution controls
│   ├── complaint-form.tsx              # Submission form with validation
│   ├── complaint-list.tsx              # Sortable complaint table
│   ├── reasoning-tree.tsx              # Triage trace visualizer
│   ├── review-queue.tsx                # Escalated cases view
│   ├── site-header.tsx                 # Navigation bar
│   ├── track-view.tsx                  # Live pipeline visualization
│   ├── triage-console.tsx              # Triage submission + results
│   ├── theme-provider.tsx              # Dark/light mode
│   └── ui/                             # shadcn/ui primitives
│
├── lib/
│   ├── agents/
│   │   ├── baseline-classifier.ts      # No-tool baseline for comparison
│   │   ├── key-pool.ts                 # Multi-key rotation + cooldown logic
│   │   ├── models.ts                   # Provider selection + retry + fallover
│   │   ├── pipeline.ts                 # 5-agent orchestration engine
│   │   ├── tools.ts                    # Triage tool implementations
│   │   └── triage-agent.ts             # Tool-calling triage agent
│   ├── supabase/
│   │   ├── client.ts                   # Browser Supabase client
│   │   └── server.ts                   # Server-side Supabase client
│   ├── types.ts                        # Shared TypeScript types + constants
│   └── utils.ts                        # Utility functions
│
├── examples/                           # 12 evaluation examples
│   ├── _ground_truth.json              # Ground truth labels
│   └── 01_billing_double_charge/       # … through 12_safety_serious
│       ├── input.json
│       ├── output.json
│       └── trace.json
│
├── tests/
│   ├── tools.test.ts                   # Tool function tests
│   ├── triage-agent.test.ts            # Agent integration tests
│   └── types.test.ts                   # Schema round-trip tests
│
├── scripts/
│   ├── run_examples.ts                 # Regenerate example outputs
│   └── compare_baseline.ts             # Agent vs. baseline comparison
│
├── BASELINE_COMPARISON.md              # Evaluation report
├── DESIGN_NOTES.md                     # Design decisions
├── .env.example                        # Environment template
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

<br />

## 🔐 Security

- **Zero hardcoded secrets** — all API keys read from `process.env`
- **`.env.local` is git-ignored** — never committed to version control
- **Row Level Security (RLS)** enabled on all Supabase tables
- **Multi-key rotation** prevents single-key exhaustion
- **Invalid key auto-disable** — expired/revoked keys are permanently disabled at runtime

<br />

## 🚀 Deploy to Vercel

1. Push this repo to GitHub
2. Import at [vercel.com/new](https://vercel.com/new)
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `GROQ_API_KEYS` (or `GROQ_API_KEY`)
   - `GEMINI_API_KEYS` (optional fallback)
4. Click **Deploy** ✨

<br />

## 🔧 Production Hardening

<details>
<summary>🔒 Steps to lock down for real production use</summary>

1. **Restrict RLS policies** to authenticated users:
   ```sql
   drop policy "complaints_public_insert" on public.complaints;
   create policy "complaints_authed_insert" on public.complaints
     for insert with check (auth.role() = 'authenticated');
   ```
2. **Add Supabase Auth** with admin role checks on `/admin` routes
3. **Use service role key** (server-only, never `NEXT_PUBLIC_`) in API routes
4. **Add rate limiting** on `POST /api/complaints` (e.g., Upstash Redis)
5. **Move pipeline to a queue** (Inngest / Vercel Workflow SDK) to avoid HTTP timeouts
6. **Add email notifications** via Resend/SendGrid for escalated cases

</details>

<br />

## 🤝 Contributing

Contributions are welcome! Feel free to:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

<br />

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

<br />

## 🙏 Acknowledgments

- [Vercel AI SDK](https://sdk.vercel.ai/) — structured LLM output generation
- [Groq](https://groq.com/) — ultra-fast LLM inference
- [Google Gemini](https://ai.google.dev/) — reliable fallback AI
- [Supabase](https://supabase.com/) — Postgres + Auth + RLS
- [shadcn/ui](https://ui.shadcn.com/) — beautiful accessible components
- [Recharts](https://recharts.org/) — declarative React charts

<br />

---

<div align="center">

**Built with ❤️ by [Devanshu Pardeshi](https://github.com/Devanshupardeshi)**

⭐ Star this repo if you found it useful!

</div>
