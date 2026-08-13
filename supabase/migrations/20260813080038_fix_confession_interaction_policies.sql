-- Sửa lỗi: thả cảm xúc và bình luận đều hỏng.
--
-- Policy của confession_reactions/confession_comments kiểm tra bài đã duyệt
-- bằng subquery đọc confessions.status. Nhưng authenticated không có quyền trên
-- cột status (bị REVOKE ở migration trước để giữ ẩn danh), nên mọi thao tác
-- đọc/ghi đều chết với "permission denied for table confessions" — kể cả đọc,
-- khiến giao diện không hiện được số đếm nào.
--
-- Bọc phép kiểm tra vào hàm SECURITY DEFINER: hàm chạy bằng quyền chủ sở hữu
-- nên đọc được status, còn bên ngoài chỉ nhận về đúng một giá trị boolean.

CREATE OR REPLACE FUNCTION public.is_confession_approved(_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.confessions WHERE id = _id AND status = 'approved'
  );
$$;

REVOKE ALL ON FUNCTION public.is_confession_approved(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_confession_approved(uuid) TO authenticated;

DROP POLICY IF EXISTS "Đọc cảm xúc của bài đã duyệt" ON public.confession_reactions;
CREATE POLICY "Đọc cảm xúc của bài đã duyệt"
  ON public.confession_reactions FOR SELECT TO authenticated
  USING (public.is_confession_approved(confession_id));

DROP POLICY IF EXISTS "Tự thả cảm xúc" ON public.confession_reactions;
CREATE POLICY "Tự thả cảm xúc"
  ON public.confession_reactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_confession_approved(confession_id));

DROP POLICY IF EXISTS "Đọc bình luận của bài đã duyệt" ON public.confession_comments;
CREATE POLICY "Đọc bình luận của bài đã duyệt"
  ON public.confession_comments FOR SELECT TO authenticated
  USING (public.is_confession_approved(confession_id));

DROP POLICY IF EXISTS "Tự viết bình luận" ON public.confession_comments;
CREATE POLICY "Tự viết bình luận"
  ON public.confession_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id AND public.is_confession_approved(confession_id));
