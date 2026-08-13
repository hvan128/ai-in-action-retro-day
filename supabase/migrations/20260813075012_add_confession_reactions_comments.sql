-- Thả cảm xúc và bình luận cho confession.
--
-- Bài confession ẩn danh, nhưng BÌNH LUẬN THÌ HIỆN TÊN. Bình luận ẩn danh là
-- kênh văng tục không có cửa kiểm soát: bài viết còn qua được hàng chờ duyệt,
-- bình luận thời gian thực thì không hàng chờ nào theo kịp.

CREATE TABLE public.confession_reactions (
  confession_id UUID NOT NULL REFERENCES public.confessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Một người một cảm xúc cho mỗi bài: đổi thì ghi đè, không cộng dồn được.
  PRIMARY KEY (confession_id, user_id),
  CONSTRAINT confession_reactions_emoji_check CHECK (emoji IN ('❤️', '😂', '😮', '😢', '👏'))
);

CREATE TABLE public.confession_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  confession_id UUID NOT NULL REFERENCES public.confessions(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT confession_comments_len CHECK (char_length(btrim(content)) BETWEEN 1 AND 500)
);

CREATE INDEX confession_comments_post_idx ON public.confession_comments(confession_id, created_at);

ALTER TABLE public.confession_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.confession_comments ENABLE ROW LEVEL SECURITY;

-- Supabase cấp sẵn INSERT/SELECT/UPDATE/DELETE trên mọi cột cho anon và
-- authenticated qua default privileges của schema public. GRANT chỉ cộng thêm
-- chứ không thu hẹp, nên phải REVOKE trước rồi mới cấp đúng thứ cần.
REVOKE ALL ON public.confession_reactions FROM anon, authenticated;
REVOKE ALL ON public.confession_comments FROM anon, authenticated;

-- Cảm xúc: user_id đọc được vì client cần biết mình đã thả gì để bỏ hoặc đổi.
-- Đây không phải phần bí mật — người ẩn danh là người VIẾT BÀI, không phải
-- người thả cảm xúc. Giao diện chỉ hiển thị số đếm.
GRANT SELECT (confession_id, user_id, emoji) ON public.confession_reactions TO authenticated;
GRANT INSERT (confession_id, user_id, emoji) ON public.confession_reactions TO authenticated;
GRANT UPDATE (emoji) ON public.confession_reactions TO authenticated;
GRANT DELETE ON public.confession_reactions TO authenticated;
GRANT ALL ON public.confession_reactions TO service_role;

GRANT SELECT (id, confession_id, author_id, content, created_at) ON public.confession_comments TO authenticated;
GRANT INSERT (confession_id, author_id, content) ON public.confession_comments TO authenticated;
GRANT DELETE ON public.confession_comments TO authenticated;
GRANT ALL ON public.confession_comments TO service_role;

-- Chỉ tương tác được với bài ĐÃ DUYỆT. Không có mệnh đề này thì đoán id là
-- thả cảm xúc được lên bài đang chờ, và đếm số là lộ bài nào đang nằm hàng chờ.
CREATE POLICY "Đọc cảm xúc của bài đã duyệt"
  ON public.confession_reactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.confessions c
                 WHERE c.id = confession_id AND c.status = 'approved'));

CREATE POLICY "Tự thả cảm xúc"
  ON public.confession_reactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id
              AND EXISTS (SELECT 1 FROM public.confessions c
                          WHERE c.id = confession_id AND c.status = 'approved'));

CREATE POLICY "Tự đổi cảm xúc của mình"
  ON public.confession_reactions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Tự bỏ cảm xúc của mình"
  ON public.confession_reactions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Đọc bình luận của bài đã duyệt"
  ON public.confession_comments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.confessions c
                 WHERE c.id = confession_id AND c.status = 'approved'));

CREATE POLICY "Tự viết bình luận"
  ON public.confession_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id
              AND EXISTS (SELECT 1 FROM public.confessions c
                          WHERE c.id = confession_id AND c.status = 'approved'));

-- Chỉ xoá được bình luận của chính mình. Admin xoá bình luận người khác qua
-- service role.
CREATE POLICY "Tự xoá bình luận của mình"
  ON public.confession_comments FOR DELETE TO authenticated
  USING (auth.uid() = author_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.confession_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.confession_comments;
