// Bảng điều phối trực tiếp cho người dẫn buổi retro.
//
// Hiện cùng lúc toàn bộ phòng/nhóm: ai đã vào, viết được bao nhiêu tờ ở từng cột,
// bao nhiêu tim, đã ghim mấy hành động — và tự gắn cờ nhóm đang có vấn đề để bạn
// biết cần cử trợ giảng tới bàn nào. Chỉ đọc, không ghi gì vào cơ sở dữ liệu.
//
//   bun scripts/retro-console.mjs              xem một lần
//   bun scripts/retro-console.mjs --watch      tự làm mới mỗi 15 giây
//   bun scripts/retro-console.mjs --watch=30   tự làm mới mỗi 30 giây
//   bun scripts/retro-console.mjs --phase=action   bật thêm cờ thiếu hành động
//
// Cần SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY trong môi trường.

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const argv = process.argv.slice(2);
const watchArg = argv.find((a) => a.startsWith("--watch"));
const watchSec = watchArg ? Number(watchArg.split("=")[1] ?? 15) || 15 : 0;
const phase = (argv.find((a) => a.startsWith("--phase=")) ?? "").split("=")[1] ?? "";

// Ba cột của mẫu sprint_retrospective, theo đúng thứ tự hiển thị trên bảng.
const COLUMNS = [
  { key: "went_well", label: "tốt" },
  { key: "could_be_better", label: "chưa tốt" },
  { key: "do_differently", label: "ý tưởng" },
];

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m",
};
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

async function snapshot() {
  const [teamsRes, boardsRes, membersRes, notesRes, likesRes] = await Promise.all([
    sb.from("teams").select("id, code, name, room_id"),
    sb.from("boards").select("id, team_id"),
    sb.from("team_members").select("team_id, user_id"),
    sb.from("notes").select("id, board_id, column_key, pinned"),
    sb.from("note_likes").select("note_id"),
  ]);

  for (const [name, r] of Object.entries({ teams: teamsRes, boards: boardsRes, members: membersRes, notes: notesRes, likes: likesRes })) {
    if (r.error) throw new Error(`Đọc ${name} lỗi: ${r.error.message}`);
  }

  const boardByTeam = new Map((boardsRes.data ?? []).map((b) => [b.team_id, b.id]));

  const memberCount = new Map();
  const distinctUsers = new Set();
  for (const m of membersRes.data ?? []) {
    memberCount.set(m.team_id, (memberCount.get(m.team_id) ?? 0) + 1);
    distinctUsers.add(m.user_id);
  }

  const likeByNote = new Map();
  for (const l of likesRes.data ?? []) likeByNote.set(l.note_id, (likeByNote.get(l.note_id) ?? 0) + 1);

  const perBoard = new Map();
  for (const n of notesRes.data ?? []) {
    let b = perBoard.get(n.board_id);
    if (!b) { b = { cols: {}, pinned: 0, likes: 0, total: 0 }; perBoard.set(n.board_id, b); }
    b.cols[n.column_key] = (b.cols[n.column_key] ?? 0) + 1;
    b.total += 1;
    if (n.pinned) b.pinned += 1;
    b.likes += likeByNote.get(n.id) ?? 0;
  }

  const rooms = new Map();
  for (const t of (teamsRes.data ?? []).sort((a, b) => a.code.localeCompare(b.code))) {
    const boardId = boardByTeam.get(t.id);
    const s = (boardId && perBoard.get(boardId)) || { cols: {}, pinned: 0, likes: 0, total: 0 };
    const row = {
      code: t.code,
      name: t.name,
      members: memberCount.get(t.id) ?? 0,
      hasBoard: Boolean(boardId),
      ...s,
    };
    if (!rooms.has(t.room_id)) rooms.set(t.room_id, []);
    rooms.get(t.room_id).push(row);
  }

  return { rooms: [...rooms.entries()].sort(), students: distinctUsers.size };
}

function flagFor(r) {
  if (!r.hasBoard) return { text: "THIẾU BẢNG", color: C.red };
  if (r.members === 0) return { text: "CHƯA AI VÀO", color: C.red };
  if (r.total === 0) return { text: "CHƯA VIẾT GÌ", color: C.yellow };
  // Chỉ soi hành động khi đã tới giai đoạn chốt, trước đó chưa ghim là bình thường.
  if (phase === "action" && r.pinned < 2) return { text: "THIẾU HÀNH ĐỘNG", color: C.yellow };
  return null;
}

function render(snap, at) {
  const lines = [];
  let tTeams = 0, tNotes = 0, tLikes = 0, tPinned = 0, tProblem = 0;

  for (const [room, rows] of snap.rooms) {
    lines.push("");
    lines.push(`${C.bold}${C.cyan}${room}${C.reset}  ${C.dim}${rows.length} nhóm${C.reset}`);
    lines.push(
      `${C.dim}  ${pad("mã", 6)}${pad("nhóm", 20)}${padL("người", 6)}` +
      COLUMNS.map((c) => padL(c.label, 10)).join("") +
      `${padL("tim", 6)}${padL("ghim", 6)}${C.reset}`
    );

    for (const r of rows) {
      tTeams += 1; tNotes += r.total; tLikes += r.likes; tPinned += r.pinned;
      const flag = flagFor(r);
      if (flag) tProblem += 1;

      const cols = COLUMNS.map((c) => {
        const v = r.cols[c.key] ?? 0;
        return v === 0 ? `${C.dim}${padL("·", 10)}${C.reset}` : padL(v, 10);
      }).join("");

      lines.push(
        `  ${pad("#" + r.code, 6)}${pad(r.name.slice(0, 19), 20)}${padL(r.members, 6)}` +
        cols +
        `${padL(r.likes || "·", 6)}${padL(r.pinned || "·", 6)}` +
        (flag ? `   ${flag.color}${C.bold}← ${flag.text}${C.reset}` : "")
      );
    }
  }

  const head =
    `${C.bold}BẢNG ĐIỀU PHỐI RETRO${C.reset}  ${C.dim}${at}` +
    (watchSec ? ` · làm mới mỗi ${watchSec}s · Ctrl+C để thoát` : "") +
    (phase ? ` · giai đoạn: ${phase}` : "") + C.reset;

  const summary =
    `${C.bold}TỔNG${C.reset}  ${tTeams} nhóm · ` +
    `${C.green}${snap.students}${C.reset} học viên đã vào · ` +
    `${tNotes} giấy nhớ · ${tLikes} tim · ${tPinned} tờ đã ghim` +
    (tProblem > 0 ? ` · ${C.red}${C.bold}${tProblem} nhóm cần để mắt${C.reset}` : ` · ${C.green}mọi nhóm ổn${C.reset}`);

  return [head, "", summary, ...lines, ""].join("\n");
}

async function tick() {
  const at = new Date().toLocaleTimeString("vi-VN");
  try {
    const snap = await snapshot();
    const out = render(snap, at);
    if (watchSec) process.stdout.write("\x1b[2J\x1b[H");
    console.log(out);
  } catch (err) {
    console.error(`${C.red}[${at}] ${err.message}${C.reset}`);
  }
}

await tick();
if (watchSec) setInterval(tick, watchSec * 1000);
