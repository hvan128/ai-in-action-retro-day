
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS code text;

-- Backfill existing teams by created_at order
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at) AS rn FROM public.teams WHERE code IS NULL
)
UPDATE public.teams t SET code = lpad(o.rn::text, 3, '0')
FROM ordered o WHERE t.id = o.id;

CREATE UNIQUE INDEX IF NOT EXISTS teams_code_unique ON public.teams(code);
ALTER TABLE public.teams ALTER COLUMN code SET NOT NULL;

-- Trigger to auto-assign next 3-digit code
CREATE OR REPLACE FUNCTION public.assign_team_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  next_num int;
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    SELECT COALESCE(MAX(code::int), 0) + 1 INTO next_num FROM public.teams WHERE code ~ '^[0-9]+$';
    NEW.code := lpad(next_num::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_team_code ON public.teams;
CREATE TRIGGER trg_assign_team_code
  BEFORE INSERT ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_team_code();
