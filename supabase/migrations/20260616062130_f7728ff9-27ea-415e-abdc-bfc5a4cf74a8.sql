
GRANT SELECT ON public.rooms TO anon;
GRANT SELECT ON public.teams TO anon;

CREATE POLICY "Rooms readable by anon" ON public.rooms
  FOR SELECT TO anon USING (true);

CREATE POLICY "Teams readable by anon" ON public.teams
  FOR SELECT TO anon USING (true);
