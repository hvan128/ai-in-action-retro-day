-- Confession ẩn danh, phải qua admin duyệt mới hiển thị.

CREATE TABLE public.confessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Vẫn lưu người gửi: ẩn danh là ẩn với học viên khác, không phải ẩn với ban
  -- tổ chức. Không có cột này thì một lần quấy rối là không truy được ai.
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  -- Số thứ tự kiểu trang confession, chỉ gán khi được duyệt.
  number INT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  CONSTRAINT confessions_status_check CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT confessions_content_len CHECK (char_length(btrim(content)) BETWEEN 1 AND 2000)
);

CREATE INDEX confessions_status_idx ON public.confessions(status, number DESC);
CREATE INDEX confessions_author_idx ON public.confessions(author_id);

ALTER TABLE public.confessions ENABLE ROW LEVEL SECURITY;

-- RLS lọc theo dòng chứ không theo cột: chỉ cần đọc được dòng là đọc được cả
-- author_id, thế là mất ẩn danh. Nên cấp quyền theo từng cột, author_id và
-- status không nằm trong danh sách học viên được đọc.
GRANT SELECT (id, content, number, created_at) ON public.confessions TO authenticated;
GRANT INSERT (content, author_id) ON public.confessions TO authenticated;
GRANT ALL ON public.confessions TO service_role;

-- Học viên chỉ thấy bài đã duyệt. Bài chờ duyệt và bài bị từ chối vô hình với
-- tất cả, kể cả chính người gửi — không thì đếm số là đoán ra ai gửi bài nào.
CREATE POLICY "Đọc confession đã duyệt"
  ON public.confessions FOR SELECT TO authenticated
  USING (status = 'approved');

-- status không nằm trong quyền INSERT nên luôn rơi về DEFAULT 'pending';
-- WITH CHECK ở đây là lớp chặn thứ hai phòng khi quyền cột bị nới sau này.
CREATE POLICY "Tự gửi confession"
  ON public.confessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id AND status = 'pending');

-- Không có policy UPDATE/DELETE cho authenticated: duyệt, sửa và xoá chỉ đi qua
-- server function chạy bằng service role.
