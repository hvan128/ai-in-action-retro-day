
-- Search path already set, but ensure
ALTER FUNCTION public.touch_updated_at() SET search_path = public;

-- Revoke execute from public/authenticated on trigger functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

-- Tighten boards policies (only team creator can update/delete, only team members can insert)
DROP POLICY IF EXISTS "Authenticated create boards" ON public.boards;
DROP POLICY IF EXISTS "Authenticated update boards" ON public.boards;
DROP POLICY IF EXISTS "Authenticated delete boards" ON public.boards;

CREATE POLICY "Team members create boards" ON public.boards FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = boards.team_id AND tm.user_id = auth.uid()));
CREATE POLICY "Team members update boards" ON public.boards FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = boards.team_id AND tm.user_id = auth.uid()));
CREATE POLICY "Team creator delete boards" ON public.boards FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = boards.team_id AND t.created_by = auth.uid()));

-- Tighten notes update: only team members can update notes on their board
DROP POLICY IF EXISTS "Authenticated update notes" ON public.notes;
CREATE POLICY "Team members update notes" ON public.notes FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.boards b
    JOIN public.team_members tm ON tm.team_id = b.team_id
    WHERE b.id = notes.board_id AND tm.user_id = auth.uid()
  ));
