DROP POLICY IF EXISTS "Team members read notes" ON public.notes;
CREATE POLICY "Notes readable by authenticated" ON public.notes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Team members read note likes" ON public.note_likes;
CREATE POLICY "Note likes readable by authenticated" ON public.note_likes FOR SELECT TO authenticated USING (true);