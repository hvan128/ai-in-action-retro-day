-- Revert: chỉ member đọc được notes & likes
DROP POLICY IF EXISTS "Notes readable by authenticated" ON public.notes;
CREATE POLICY "Team members read notes" ON public.notes FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.boards b WHERE b.id = notes.board_id AND public.is_team_member(b.team_id, auth.uid())));

DROP POLICY IF EXISTS "Note likes readable by authenticated" ON public.note_likes;
CREATE POLICY "Team members read note likes" ON public.note_likes FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.notes n JOIN public.boards b ON b.id = n.board_id
  WHERE n.id = note_likes.note_id AND public.is_team_member(b.team_id, auth.uid())
));

-- Security-definer function: tóm tắt mọi team trong 1 room
CREATE OR REPLACE FUNCTION public.get_room_team_summaries(_room_id text)
RETURNS TABLE (
  team_id uuid,
  board_id uuid,
  cards_count int,
  pinned_count int,
  likes_total int,
  authors_count int,
  top_notes jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH team_boards AS (
    SELECT t.id AS team_id, b.id AS board_id
    FROM public.teams t
    LEFT JOIN public.boards b ON b.team_id = t.id
    WHERE t.room_id = _room_id
  ),
  note_stats AS (
    SELECT tb.team_id, tb.board_id, n.id AS note_id, n.content, n.color, n.pinned,
           n.column_key, n.created_at, n.author_id,
           COALESCE((SELECT count(*) FROM public.note_likes l WHERE l.note_id = n.id), 0)::int AS likes
    FROM team_boards tb
    LEFT JOIN public.notes n ON n.board_id = tb.board_id
  ),
  ranked AS (
    SELECT *, row_number() OVER (
      PARTITION BY board_id, column_key
      ORDER BY pinned DESC NULLS LAST, likes DESC, created_at ASC
    ) AS rn
    FROM note_stats
    WHERE note_id IS NOT NULL
  ),
  top3 AS (
    SELECT board_id, jsonb_agg(jsonb_build_object(
      'id', note_id, 'content', content, 'color', color,
      'pinned', pinned, 'column_key', column_key, 'likes', likes
    ) ORDER BY column_key, rn) AS top_notes
    FROM ranked WHERE rn <= 3 GROUP BY board_id
  )
  SELECT
    tb.team_id,
    tb.board_id,
    COALESCE((SELECT count(*) FROM note_stats ns WHERE ns.board_id = tb.board_id AND ns.note_id IS NOT NULL), 0)::int,
    COALESCE((SELECT count(*) FROM note_stats ns WHERE ns.board_id = tb.board_id AND ns.pinned), 0)::int,
    COALESCE((SELECT sum(likes) FROM note_stats ns WHERE ns.board_id = tb.board_id), 0)::int,
    COALESCE((SELECT count(DISTINCT author_id) FROM note_stats ns WHERE ns.board_id = tb.board_id AND ns.note_id IS NOT NULL), 0)::int,
    COALESCE(t3.top_notes, '[]'::jsonb)
  FROM team_boards tb
  LEFT JOIN top3 t3 ON t3.board_id = tb.board_id;
$$;

REVOKE ALL ON FUNCTION public.get_room_team_summaries(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_room_team_summaries(text) TO authenticated;