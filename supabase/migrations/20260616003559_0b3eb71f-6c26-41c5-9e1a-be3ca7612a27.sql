
CREATE TABLE public.note_likes (
  note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (note_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.note_likes TO authenticated;
GRANT ALL ON public.note_likes TO service_role;

ALTER TABLE public.note_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Likes readable by authenticated"
  ON public.note_likes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users add own like"
  ON public.note_likes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users remove own like"
  ON public.note_likes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.note_likes;
