
-- Update default template for new boards
ALTER TABLE public.boards ALTER COLUMN template SET DEFAULT 'sprint_retrospective';

-- Migrate all existing boards to the Sprint Retrospective template
UPDATE public.boards SET template = 'sprint_retrospective';
