-- Create the update_updated_at_column function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create quick_replies table for user-specific quick reply templates
CREATE TABLE public.quick_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  category text DEFAULT 'geral',
  shortcut text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for fast lookup by user
CREATE INDEX idx_quick_replies_user ON public.quick_replies(user_id);

-- Index for shortcut searches
CREATE INDEX idx_quick_replies_shortcut ON public.quick_replies(user_id, shortcut) WHERE shortcut IS NOT NULL;

-- Enable RLS
ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

-- Each user can only CRUD their own quick replies
CREATE POLICY "Users can view own quick replies"
  ON public.quick_replies FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own quick replies"
  ON public.quick_replies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own quick replies"
  ON public.quick_replies FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own quick replies"
  ON public.quick_replies FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to update updated_at
CREATE TRIGGER update_quick_replies_updated_at
  BEFORE UPDATE ON public.quick_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();