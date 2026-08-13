-- Đính kèm ảnh vào confession.

ALTER TABLE public.confessions ADD COLUMN image_path TEXT;

-- Bảng này đã REVOKE ALL rồi cấp lại theo từng cột: cột mới không tự có quyền.
GRANT SELECT (image_path) ON public.confessions TO authenticated;
GRANT INSERT (image_path) ON public.confessions TO authenticated;

-- Bucket công khai để đọc: ảnh chỉ lộ ra khi bài được duyệt, mà tên file là
-- UUID ngẫu nhiên nên ảnh của bài chưa duyệt không ai đoán ra đường dẫn.
-- Giới hạn 5MB và chỉ nhận ảnh, chặn ngay ở tầng storage thay vì tin vào form.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'confession-images', 'confession-images', true, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Bucket public nên đọc không cần policy. Chỉ cần cho phép người đã đăng nhập
-- tải ảnh lên; không cấp UPDATE/DELETE để không ai xoá ảnh của người khác.
DROP POLICY IF EXISTS "Tải ảnh confession lên" ON storage.objects;
CREATE POLICY "Tải ảnh confession lên"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'confession-images');
