// Phân tích chất lượng giấy nhớ của một phòng, để người điều phối biết nên
// can thiệp ở đâu khi buổi retro đang chạy.
//
//   bun scripts/analyze-notes.mjs E403
//   bun scripts/analyze-notes.mjs E403 --examples 8
//
// Chỉ đọc. Cần SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "@supabase/supabase-js";

const room = process.argv[2];
if (!room || room.startsWith("--")) {
  console.error("Thiếu mã phòng. Ví dụ: bun scripts/analyze-notes.mjs E403");
  process.exit(1);
}
const exArg = process.argv.indexOf("--examples");
const EX = exArg > -1 ? Number(process.argv[exArg + 1]) || 6 : 6;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const COLUMNS = [
  ["went_well", "Làm tốt"],
  ["could_be_better", "Chưa tốt"],
  ["do_differently", "Ý tưởng"],
];

const { data: teams, error: e1 } = await sb
  .from("teams").select("id, code, name").eq("room_id", room);
if (e1) { console.error(e1.message); process.exit(1); }
if (!teams.length) { console.error(`Phòng ${room} chưa có nhóm nào.`); process.exit(1); }

const teamIds = teams.map((t) => t.id);
const { data: boards } = await sb.from("boards").select("id, team_id").in("team_id", teamIds);
const boardIds = (boards ?? []).map((b) => b.id);
const teamByBoard = new Map((boards ?? []).map((b) => [b.id, b.team_id]));

const { data: notes } = await sb
  .from("notes").select("id, board_id, author_id, content, column_key, pinned").in("board_id", boardIds);
const noteIds = (notes ?? []).map((n) => n.id);

// Lấy tim theo lô: URL có giới hạn độ dài, danh sách note dài sẽ vỡ nếu nhét hết vào một lần.
const likeByNote = new Map();
for (let i = 0; i < noteIds.length; i += 200) {
  const { data } = await sb.from("note_likes").select("note_id").in("note_id", noteIds.slice(i, i + 200));
  for (const l of data ?? []) likeByNote.set(l.note_id, (likeByNote.get(l.note_id) ?? 0) + 1);
}

const norm = (s) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const words = (s) => norm(s).split(" ").filter(Boolean).length;

// Heuristic "chưa nghiêm túc": quá ngắn để chứa một ý, hoặc rõ ràng là gõ thử.
const JUNK = /^(test|thử|hi|hello|abc+|a+|x+|\.+|\d+|ok|oke|okay|haha+|hihi+|:\)+)$/i;
const isEmpty = (n) => norm(n.content) === "";
const isJunk = (n) => JUNK.test(norm(n.content));
const isThin = (n) => !isEmpty(n) && !isJunk(n) && words(n.content) <= 3;
const isSubstantive = (n) => !isEmpty(n) && !isJunk(n) && words(n.content) >= 6;

const all = notes ?? [];
const empty = all.filter(isEmpty);
const junk = all.filter(isJunk);
const thin = all.filter(isThin);
const substantive = all.filter(isSubstantive);

// Trùng nội dung giữa các nhóm — dấu hiệu chép của nhau hoặc dán hàng loạt.
const byContent = new Map();
for (const n of all) {
  if (isEmpty(n)) continue;
  const k = norm(n.content);
  if (!byContent.has(k)) byContent.set(k, []);
  byContent.get(k).push(n);
}
const dupes = [...byContent.entries()].filter(([, v]) => v.length > 1).sort((a, b) => b[1].length - a[1].length);

const authors = new Set(all.filter((n) => !isEmpty(n)).map((n) => n.author_id));
const pct = (a, b) => (b ? ((a / b) * 100).toFixed(0) : "0");

console.log(`\nPHÒNG ${room}\n${"─".repeat(58)}`);
console.log(`  ${teams.length} nhóm · ${all.length} giấy nhớ · ${authors.size} người có viết`);
console.log(`  Trung bình ${(all.length / teams.length).toFixed(1)} tờ/nhóm, ${(all.length / (authors.size || 1)).toFixed(1)} tờ/người`);

console.log(`\nCHẤT LƯỢNG`);
console.log(`  Có nội dung thật (≥6 từ)   ${String(substantive.length).padStart(4)}  ${pct(substantive.length, all.length)}%`);
console.log(`  Sơ sài (1–3 từ)            ${String(thin.length).padStart(4)}  ${pct(thin.length, all.length)}%`);
console.log(`  Gõ thử / vô nghĩa          ${String(junk.length).padStart(4)}  ${pct(junk.length, all.length)}%`);
console.log(`  Trống                      ${String(empty.length).padStart(4)}  ${pct(empty.length, all.length)}%`);

console.log(`\nTHEO CỘT`);
for (const [k, label] of COLUMNS) {
  const inCol = all.filter((n) => n.column_key === k);
  const sub = inCol.filter(isSubstantive).length;
  console.log(`  ${label.padEnd(10)} ${String(inCol.length).padStart(4)} tờ · ${String(sub).padStart(3)} có nội dung (${pct(sub, inCol.length)}%)`);
}

console.log(`\nNHÓM YẾU NHẤT`);
const perTeam = teams.map((t) => {
  const b = (boards ?? []).find((x) => x.team_id === t.id);
  const list = b ? all.filter((n) => n.board_id === b.id) : [];
  return { ...t, total: list.length, sub: list.filter(isSubstantive).length };
}).sort((a, b) => a.sub - b.sub || a.total - b.total);
for (const t of perTeam.slice(0, 8)) {
  console.log(`  #${t.code}  ${t.name.slice(0, 28).padEnd(29)} ${String(t.total).padStart(3)} tờ · ${String(t.sub).padStart(2)} có nội dung`);
}

if (dupes.length) {
  console.log(`\nNỘI DUNG TRÙNG (${dupes.length} chuỗi lặp)`);
  for (const [text, list] of dupes.slice(0, 5)) {
    const teamsHit = new Set(list.map((n) => teamByBoard.get(n.board_id))).size;
    console.log(`  ×${list.length} ở ${teamsHit} nhóm — "${text.slice(0, 60)}"`);
  }
}

console.log(`\nVÍ DỤ TỜ SƠ SÀI`);
for (const n of [...junk, ...thin].slice(0, EX)) {
  console.log(`  "${(n.content ?? "").trim().slice(0, 50)}"`);
}

console.log(`\nĐƯỢC NHIỀU TIM NHẤT`);
const top = all.map((n) => ({ n, likes: likeByNote.get(n.id) ?? 0 }))
  .sort((a, b) => b.likes - a.likes).slice(0, 5);
for (const { n, likes } of top) {
  console.log(`  ${String(likes).padStart(2)} tim  "${norm(n.content).slice(0, 62)}"`);
}
console.log("");
