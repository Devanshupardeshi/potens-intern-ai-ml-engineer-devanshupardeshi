-- =============================================================================
-- 002_add_triage_columns.sql
-- Phase 1 — Triage Agent: schema additions
--
-- Safe to run more than once: every operation uses IF NOT EXISTS or checks
-- pg_catalog before acting.  No existing columns or rows are modified.
-- Applies to: public.complaints, public.agent_runs
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1.  New triage columns on public.complaints
--     All nullable — existing rows remain valid after migration.
-- ---------------------------------------------------------------------------

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS triage_category    text,
  ADD COLUMN IF NOT EXISTS triage_priority    text,
  ADD COLUMN IF NOT EXISTS triage_next_tool   text,
  ADD COLUMN IF NOT EXISTS triage_reasoning   text,
  ADD COLUMN IF NOT EXISTS triage_why         text,
  ADD COLUMN IF NOT EXISTS triage_confidence  numeric;

-- ---------------------------------------------------------------------------
-- 2.  Check constraint: triage_priority must be P0 | P1 | P2 or NULL
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'complaints_triage_priority_check'
      AND conrelid = 'public.complaints'::regclass
  ) THEN
    ALTER TABLE public.complaints
      ADD CONSTRAINT complaints_triage_priority_check
        CHECK (triage_priority IN ('P0', 'P1', 'P2') OR triage_priority IS NULL);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3.  Check constraint: triage_confidence must be 0–1 or NULL
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'complaints_triage_confidence_check'
      AND conrelid = 'public.complaints'::regclass
  ) THEN
    ALTER TABLE public.complaints
      ADD CONSTRAINT complaints_triage_confidence_check
        CHECK (triage_confidence BETWEEN 0 AND 1 OR triage_confidence IS NULL);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4.  Full-text search generated column
--     Concatenates subject + description and stores a pre-computed tsvector.
--     Generated columns cannot use IF NOT EXISTS — guard with a catalog check.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'complaints'
      AND column_name  = 'description_tsv'
  ) THEN
    ALTER TABLE public.complaints
      ADD COLUMN description_tsv tsvector
        GENERATED ALWAYS AS (
          to_tsvector(
            'english',
            coalesce(subject, '') || ' ' || coalesce(description, '')
          )
        ) STORED;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5.  run_kind column on public.agent_runs
--     NOT NULL with default 'pipeline' so existing rows automatically get
--     the right value without a backfill.
-- ---------------------------------------------------------------------------
ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS run_kind text NOT NULL DEFAULT 'pipeline';

-- ---------------------------------------------------------------------------
-- 6.  Check constraint: run_kind must be 'pipeline' or 'triage'
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_runs_run_kind_check'
      AND conrelid = 'public.agent_runs'::regclass
  ) THEN
    ALTER TABLE public.agent_runs
      ADD CONSTRAINT agent_runs_run_kind_check
        CHECK (run_kind IN ('pipeline', 'triage'));
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7.  Indexes
-- ---------------------------------------------------------------------------

-- GIN index on the FTS column (enables fast text search)
CREATE INDEX IF NOT EXISTS complaints_tsv_idx
  ON public.complaints USING gin (description_tsv);

-- BTree index on triage_priority for dashboard filtering
CREATE INDEX IF NOT EXISTS complaints_triage_priority_idx
  ON public.complaints (triage_priority);

-- BTree index on run_kind to separate pipeline vs triage audit rows
CREATE INDEX IF NOT EXISTS agent_runs_kind_idx
  ON public.agent_runs (run_kind);

-- =============================================================================
-- End of migration 002
-- =============================================================================
