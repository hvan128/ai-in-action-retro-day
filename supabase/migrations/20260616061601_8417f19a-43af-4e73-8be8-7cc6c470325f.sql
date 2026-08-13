
-- Helper: check team membership without RLS recursion
CREATE OR REPLACE FUNCTION public.is_team_member(_team_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members WHERE team_id = _team_id AND user_id = _user_id
  );
$$;

-- Restrict notes SELECT to members of the note's board's team
DROP POLICY IF EXISTS "Notes readable by authenticated" ON public.notes;
CREATE POLICY "Team members read notes"
ON public.notes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.boards b
    WHERE b.id = notes.board_id
      AND public.is_team_member(b.team_id, auth.uid())
  )
);

-- Restrict board_ai_insights SELECT to team members
DROP POLICY IF EXISTS "AI insights readable by authenticated" ON public.board_ai_insights;
CREATE POLICY "Team members read AI insights"
ON public.board_ai_insights FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.boards b
    WHERE b.id = board_ai_insights.board_id
      AND public.is_team_member(b.team_id, auth.uid())
  )
);

-- Restrict note_likes SELECT to team members of the underlying note's board
DROP POLICY IF EXISTS "Likes readable by authenticated" ON public.note_likes;
CREATE POLICY "Team members read note likes"
ON public.note_likes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.notes n
    JOIN public.boards b ON b.id = n.board_id
    WHERE n.id = note_likes.note_id
      AND public.is_team_member(b.team_id, auth.uid())
  )
);
