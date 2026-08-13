-- Admin ghim confession để nó nổi lên đầu danh sách.

ALTER TABLE public.confessions ADD COLUMN pinned BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX confessions_pinned_idx ON public.confessions(pinned) WHERE pinned;

-- Bảng này đã bị REVOKE ALL rồi cấp lại theo từng cột, nên cột vừa thêm KHÔNG
-- tự có quyền. Thiếu dòng này là client đọc không nổi và tính năng chết câm.
GRANT SELECT (pinned) ON public.confessions TO authenticated;

-- Không cấp UPDATE: ghim chỉ đi qua server function chạy bằng service role.
