ALTER TABLE public.notes ADD COLUMN pinned boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS notes_board_pinned_idx ON public.notes(board_id, pinned);