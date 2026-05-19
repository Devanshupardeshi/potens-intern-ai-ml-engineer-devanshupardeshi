-- =============================================================================
-- 004_pgvector.sql
-- OPTIONAL — Vector similarity search for complaint deduplication
--
-- ⚠️  THIS MIGRATION IS NOT REQUIRED FOR THE APP TO FUNCTION.
--     Apply it only if you want to enable pgvector-based similar-complaint
--     lookup in the triage agent.
--
-- Prerequisites
-- -------------
-- The pgvector extension must be available in your Supabase project.
-- It is pre-installed on all Supabase hosted projects (including the free tier)
-- but must be explicitly enabled per database.
--
-- How to apply
-- ------------
-- Run this file manually in the Supabase SQL editor, OR via the CLI:
--
--   supabase db push --file scripts/004_pgvector.sql
--
-- It is intentionally excluded from any automated migration pipeline until
-- the application code that reads/writes embeddings is in place.
--
-- What this migration does
-- ------------------------
-- 1. Enables the pgvector extension (idempotent).
-- 2. Adds an `embedding` column (1536-dimensional float vector) to
--    public.complaints for storing OpenAI / Gemini text-embedding outputs.
-- 3. Creates an HNSW index for fast approximate nearest-neighbour search
--    using cosine distance.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Step 1: Enable the pgvector extension
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- Step 2: Add embedding column to public.complaints
--         Dimension 1536 matches text-embedding-3-small (OpenAI) and
--         text-embedding-004 (Google).  Adjust if you use a different model.
-- ---------------------------------------------------------------------------
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- ---------------------------------------------------------------------------
-- Step 3: HNSW index for cosine-similarity nearest-neighbour search
--         HNSW is preferred over IVFFlat for small-to-medium datasets because
--         it does not require a training step and handles inserts incrementally.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS complaints_embedding_hnsw_idx
  ON public.complaints
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ---------------------------------------------------------------------------
-- Step 4: Helper function — find the N most similar complaints by cosine
--         distance, excluding the complaint being triaged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_similar_complaints(
  query_embedding  vector(1536),
  exclude_id       uuid,
  match_count      int DEFAULT 5,
  min_similarity   float DEFAULT 0.75
)
RETURNS TABLE (
  id               uuid,
  subject          text,
  description      text,
  category         text,
  status           text,
  priority         text,
  similarity       float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.id,
    c.subject,
    c.description,
    c.category,
    c.status,
    c.priority,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.complaints c
  WHERE c.id           <> exclude_id
    AND c.embedding    IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) >= min_similarity
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- =============================================================================
-- End of optional migration 004
-- =============================================================================
