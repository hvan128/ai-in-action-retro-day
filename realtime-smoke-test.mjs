// Kiểm tra Realtime trên backend mới: service Realtime có chạy không, và bảng
// notes/note_likes có thực sự nằm trong publication supabase_realtime không.
// Dùng service_role để bỏ qua RLS, cô lập đúng phần realtime.
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

const results = {};
let remaining = 2;

function done(table, status, err) {
  if (results[table]) return;
  results[table] = { status, err: err?.message ?? null };
  console.log(`${table.padEnd(11)} -> ${status}${err ? "  (" + err.message + ")" : ""}`);
  if (--remaining === 0) {
    const ok = Object.values(results).every((r) => r.status === "SUBSCRIBED");
    console.log(ok ? "\nKET QUA: realtime OK tren backend moi" : "\nKET QUA: REALTIME CO VAN DE");
    process.exit(ok ? 0 : 1);
  }
}

for (const table of ["notes", "note_likes"]) {
  const ch = sb
    .channel(`smoke-${table}-${Date.now()}`)
    .on("postgres_changes", { event: "*", schema: "public", table }, () => {})
    .subscribe((status, err) => {
      if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        done(table, status, err);
      }
    });
}

setTimeout(() => {
  console.log("HET GIO - realtime khong phan hoi trong 25s");
  process.exit(2);
}, 25000);
