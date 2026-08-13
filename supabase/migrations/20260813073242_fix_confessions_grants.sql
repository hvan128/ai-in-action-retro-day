-- Siết quyền trên confessions cho đúng ý định ẩn danh.
--
-- Migration trước cấp quyền theo cột và tưởng thế là đủ. Không đủ: Supabase đã
-- cấp sẵn INSERT/SELECT/UPDATE trên MỌI cột cho anon và authenticated qua
-- default privileges của schema public, mà GRANT theo cột chỉ cộng thêm quyền
-- chứ không thu hẹp. Hệ quả: author_id đọc được, tức ẩn danh chỉ là hình thức.
--
-- Phải REVOKE sạch rồi mới cấp lại đúng những cột cần.

REVOKE ALL ON public.confessions FROM anon;
REVOKE ALL ON public.confessions FROM authenticated;

-- Học viên đọc được nội dung và số thứ tự, không đọc được author_id lẫn status.
GRANT SELECT (id, content, number, created_at) ON public.confessions TO authenticated;

-- Gửi bài: chỉ ghi được nội dung và tự nhận mình là tác giả. status không nằm
-- trong quyền INSERT nên luôn rơi về DEFAULT 'pending', không tự duyệt được.
GRANT INSERT (content, author_id) ON public.confessions TO authenticated;

-- Không cấp UPDATE hay DELETE: sửa và duyệt chỉ đi qua service role.
GRANT ALL ON public.confessions TO service_role;
