import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAdminData,
  adminCreateUser,
  adminDeleteTeam,
  adminDeleteNote,
  adminListAccounts,
  adminSetUserBan,
} from "@/lib/admin-data.functions";
import { TEMPLATES, type TemplateKey } from "@/lib/utils";
import { Download, Trash2, Ban, Search, Undo2 } from "lucide-react";
import { Linkify } from "@/lib/linkify";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Toàn bộ dữ liệu retro" }] }),
  component: AdminPage,
});

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v).replace(/"/g, '""');
  return /[",\n\r]/.test(s) ? `"${s}"` : s;
}

function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function AdminPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const fetchAdmin = useServerFn(getAdminData);
  const createUser = useServerFn(adminCreateUser);
  const deleteTeam = useServerFn(adminDeleteTeam);
  const deleteNote = useServerFn(adminDeleteNote);
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [roomFilter, setRoomFilter] = useState<string>("all");
  const [newEmail, setNewEmail] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newName, setNewName] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  const listAccounts = useServerFn(adminListAccounts);
  const setUserBan = useServerFn(adminSetUserBan);
  const [userQuery, setUserQuery] = useState("");
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  const [banningId, setBanningId] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmType, setConfirmType] = useState<"team" | "card" | "ban" | "unban" | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmLabel, setConfirmLabel] = useState<string>("");
  const [confirmDetail, setConfirmDetail] = useState<string>("");

  useEffect(() => {
    if (user.email !== "admin@gmail.com") navigate({ to: "/rooms" });
  }, [user.email, navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-data"],
    queryFn: () => fetchAdmin(),
    enabled: user.email === "admin@gmail.com",
  });

  const { data: accounts } = useQuery({
    queryKey: ["admin-accounts"],
    queryFn: () => listAccounts(),
    enabled: user.email === "admin@gmail.com",
  });

  const tpl = TEMPLATES["sprint_retrospective" as TemplateKey] ?? Object.values(TEMPLATES)[0];

  // Map legacy column keys -> current template keys
  const LEGACY_KEY_MAP: Record<string, string> = {
    liked: "went_well",
    disliked: "could_be_better",
    ideas: "do_differently",
    learned: "do_differently",
    action: "action_items",
  };
  const normalizeKey = (k: string) => LEGACY_KEY_MAP[k] ?? k;

  const filtered = useMemo(() => {
    if (!data) return null;
    const profById = new Map(data.profiles.map((p: any) => [p.id, p.display_name]));
    const teams = roomFilter === "all" ? data.teams : data.teams.filter((t: any) => t.room_id === roomFilter);
    const teamIds = new Set(teams.map((t: any) => t.id));
    const boards = data.boards.filter((b: any) => teamIds.has(b.team_id));
    const boardToTeam = new Map(boards.map((b: any) => [b.id, b.team_id]));
    const teamById = new Map(teams.map((t: any) => [t.id, t]));
    const roomById = new Map(data.rooms.map((r: any) => [r.id, r]));
    const notes = data.notes
      .filter((n: any) => boardToTeam.has(n.board_id))
      .map((n: any) => {
        const teamId = boardToTeam.get(n.board_id);
        const team = teamById.get(teamId);
        const room = team ? roomById.get(team.room_id) : null;
        return {
          ...n,
          column_key: normalizeKey(n.column_key),
          team_id: teamId,
          team_name: team?.name ?? "",
          team_code: team?.code ?? "",
          room_id: team?.room_id ?? "",
          room_name: room?.name ?? "",
          author_name: profById.get(n.author_id) ?? "Ẩn danh",
        };
      });
    return { teams, notes, profById };
  }, [data, roomFilter]);

  function exportCsv() {
    if (!filtered) return;
    const header = ["room_id", "room_name", "team_code", "team_name", "lane", "lane_title", "content", "author", "pinned", "votes", "likes", "liked_by_users", "created_at"];
    const laneTitle = (k: string) => tpl.columns.find((c) => c.key === k)?.title ?? k;
    const rows: (string | number | null | undefined)[][] = [header];
    for (const n of filtered.notes) {
      const likedByNames = (n.liked_by ?? [])
        .map((uid: string) => filtered.profById.get(uid) ?? uid)
        .join(", ");
      rows.push([
        n.room_id, n.room_name, n.team_code, n.team_name,
        n.column_key, laneTitle(n.column_key),
        n.content, n.author_name,
        n.pinned ? "yes" : "no",
        n.votes ?? 0,
        n.likes ?? 0,
        likedByNames,
        n.created_at,
      ]);
    }
    const tag = roomFilter === "all" ? "all" : `room-${roomFilter}`;
    downloadCsv(`retro-${tag}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  // Gộp tài khoản (email, trạng thái khoá) với giấy nhớ đã có sẵn trong
  // getAdminData. Xếp người viết nhiều lên trước — cần soi ai thì gần như luôn
  // là người viết nhiều nhất.
  const people = useMemo(() => {
    if (!data) return [];
    const nameOf = new Map<string, string>(data.profiles.map((p: any) => [p.id, p.display_name]));
    const teamOfBoard = new Map<string, any>();
    for (const b of data.boards) {
      teamOfBoard.set(b.id, data.teams.find((t: any) => t.id === b.team_id));
    }
    const byAuthor = new Map<string, any[]>();
    for (const n of data.notes) {
      if (!byAuthor.has(n.author_id)) byAuthor.set(n.author_id, []);
      byAuthor.get(n.author_id)!.push({ ...n, team: teamOfBoard.get(n.board_id) });
    }
    return (accounts ?? [])
      .map((a: any) => ({
        ...a,
        name: nameOf.get(a.id) ?? "(chưa đặt tên)",
        notes: byAuthor.get(a.id) ?? [],
      }))
      .sort((a: any, b: any) => b.notes.length - a.notes.length);
  }, [data, accounts]);

  const visiblePeople = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return people.slice(0, 20);
    return people.filter(
      (p: any) => p.name.toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q),
    );
  }, [people, userQuery]);

  function askDelete(type: "team" | "card" | "ban" | "unban", id: string, label: string, detail: string) {
    setConfirmType(type);
    setConfirmId(id);
    setConfirmLabel(label);
    setConfirmDetail(detail);
    setConfirmOpen(true);
  }

  async function doDelete() {
    if (!confirmType || !confirmId) return;
    const isBanAction = confirmType === "ban" || confirmType === "unban";
    if (isBanAction) setBanningId(confirmId);
    else setDeletingId(confirmId);
    setConfirmOpen(false);
    try {
      if (confirmType === "team") {
        await deleteTeam({ data: { team_id: confirmId } });
      } else if (confirmType === "card") {
        await deleteNote({ data: { note_id: confirmId } });
      } else {
        await setUserBan({ data: { user_id: confirmId, banned: confirmType === "ban" } });
        await queryClient.invalidateQueries({ queryKey: ["admin-accounts"] });
      }
      await queryClient.invalidateQueries({ queryKey: ["admin-data"] });
    } catch (e: any) {
      alert("Lỗi: " + e.message);
    } finally {
      setDeletingId(null);
      setBanningId(null);
    }
  }

  if (user.email !== "admin@gmail.com") return null;

  return (
    <main className="canvas-grid min-h-[calc(100vh-4rem)]">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-brand">Admin</span>
            <h1 className="font-display mt-2 text-4xl font-bold leading-tight tracking-tight">
              Toàn cảnh retro 🛰️
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Xem & export dữ liệu của một lớp hoặc tất cả lớp, theo đủ 4 lane.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-muted-foreground">Lọc theo lớp</label>
            <select
              value={roomFilter}
              onChange={(e) => setRoomFilter(e.target.value)}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold"
            >
              <option value="all">Tất cả lớp</option>
              {(data?.rooms ?? []).map((r: any) => (
                <option key={r.id} value={r.id}>
                  {r.name} {r.description ? `— ${r.description}` : ""}
                </option>
              ))}
            </select>
            <button
              onClick={exportCsv}
              disabled={!filtered}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              <Download className="size-4" /> Export CSV
            </button>
          </div>
        </div>

        <section className="mb-6 rounded-2xl border-2 border-border bg-white p-5">
          <h2 className="font-display text-lg font-bold">👥 Tạo tài khoản</h2>
          <p className="mt-1 text-xs text-muted-foreground">Bỏ qua rate limit signup. Email tự động xác nhận.</p>

          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@example.com" className="rounded-lg border border-border px-3 py-2 text-sm" />
            <input value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="password" className="rounded-lg border border-border px-3 py-2 text-sm" />
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Tên hiển thị (tuỳ chọn)" className="rounded-lg border border-border px-3 py-2 text-sm" />
            <button
              disabled={creating || !newEmail || !newPass}
              onClick={async () => {
                setCreating(true); setCreateMsg(null);
                try {
                  const res = await createUser({ data: { email: newEmail, password: newPass, display_name: newName || undefined } });
                  setCreateMsg(`✅ Đã tạo ${res.email}`);
                  setNewEmail(""); setNewPass(""); setNewName("");
                } catch (e: any) { setCreateMsg(`❌ ${e.message}`); }
                finally { setCreating(false); }
              }}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
            >{creating ? "Đang tạo…" : "Tạo"}</button>
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold">Tạo hàng loạt (CSV: email,password,tên)</summary>
            <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={6} placeholder={"user1@example.com,pass123,Tên 1\nuser2@example.com,pass123,Tên 2"} className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm font-mono" />
            <button
              disabled={creating || !bulkText.trim()}
              onClick={async () => {
                setCreating(true); setCreateMsg(null);
                const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
                let ok = 0, fail = 0; const errors: string[] = [];
                for (const line of lines) {
                  const [email, password, ...rest] = line.split(",").map((s) => s.trim());
                  if (!email || !password) { fail++; errors.push(`${line} → thiếu email/pass`); continue; }
                  try {
                    await createUser({ data: { email, password, display_name: rest.join(",") || undefined } });
                    ok++;
                  } catch (e: any) { fail++; errors.push(`${email} → ${e.message}`); }
                }
                setCreateMsg(`Hoàn tất: ${ok} thành công, ${fail} lỗi.${errors.length ? "\n" + errors.slice(0, 5).join("\n") : ""}`);
                if (ok > 0) setBulkText("");
                setCreating(false);
              }}
              className="mt-2 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
            >{creating ? "Đang tạo…" : "Tạo hàng loạt"}</button>
          </details>

          {createMsg && <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">{createMsg}</pre>}
        </section>

        {isLoading && <div className="rounded-xl border border-border bg-white p-8 text-center text-sm text-muted-foreground">Đang tải dữ liệu…</div>}
        {error && <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">Lỗi: {(error as Error).message}</div>}

        {filtered && (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Lớp" value={roomFilter === "all" ? data!.rooms.length : 1} />
              <Stat label="Team" value={filtered.teams.length} />
              <Stat label="Tổng card" value={filtered.notes.length} />
              <Stat label="Người tham gia" value={new Set(filtered.notes.map((n: any) => n.author_id)).size} />
            </div>

            <section className="mb-6 rounded-2xl border-2 border-border bg-white p-5">
              <h2 className="font-display text-lg font-bold">🗂️ Nhóm ({filtered.teams.length})</h2>
              <p className="mt-1 text-xs text-muted-foreground">Xoá nhóm sẽ xoá luôn bảng, card và thành viên của nhóm đó.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.teams.map((t: any) => {
                  const room = (data?.rooms ?? []).find((r: any) => r.id === t.room_id);
                  const noteCount = filtered.notes.filter((n: any) => n.team_id === t.id).length;
                  return (
                    <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">#{t.code} · {t.name}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{room?.name ?? "—"} · {noteCount} card</div>
                      </div>
                      <button
                        disabled={deletingId === t.id}
                        onClick={() => askDelete("team", t.id, `nhóm "${t.name}"`, "Toàn bộ bảng, card và thành viên của nhóm sẽ bị xoá.")}
                        className="shrink-0 rounded-md bg-red-500 px-2 py-1 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-50"
                      >{deletingId === t.id ? "Đang xoá…" : "Xoá"}</button>
                    </div>
                  );
                })}
                {filtered.teams.length === 0 && <div className="col-span-full text-center text-xs text-muted-foreground">Chưa có nhóm nào</div>}
              </div>
            </section>

            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
              {tpl.columns.map((col) => {
                const items = filtered.notes
                  .filter((n: any) => n.column_key === col.key)
                  .slice()
                  .sort((a: any, b: any) => {
                    if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
                    const la = a.likes ?? 0;
                    const lb = b.likes ?? 0;
                    if (lb !== la) return lb - la;
                    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
                  });
                const colLikes = items.reduce((sum: number, n: any) => sum + (n.likes ?? 0), 0);
                return (
                  <section key={col.key} className={`rounded-2xl border-2 border-${col.color}-200 bg-${col.color}-50/40 p-3`}>
                    <header className="mb-3 flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{col.emoji}</span>
                        <h2 className="text-sm font-bold leading-tight">{col.title}</h2>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`rounded-full bg-${col.color}-100 px-2 py-0.5 text-xs font-bold text-${col.color}-700`}>{items.length}</span>
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-600">❤ {colLikes}</span>
                      </div>
                    </header>
                    <div className="space-y-2 max-h-[80vh] overflow-auto pr-1">
                      {items.length === 0 && <div className="px-2 py-6 text-center text-xs text-muted-foreground">Chưa có card nào</div>}
                      {items.map((n: any) => {
                        const likes = n.likes ?? 0;
                        const votes = n.votes ?? 0;
                        return (
                          <article key={n.id} className={`relative rounded-xl border ${n.pinned ? "border-amber-400 ring-2 ring-amber-300" : `border-${n.color ?? "yellow"}-200`} bg-${n.color ?? "yellow"}-100 p-3 text-sm shadow-sm`}>
                            <div className="mb-1 flex items-center justify-between gap-1.5 text-[10px] font-bold">
                              <div className="flex items-center gap-1.5">
                                {n.pinned && <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-amber-950">📌 PIN</span>}
                                {likes > 0 && <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-white">❤ {likes}</span>}
                                {votes > 0 && <span className="rounded-full bg-violet-500 px-1.5 py-0.5 text-white">▲ {votes}</span>}
                              </div>
                              <button
                                disabled={deletingId === n.id}
                                onClick={() => askDelete("card", n.id, "card này", n.content?.slice(0, 120) ?? "")}
                                className="shrink-0 rounded-md bg-red-500 px-1.5 py-0.5 text-white hover:bg-red-600 disabled:opacity-50"
                                title="Xoá card"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            </div>
                            <div className="whitespace-pre-wrap break-words text-foreground/90">
                              <Linkify text={n.content ?? ""} />
                            </div>
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              <span>#{n.team_code} · {n.team_name}</span>
                              <span>{n.author_name}</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground">{n.room_name}</div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
            <section className="mt-10">
              <h2 className="font-display text-lg font-bold">👤 Học viên ({people.length})</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Bấm vào một người để xem toàn bộ card họ đã viết. Khoá chỉ chặn đăng nhập —
                card đã viết vẫn còn và phải xoá riêng.
              </p>

              <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <input
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  placeholder="Tìm theo tên hoặc email…"
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>

              <div className="mt-3 space-y-2">
                {visiblePeople.map((p: any) => {
                  const isOpen = openUserId === p.id;
                  return (
                    <div key={p.id} className="rounded-lg border border-border bg-card">
                      <div className="flex flex-wrap items-center gap-2 p-3">
                        <button
                          onClick={() => setOpenUserId(isOpen ? null : p.id)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <span className="truncate text-sm font-semibold">{p.name}</span>
                          {p.banned && (
                            <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700">
                              đã khoá
                            </span>
                          )}
                          <span className="truncate text-xs text-muted-foreground">{p.email}</span>
                        </button>
                        <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                          {p.notes.length} card
                        </span>
                        <button
                          disabled={banningId === p.id}
                          onClick={() =>
                            askDelete(
                              p.banned ? "unban" : "ban",
                              p.id,
                              p.banned ? `mở khoá cho ${p.name}` : `khoá tài khoản ${p.name}`,
                              p.banned
                                ? "Người này sẽ đăng nhập lại được bình thường."
                                : `${p.email} sẽ không đăng nhập được nữa. Card đã viết vẫn còn. Đăng ký đang mở nên họ có thể lập tài khoản mới.`,
                            )
                          }
                          className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-white disabled:opacity-50 ${
                            p.banned ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-500 hover:bg-red-600"
                          }`}
                        >
                          {p.banned ? <Undo2 className="size-3" /> : <Ban className="size-3" />}
                        </button>
                      </div>

                      {isOpen && (
                        <div className="border-t border-border p-3">
                          {p.notes.length === 0 && (
                            <p className="text-xs text-muted-foreground">Chưa viết card nào.</p>
                          )}
                          {p.notes.map((n: any) => (
                            <div key={n.id} className="mb-2 rounded-md bg-muted/40 p-2 text-xs">
                              <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                <span>
                                  {n.team?.room_id} · #{n.team?.code} · {tpl.columns.find((c) => c.key === normalizeKey(n.column_key))?.title ?? n.column_key}
                                </span>
                                <button
                                  disabled={deletingId === n.id}
                                  onClick={() => askDelete("card", n.id, "card này", n.content?.slice(0, 120) ?? "")}
                                  className="shrink-0 rounded bg-red-500 px-1.5 py-0.5 text-white hover:bg-red-600 disabled:opacity-50"
                                  title="Xoá card"
                                >
                                  <Trash2 className="size-3" />
                                </button>
                              </div>
                              <div className="whitespace-pre-wrap break-words text-foreground/90">
                                <Linkify text={n.content ?? ""} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {!userQuery && people.length > 20 && (
                  <p className="text-xs text-muted-foreground">
                    Đang hiện 20 người viết nhiều nhất. Gõ vào ô tìm kiếm để thấy những người còn lại.
                  </p>
                )}
              </div>
            </section>
          </>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmType === "ban" ? "Xác nhận khoá" : confirmType === "unban" ? "Xác nhận mở khoá" : "Xác nhận xoá"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmType === "ban" || confirmType === "unban"
                ? `Bạn có chắc muốn ${confirmLabel}?`
                : `Bạn có chắc muốn xoá ${confirmLabel}?`}
              {confirmDetail && <span className="mt-1 block text-muted-foreground">{confirmDetail}</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmOpen(false)}>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              onClick={doDelete}
              className={
                confirmType === "unban"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-red-500 hover:bg-red-600 text-white"
              }
            >
              {confirmType === "ban" ? "Khoá" : confirmType === "unban" ? "Mở khoá" : deletingId ? "Đang xoá…" : "Xoá"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-display mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
