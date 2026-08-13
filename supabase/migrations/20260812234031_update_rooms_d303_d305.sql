-- Đổi danh sách phòng học: bỏ C401, thêm D303/D304/D305. E402 và E403 giữ nguyên.
--
-- teams.room_id khai báo ON DELETE CASCADE, nên xoá một room sẽ kéo theo toàn bộ
-- team, board và note thuộc phòng đó. Tại thời điểm viết migration này C401 chưa
-- có team nào nên không mất dữ liệu; nếu chạy lại trên một database đã có dữ liệu
-- thì phải kiểm tra trước.
DELETE FROM public.rooms WHERE id = 'C401';

-- Không đặt description cho khớp với các phòng còn lại: migration
-- 20260616035900 đã chủ động xoá nhãn địa điểm của mọi room về NULL.
INSERT INTO public.rooms (id, name) VALUES
  ('D303', 'D303'),
  ('D304', 'D304'),
  ('D305', 'D305')
ON CONFLICT (id) DO NOTHING;
