
DROP POLICY IF EXISTS "Authenticated insert notes" ON public.notes;
CREATE POLICY "Team members insert notes"
ON public.notes
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = author_id
  AND EXISTS (
    SELECT 1 FROM public.boards b
    WHERE b.id = notes.board_id
      AND public.is_team_member(b.team_id, auth.uid())
  )
);

DROP POLICY IF EXISTS "Users add own like" ON public.note_likes;
CREATE POLICY "Team members add own like"
ON public.note_likes
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.notes n
    JOIN public.boards b ON b.id = n.board_id
    WHERE n.id = note_likes.note_id
      AND public.is_team_member(b.team_id, auth.uid())
  )
);

DROP POLICY IF EXISTS "Teams readable by anon" ON public.teams;
REVOKE SELECT ON public.teams FROM anon;
