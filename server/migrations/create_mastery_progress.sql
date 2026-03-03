-- Mastery Progress table: stores per-user mastery progression (themes, tiers, found pairs)
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS mastery_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_mastery_progress_user_id ON mastery_progress(user_id);

-- RLS: users can only read/write their own mastery progress
ALTER TABLE mastery_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own mastery" ON mastery_progress
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own mastery" ON mastery_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own mastery" ON mastery_progress
  FOR UPDATE USING (auth.uid() = user_id);

-- Service role (backend) bypasses RLS, so the API route using supabaseAdmin will work regardless.
