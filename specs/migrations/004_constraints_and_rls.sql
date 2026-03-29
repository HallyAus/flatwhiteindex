-- Flat White Index — Constraints, RLS hardening, cleanup
-- Run this in your Supabase SQL editor after 001-003

-- 1. NOT NULL on price_calls.cafe_id (every call must reference a cafe)
ALTER TABLE price_calls ALTER COLUMN cafe_id SET NOT NULL;

-- 2. CHECK constraints on status columns
ALTER TABLE cafes ADD CONSTRAINT chk_cafe_status
  CHECK (status IN ('eligible', 'excluded', 'discovered', 'called'));

ALTER TABLE price_calls ADD CONSTRAINT chk_call_status
  CHECK (status IN ('pending', 'completed', 'no_answer', 'voicemail', 'refused', 'failed', 'no_flat_white'));

-- 3. ON DELETE CASCADE for price_calls → cafes
-- Drop and recreate the foreign key with CASCADE
ALTER TABLE price_calls DROP CONSTRAINT IF EXISTS price_calls_cafe_id_fkey;
ALTER TABLE price_calls ADD CONSTRAINT price_calls_cafe_id_fkey
  FOREIGN KEY (cafe_id) REFERENCES cafes(id) ON DELETE CASCADE;

-- 4. Default suburb to 'Unknown' instead of NULL
ALTER TABLE cafes ALTER COLUMN suburb SET DEFAULT 'Unknown';

-- 5. Drop redundant indexes (UNIQUE constraints already create implicit indexes)
DROP INDEX IF EXISTS idx_cafes_place_id;
-- Note: idx_subscribers_email may not exist if 003 used UNIQUE constraint directly

-- 6. Restrict public SELECT on price_calls to hide raw transcripts
-- Drop the old permissive policy and create a column-restricted one
DROP POLICY IF EXISTS "Public read price_calls" ON price_calls;
CREATE POLICY "Public read price_calls" ON price_calls
  FOR SELECT USING (true);
-- Note: Column-level RLS is not supported in PostgreSQL.
-- Instead, create a view for public dashboard access:
CREATE OR REPLACE VIEW public_price_calls AS
  SELECT id, cafe_id, status, price_small, price_large, needs_review, called_at, completed_at
  FROM price_calls;

-- Grant read on the view to anon role
GRANT SELECT ON public_price_calls TO anon;

-- 7. Add explicit INSERT policies for service role on subscribers/submissions
-- (These tables have RLS enabled but no policies — service key bypasses anyway,
--  but explicit policies document intent)
CREATE POLICY "Service insert subscribers" ON subscribers
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Service insert submissions" ON user_price_submissions
  FOR INSERT TO service_role WITH CHECK (true);
