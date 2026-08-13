
-- Block any update to notes.votes coming from regular client roles.
REVOKE UPDATE (votes) ON public.notes FROM authenticated;
REVOKE UPDATE (votes) ON public.notes FROM anon;

-- Defense in depth: prevent direct modification via a trigger as well.
CREATE OR REPLACE FUNCTION public.prevent_notes_votes_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.votes IS DISTINCT FROM OLD.votes THEN
    NEW.votes := OLD.votes;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_notes_votes_change ON public.notes;
CREATE TRIGGER prevent_notes_votes_change
BEFORE UPDATE ON public.notes
FOR EACH ROW
EXECUTE FUNCTION public.prevent_notes_votes_change();
