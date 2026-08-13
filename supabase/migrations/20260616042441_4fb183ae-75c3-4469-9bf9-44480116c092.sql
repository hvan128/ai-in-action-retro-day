-- 1. Add labels column to notes
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS labels text[] NOT NULL DEFAULT '{}'::text[];

-- 2. Create board_ai_insights table
CREATE TABLE public.board_ai_insights (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(board_id)
);

CREATE INDEX board_ai_insights_board_idx ON public.board_ai_insights(board_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_ai_insights TO authenticated;
GRANT ALL ON public.board_ai_insights TO service_role;

ALTER TABLE public.board_ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "AI insights readable by authenticated"
  ON public.board_ai_insights FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Team members insert AI insights"
  ON public.board_ai_insights FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.boards b
      JOIN public.team_members tm ON tm.team_id = b.team_id
      WHERE b.id = board_ai_insights.board_id AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Team members update AI insights"
  ON public.board_ai_insights FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.boards b
      JOIN public.team_members tm ON tm.team_id = b.team_id
      WHERE b.id = board_ai_insights.board_id AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Team members delete AI insights"
  ON public.board_ai_insights FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.boards b
      JOIN public.team_members tm ON tm.team_id = b.team_id
      WHERE b.id = board_ai_insights.board_id AND tm.user_id = auth.uid()
    )
  );

CREATE TRIGGER board_ai_insights_touch
  BEFORE UPDATE ON public.board_ai_insights
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.board_ai_insights;