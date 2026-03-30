-- Flat White Index — Performance indexes
-- Run this in your Supabase SQL editor after 004

-- Partial index for needs_review queries (used by admin review tab)
CREATE INDEX IF NOT EXISTS idx_price_calls_needs_review
  ON price_calls(needs_review) WHERE needs_review = true AND status = 'completed';

-- Single-query call stats function (replaces 5 separate COUNT queries)
CREATE OR REPLACE FUNCTION get_call_stats()
RETURNS json AS $$
  SELECT json_build_object(
    'cafes_total', (SELECT count(*) FROM cafes),
    'cafes_excluded', (SELECT count(*) FROM cafes WHERE status = 'excluded'),
    'calls_total', (SELECT count(*) FROM price_calls),
    'calls_completed', (SELECT count(*) FROM price_calls WHERE status = 'completed'),
    'calls_pending', (SELECT count(*) FROM price_calls WHERE status = 'pending')
  );
$$ LANGUAGE sql STABLE;
