// Sinh ảnh QR để chiếu lên máy chiếu: mỗi phòng một ảnh 16:9, kèm một ảnh tổng
// chứa cả 5 phòng.
//
// Link mã hoá trong QR là /j/{mã} — mã nhóm duy nhất toàn hệ thống nên không cần
// room trong URL, đủ ngắn để ai không quét được thì gõ tay.
//
//   bun scripts/make-qr-poster.mjs
//
// Cần SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, và rsvg-convert để xuất PNG.

import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const BASE_URL = process.env.RETRO_BASE_URL || "https://ai-in-action-retro-day.van-nh120802.workers.dev";
const OUT_DIR = process.env.RETRO_OUT_DIR || "qr-posters";

const INK = "#141319";
const ACCENT = "#4F3FD6";
const MUTED = "#6B6875";
const GROUND = "#FFFFFF";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Vẽ QR thành một <path> duy nhất — nhẹ hơn hàng nghìn <rect> rất nhiều. */
function qrPath(text, size) {
  // Mức sửa lỗi M: chịu được vết bẩn/che khuất khi in mà không làm mã quá dày.
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const cell = size / n;
  let d = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.modules.get(x, y)) {
        d += `M${(x * cell).toFixed(2)} ${(y * cell).toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`;
      }
    }
  }
  return d;
}

function qrCell(team, x, y, qrSize, opts = {}) {
  const link = `${BASE_URL}/j/${team.code}`;
  const codeSize = opts.codeSize ?? 56;
  const nameSize = opts.nameSize ?? 24;
  const urlSize = opts.urlSize ?? 20;
  // Chỉ in phần đuôi. Tên miền đã nằm ở header một lần rồi — in đủ dưới mỗi ô
  // thì chữ dài hơn bề ngang ô và tràn đè sang nhóm bên cạnh.
  const shortUrl = `/j/${team.code}`;

  return `
  <g transform="translate(${x} ${y})">
    <path d="${qrPath(link, qrSize)}" fill="${INK}"/>
    <text x="${qrSize / 2}" y="${qrSize + codeSize + 6}" text-anchor="middle"
          font-family="Helvetica, Arial, sans-serif" font-size="${codeSize}" font-weight="bold"
          fill="${ACCENT}">#${esc(team.code)}</text>
    <text x="${qrSize / 2}" y="${qrSize + codeSize + nameSize + 14}" text-anchor="middle"
          font-family="Helvetica, Arial, sans-serif" font-size="${nameSize}" fill="${INK}">${esc(team.name)}</text>
    <text x="${qrSize / 2}" y="${qrSize + codeSize + nameSize + urlSize + 22}" text-anchor="middle"
          font-family="Helvetica, Arial, sans-serif" font-size="${urlSize}" fill="${MUTED}">${esc(shortUrl)}</text>
  </g>`;
}

function roomPoster(room, teams) {
  const W = 1920, H = 1080;
  const cols = 4;
  const qrSize = 250;
  const cellW = 430, cellH = 400;
  const gridW = cols * cellW;
  const left = (W - gridW) / 2 + (cellW - qrSize) / 2;
  const top = 300;

  const cells = teams
    .map((t, i) => qrCell(t, left + (i % cols) * cellW, top + Math.floor(i / cols) * cellH, qrSize))
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${GROUND}"/>
  <text x="${W / 2}" y="130" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
        font-size="110" font-weight="bold" fill="${INK}">PHÒNG ${esc(room)}</text>
  <text x="${W / 2}" y="185" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
        font-size="34" fill="${MUTED}">Quét mã QR của bàn mình để vào thẳng bảng retro của nhóm</text>
  <text x="${W / 2}" y="228" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
        font-size="27" fill="${MUTED}">Không quét được thì gõ <tspan font-weight="bold" fill="${INK}">${esc(BASE_URL.replace(/^https:\/\//, ""))}</tspan> rồi thêm đuôi bên dưới</text>
  <rect x="${(W - 1700) / 2}" y="258" width="1700" height="2" fill="#E3E2EA"/>
  ${cells}
</svg>`;
}

/**
 * Một QR duy nhất dẫn về trang chủ, dùng khi để học viên tự tạo nhóm.
 * Kèm ba bước vì chiếu lên là cả phòng nhìn thấy, đỡ phải hô đi hô lại.
 */
function singlePoster() {
  const W = 1920, H = 1080;
  const qrSize = 560;
  const qrX = 190, qrY = 300;
  const stepX = 900;
  const domain = BASE_URL.replace(/^https:\/\//, "");

  // SVG không tự xuống dòng: mô tả ở 33px chỉ vừa khoảng 55 ký tự trước khi
  // tràn khỏi mép phải. Giữ ngắn hơn mức đó.
  const steps = [
    ["1", "Đăng nhập", "Chưa có tài khoản thì bấm “Tạo tài khoản mới”."],
    ["2", "Chọn phòng của bạn", "Đúng phòng đang ngồi: D303, D304, D305, E402, E403."],
    ["3", "Tạo nhóm hoặc vào nhóm", "Một bạn bấm tạo, cả bàn chọn đúng tên nhóm đó."],
  ]
    .map(([n, title, desc], i) => {
      const y = 330 + i * 190;
      return `
    <text x="${stepX}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="64"
          font-weight="bold" fill="${ACCENT}">${n}</text>
    <text x="${stepX + 70}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="52"
          font-weight="bold" fill="${INK}">${esc(title)}</text>
    <text x="${stepX + 70}" y="${y + 52}" font-family="Helvetica, Arial, sans-serif" font-size="33"
          fill="${MUTED}">${esc(desc)}</text>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${GROUND}"/>
  <text x="${W / 2}" y="120" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
        font-size="82" font-weight="bold" fill="${INK}">AI IN ACTION DAY 15 — RETRO</text>
  <text x="${W / 2}" y="180" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
        font-size="36" fill="${MUTED}">Quét mã để bắt đầu retro của nhóm bạn</text>
  <rect x="110" y="225" width="${W - 220}" height="2" fill="#E3E2EA"/>
  <path d="${qrPath(BASE_URL, qrSize)}" fill="${INK}" transform="translate(${qrX} ${qrY})"/>
  <text x="${qrX + qrSize / 2}" y="${qrY + qrSize + 62}" text-anchor="middle"
        font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="bold"
        fill="${INK}">${esc(domain)}</text>
  ${steps}
</svg>`;
}

function masterPoster(byRoom) {
  const W = 2600, H = 2000;
  const qrSize = 170;
  const cellW = 320, cellH = 330;
  // Nhãn phòng đặt ở 58px bold nên chiếm khoảng 150px; chừa 300px để nó không
  // đè lên vùng định vị của QR đầu hàng, đè vào đó là mã không quét được.
  const labelW = 300;
  const top = 260;

  let body = "";
  let row = 0;
  for (const [room, teams] of byRoom) {
    const y = top + row * cellH;
    body += `<text x="90" y="${y + qrSize / 2}" font-family="Helvetica, Arial, sans-serif"
      font-size="58" font-weight="bold" fill="${ACCENT}">${esc(room)}</text>`;
    body += teams
      .map((t, i) => qrCell(t, labelW + i * cellW, y, qrSize, { codeSize: 38, nameSize: 0, urlSize: 20 }))
      .join("");
    row++;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${GROUND}"/>
  <text x="90" y="110" font-family="Helvetica, Arial, sans-serif" font-size="76" font-weight="bold"
        fill="${INK}">AI IN ACTION DAY 15 — RETRO</text>
  <text x="90" y="170" font-family="Helvetica, Arial, sans-serif" font-size="34" fill="${MUTED}">
    Tìm phòng của bạn, quét mã QR của bàn mình. Không quét được thì gõ ${esc(BASE_URL.replace(/^https:\/\//, ""))}/j/&lt;mã&gt;
  </text>
  <rect x="90" y="205" width="${W - 180}" height="2" fill="#E3E2EA"/>
  ${body}
</svg>`;
}

// ── chạy ────────────────────────────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });

function render(name, svg) {
  const svgPath = `${OUT_DIR}/${name}.svg`;
  const pngPath = `${OUT_DIR}/${name}.png`;
  writeFileSync(svgPath, svg);
  execFileSync("rsvg-convert", ["-o", pngPath, svgPath]);
  return pngPath;
}

// --single: một QR duy nhất về trang chủ, dùng khi học viên tự tạo nhóm.
if (process.argv.includes("--single")) {
  console.log(render("qr-chung", singlePoster()));
  process.exit(0);
}

const { data: teams, error } = await sb
  .from("teams")
  .select("code, name, room_id")
  .order("code");
if (error) {
  console.error("Không đọc được teams:", error.message);
  process.exit(1);
}
if (!teams?.length) {
  console.error("Chưa có nhóm nào.");
  console.error("Tạo sẵn nhóm bằng seed-retro-teams.mjs --apply, hoặc dùng --single để");
  console.error("sinh một QR chung khi muốn học viên tự tạo nhóm.");
  process.exit(1);
}

const byRoom = new Map();
for (const t of teams) {
  if (!byRoom.has(t.room_id)) byRoom.set(t.room_id, []);
  byRoom.get(t.room_id).push(t);
}
const sortedRooms = [...byRoom.entries()].sort();

const made = [];
for (const [room, list] of sortedRooms) {
  made.push(render(`phong-${room}`, roomPoster(room, list)));
}
made.push(render("tat-ca-phong", masterPoster(sortedRooms)));

console.log(`${teams.length} nhóm · ${sortedRooms.length} phòng`);
for (const p of made) console.log(`  ${p}`);
