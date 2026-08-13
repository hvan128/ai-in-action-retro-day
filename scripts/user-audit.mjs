// Tra toàn bộ hoạt động của một học viên, và khoá/mở khoá tài khoản khi cần.
//
//   bun scripts/user-audit.mjs "nguyen van a"     tìm theo tên hoặc email
//   bun scripts/user-audit.mjs --id <user_id>     xem chi tiết một người
//   bun scripts/user-audit.mjs --ban <user_id>    khoá tài khoản
//   bun scripts/user-audit.mjs --unban <user_id>  mở khoá
//
// Khoá/mở khoá luôn yêu cầu user_id đầy đủ chứ không nhận tên: tên trùng nhau
// rất dễ, khoá nhầm một học viên vô can thì không sửa được bằng lời xin lỗi.
//
// Cần SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i > -1 ? argv[i + 1] : null;
};
const banId = flag("--ban");
const unbanId = flag("--unban");
const showId = flag("--id");
const query = argv.find((a) => !a.startsWith("--") && a !== banId && a !== unbanId && a !== showId);

// Supabase tính khoá theo thời hạn; đặt một mốc rất xa để coi như vĩnh viễn.
const FOREVER = "876000h";

async function allUsers() {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    out.push(...(data?.users ?? []));
    if (!data?.users?.length || data.users.length < 200) break;
  }
  return out;
}

async function setBan(id, ban) {
  const users = await allUsers();
  const u = users.find((x) => x.id === id);
  if (!u) {
    console.error(`Không có tài khoản nào mang id ${id}.`);
    process.exit(1);
  }
  const { error } = await sb.auth.admin.updateUserById(id, { ban_duration: ban ? FOREVER : "none" });
  if (error) {
    console.error("Lỗi:", error.message);
    process.exit(1);
  }
  console.log(`${ban ? "ĐÃ KHOÁ" : "ĐÃ MỞ KHOÁ"}: ${u.email}`);
  if (ban) {
    console.log("\nLưu ý:");
    console.log("  · Khoá chỉ chặn đăng nhập. Giấy nhớ đã viết vẫn còn, phải xoá riêng.");
    console.log("  · Đăng ký đang mở và không cần xác nhận email, nên người bị khoá có thể");
    console.log("    lập tài khoản mới trong 20 giây. Muốn chặn thật thì phải tắt đăng ký tự do.");
    console.log(`  · Mở khoá lại: bun scripts/user-audit.mjs --unban ${id}`);
  }
}

async function detail(id) {
  const users = await allUsers();
  const u = users.find((x) => x.id === id);
  const { data: prof } = await sb.from("profiles").select("display_name").eq("id", id).maybeSingle();
  const { data: notes } = await sb
    .from("notes").select("id, content, column_key, board_id, pinned").eq("author_id", id);

  const boardIds = [...new Set((notes ?? []).map((n) => n.board_id))];
  const { data: boards } = boardIds.length
    ? await sb.from("boards").select("id, team_id").in("id", boardIds)
    : { data: [] };
  const teamIds = [...new Set((boards ?? []).map((b) => b.team_id))];
  const { data: teams } = teamIds.length
    ? await sb.from("teams").select("id, code, name, room_id").in("id", teamIds)
    : { data: [] };
  const teamOfBoard = new Map((boards ?? []).map((b) => [b.id, (teams ?? []).find((t) => t.id === b.team_id)]));

  const noteIds = (notes ?? []).map((n) => n.id);
  const likeBy = new Map();
  for (let i = 0; i < noteIds.length; i += 200) {
    const { data } = await sb.from("note_likes").select("note_id").in("note_id", noteIds.slice(i, i + 200));
    for (const l of data ?? []) likeBy.set(l.note_id, (likeBy.get(l.note_id) ?? 0) + 1);
  }

  const COL = { went_well: "làm tốt", could_be_better: "chưa tốt", do_differently: "ý tưởng" };

  console.log(`\n${prof?.display_name ?? "(chưa có tên)"}`);
  console.log(`  id       ${id}`);
  console.log(`  email    ${u?.email ?? "?"}`);
  console.log(`  trạng thái  ${u?.banned_until && new Date(u.banned_until) > new Date() ? "ĐANG BỊ KHOÁ" : "bình thường"}`);
  console.log(`  đã viết  ${notes?.length ?? 0} tờ ở ${teamIds.length} nhóm\n`);

  for (const n of notes ?? []) {
    const t = teamOfBoard.get(n.board_id);
    const likes = likeBy.get(n.id) ?? 0;
    console.log(
      `  [${String(likes).padStart(2)} tim] ${(t?.room_id ?? "?").padEnd(6)} #${(t?.code ?? "?").padEnd(4)} ` +
      `${COL[n.column_key]?.padEnd(9) ?? "?"} ${(n.content ?? "").replace(/\s+/g, " ").slice(0, 90)}`
    );
  }
  console.log(`\n  Khoá tài khoản này:  bun scripts/user-audit.mjs --ban ${id}\n`);
}

// ── chạy ────────────────────────────────────────────────────────────────────
if (banId) await setBan(banId, true);
else if (unbanId) await setBan(unbanId, false);
else if (showId) await detail(showId);
else if (query) {
  const q = query.toLowerCase();
  const users = await allUsers();
  const { data: profiles } = await sb.from("profiles").select("id, display_name");
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  const hits = users.filter(
    (u) => (u.email ?? "").toLowerCase().includes(q) || (nameOf.get(u.id) ?? "").toLowerCase().includes(q),
  );
  if (!hits.length) {
    console.log(`Không tìm thấy ai khớp "${query}".`);
    process.exit(0);
  }
  console.log(`\n${hits.length} tài khoản khớp "${query}":\n`);
  for (const u of hits) {
    const { count } = await sb
      .from("notes").select("id", { count: "exact", head: true }).eq("author_id", u.id);
    const banned = u.banned_until && new Date(u.banned_until) > new Date();
    console.log(`  ${u.id}  ${(nameOf.get(u.id) ?? "?").slice(0, 24).padEnd(25)} ${(u.email ?? "").padEnd(32)} ${String(count ?? 0).padStart(3)} tờ${banned ? "  [ĐANG BỊ KHOÁ]" : ""}`);
  }
  console.log(`\nXem chi tiết:  bun scripts/user-audit.mjs --id <user_id>\n`);
} else {
  console.error("Thiếu tham số. Xem hướng dẫn ở đầu file.");
  process.exit(1);
}
