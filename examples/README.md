# Sentinel-AI Triage Agent — Example Dataset

This directory contains 12 hand-crafted customer support examples that demonstrate the full range of the triage agent's capabilities: tool selection, priority assignment, reasoning traces, and escalation logic.

## Purpose

- **Evaluation**: Compare agent decisions against `_ground_truth.json` to measure accuracy
- **Regression testing**: Re-run examples after model or prompt changes to detect regressions  
- **Demonstration**: Show stakeholders real triage decisions and reasoning traces
- **Development**: Use as a test harness during Phase 7+ development

## Folder Structure

```
examples/
├── _ground_truth.json          # Expected labels for all 12 examples
├── README.md                   # This file
├── 01_billing_double_charge/
│   ├── input.json              # Raw complaint text + metadata
│   ├── output.json             # Triage decision + model/timing metadata
│   └── trace.json              # Full TriageTraceStep[] reasoning trace
├── 02_legal_threat/
│   └── ...
...
└── 12_safety_serious/
    └── ...
```

### `input.json`
```json
{
  "text": "customer complaint text",
  "metadata": {
    "customer_email": "optional@example.com",
    "product": "optional product name",
    "channel": "web"
  }
}
```

### `output.json`
```json
{
  "complaint_id": "dry-run",
  "decision": {
    "category": "billing",
    "priority": "P1",
    "next_tool": "draft_acknowledgment",
    "reasoning": "Multi-sentence explanation...",
    "why": "One-sentence summary.",
    "confidence": 0.92
  },
  "model": "google/gemini-2.0-flash",
  "steps_used": 4,
  "duration_ms": 2340
}
```

### `trace.json`
Array of `TriageTraceStep` objects capturing every thought, tool call, tool result, and final decision in order.

## How to Re-run Examples

Regenerate all `output.json` and `trace.json` files using the real triage agent:

```bash
npx tsx scripts/run_examples.ts
```

> **Requirements**: `GEMINI_API_KEYS` or `GROQ_API_KEYS` must be set in your environment. The script runs each example through the live model and overwrites the output files.

You can also test a single example via the API endpoint:

```bash
curl -X POST http://localhost:3000/api/triage \
  -H "Content-Type: application/json" \
  -d @examples/01_billing_double_charge/input.json
```

## Example Table

| # | Name | Category | Priority | Next Tool | Tools Called | Escalated |
|---|------|----------|----------|-----------|--------------|-----------|
| 01 | Billing double charge | `billing` | P1 | `draft_acknowledgment` | lookup_history, draft_ack | No |
| 02 | Legal threat | `safety_or_legal` | P0 | `escalate_to_human` | escalate | **Yes** |
| 03 | Repeat customer | `product_defect` | P1 | `lookup_customer_history` | lookup_history | No |
| 04 | Known pattern | `shipping` | P2 | `search_similar_past_complaints` | search_similar | No |
| 05 | Vague low confidence | `product_defect` | P2 | `escalate_to_human` | escalate | **Yes** |
| 06 | Spam | `product_defect` | P2 | `escalate_to_human` | escalate | **Yes** |
| 07 | Account locked urgent | `account_access` | P0 | `escalate_to_human` | escalate | **Yes** |
| 08 | Minor typo | `product_defect` | P2 | `draft_acknowledgment` | draft_ack | No |
| 09 | Multi issue | `billing` | P1 | `lookup_customer_history` | lookup_history, search_similar | No |
| 10 | Sarcasm | `shipping` | P2 | `draft_acknowledgment` | draft_ack | No |
| 11 | Already resolved | `billing` | P2 | `none` | *(none)* | No |
| 12 | Safety serious | `safety_or_legal` | P0 | `escalate_to_human` | escalate | **Yes** |

## Coverage Summary

| Dimension | Values Covered |
|-----------|----------------|
| **Categories** | billing, product_defect, shipping, account_access, safety_or_legal |
| **Priorities** | P0 (×4), P1 (×3), P2 (×5) |
| **next_tool** | draft_acknowledgment (×3), escalate_to_human (×5), lookup_customer_history (×2), search_similar_past_complaints (×1), none (×1) |
| **Escalations** | 5 examples (02, 05, 06, 07, 12) |
| **Multi-tool** | 2 examples (01: lookup+draft, 09: lookup+search) |
| **Low confidence** | 2 examples (05: 0.38, 06: 0.12) |
| **Sarcasm** | 1 example (10) |
| **Safety/Legal** | 2 examples (02, 12) |
| **Repeat customer** | 1 example (03) |
| **Account access** | 1 example (07) |
