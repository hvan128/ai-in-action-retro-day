// Mã nhóm mà học viên định vào, giữ lại trong lúc họ đi qua màn hình đăng nhập.
//
// Guard của /_authenticated chỉ redirect sang /auth chứ không mang theo đường
// quay lại, nên nếu không nhớ mã thì người quét QR lúc chưa đăng nhập sẽ bị thả
// về danh sách phòng và phải tự mò lại nhóm của mình.

const KEY = "retro:pendingJoin";

export function rememberPendingJoin(code: string) {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    // Trình duyệt chặn localStorage (chế độ riêng tư): chấp nhận mất đường quay lại.
  }
}

/** Đọc và xoá luôn — chỉ dùng được một lần, tránh lần đăng nhập sau bị nhảy lung tung. */
export function takePendingJoin(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    if (v) localStorage.removeItem(KEY);
    return v;
  } catch {
    return null;
  }
}
