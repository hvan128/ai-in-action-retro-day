// Tạo sẵn team + board cho buổi retro, rồi in ra link tham gia của từng nhóm.
//
// Vì sao cần: mã team do trigger assign_team_code sinh tuần tự toàn hệ thống
// (MAX(code)+1, unique across mọi phòng). Tạo sẵn theo thứ tự có kiểm soát thì
// mã đoán trước được, và học viên chỉ cần mở đúng một link — route
// /rooms/{roomId}/{code} tự upsert team_members rồi nhảy thẳng vào board.
// Không ai phải tự tạo team, không có nhóm trùng tên, không ai lạc phòng.
//
// Chạy khô (mặc định, KHÔNG ghi gì):
//   bun scripts/seed-retro-teams.mjs
// Ghi thật:
//   bun scripts/seed-retro-teams.mjs --apply
//
// Cần SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY trong môi trường.

import { createClient } from "@supabase/supabase-js";

// ─── SỬA Ở ĐÂY ───────────────────────────────────────────────────────────────
// Số nhóm cho mỗi phòng. Retro chạy tốt nhất ở nhóm 5–6 người; 200 học viên
// chia 5 phòng là 40 người/phòng, tức 7 nhóm mỗi phòng.
const PLAN = [
  { room: "D303", teams: 7 },
  { room: "D304", teams: 7 },
  { room: "D305", teams: 7 },
  { room: "E402", teams: 7 },
  { room: "E403", teams: 7 },
];

const BASE_URL = "https://ai-in-action-retro-day.van-nh120802.workers.dev";
const teamName = (room, i) => `${room} · Nhóm ${i}`;
const NOTE_COLORS = ["note-yellow", "note-green", "note-blue", "note-pink", "note-purple"];
// ─────────────────────────────────────────────────────────────────────────────

const apply = process.argv.includes("--apply");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

// Chặn chạy nhầm hai lần: nếu phòng đã có team thì dừng, tránh tạo trùng.
const { data: existing, error: exErr } = await sb.from("teams").select("code, name, room_id");
if (exErr) {
  console.error("Không đọc được bảng teams:", exErr.message);
  process.exit(1);
}

const rooms = PLAN.map((p) => p.room);
const clash = (existing ?? []).filter((t) => rooms.includes(t.room_id));
if (clash.length > 0) {
  console.error(`\n${apply ? "DỪNG LẠI" : "CẢNH BÁO"}: ${clash.length} team đã tồn tại trong các phòng sắp tạo.\n`);
  for (const t of clash) console.error(`  #${t.code}  ${t.room_id}  ${t.name}`);
  console.error("\nXoá chúng trong /admin trước, hoặc bỏ phòng đó khỏi PLAN rồi chạy lại.");
  // Chạy khô không ghi gì nên vẫn cho xem trước; chỉ chặn cứng khi ghi thật.
  if (apply) process.exit(1);
  console.error("");
}

const total = PLAN.reduce((s, p) => s + p.teams, 0);
console.log(`\n${apply ? "GHI THẬT" : "CHẠY KHÔ (không ghi gì)"} — ${total} nhóm trong ${PLAN.length} phòng\n`);

const rows = [];
let seq = (existing ?? []).reduce((m, t) => Math.max(m, parseInt(t.code, 10) || 0), 0);

for (const { room, teams } of PLAN) {
  for (let i = 1; i <= teams; i++) {
    const name = teamName(room, i);
    const color = NOTE_COLORS[(i - 1) % NOTE_COLORS.length];

    if (!apply) {
      // Mã thật do trigger sinh; ở chế độ chạy khô chỉ suy ra để xem trước.
      seq += 1;
      rows.push({ room, name, code: String(seq).padStart(3, "0") });
      continue;
    }

    const { data: team, error: e1 } = await sb
      .from("teams")
      .insert({ room_id: room, name, color, code: "" })
      .select("id, code")
      .single();
    if (e1) {
      console.error(`Lỗi tạo team "${name}": ${e1.message}`);
      process.exit(1);
    }

    const { error: e2 } = await sb
      .from("boards")
      .insert({ team_id: team.id, template: "sprint_retrospective", title: `${name} • Retro` });
    if (e2) {
      console.error(`Đã tạo team "${name}" (#${team.code}) nhưng lỗi tạo board: ${e2.message}`);
      process.exit(1);
    }

    rows.push({ room, name, code: team.code });
  }
}

console.log("| Phòng | Nhóm | Mã | Link phát cho học viên |");
console.log("| --- | --- | --- | --- |");
for (const r of rows) {
  console.log(`| ${r.room} | ${r.name} | #${r.code} | ${BASE_URL}/rooms/${r.room}/${r.code} |`);
}

console.log(
  apply
    ? `\nXong. Đã tạo ${rows.length} nhóm kèm board.`
    : `\nMới là bản xem trước. Thêm --apply để tạo thật.\nMã ở trên là suy ra từ MAX(code) hiện tại — mã thật vẫn do trigger sinh.`
);
