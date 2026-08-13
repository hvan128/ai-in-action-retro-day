ALTER TABLE public.teams ADD COLUMN description text;
GRANT SELECT, INSERT, UPDATE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;