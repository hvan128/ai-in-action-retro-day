import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/rooms/$roomId")({
  head: ({ params }) => ({ meta: [{ title: `Phòng ${params.roomId} — AI IN ACTION DAY15 - RETRO` }] }),
  component: RoomDetail,
});

const TEAM_COLORS = ["emerald", "rose", "sky", "violet", "amber", "fuchsia"];

function RoomDetail() {
  const { roomId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamDesc, setTeamDesc] = useState("");
  const [color, setColor] = useState("emerald");
  const [busy, setBusy] = useState(false);
  const [loadingTeamId, setLoadingTeamId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");

  const { data: teams } = useQuery({
    queryKey: ["teams", roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id, code, name, description, color, created_by, created_at, team_members(user_id), boards(id, template, title)")
        .eq("room_id", roomId)
        .order("code", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const boardIds = (teams ?? []).flatMap((t: any) => (t.boards ?? []).map((b: any) => b.id));

  const notesQueryKey = ["room-notes", roomId, boardIds.sort().join(",")] as const;
  const { data: notesByBoard } = useQuery({
    queryKey: notesQueryKey,
    enabled: boardIds.length > 0,
    queryFn: async () => {
      const [notesRes, likesRes] = await Promise.all([
        supabase.from("notes").select("id, board_id, author_id, content, color, pinned, column_key, created_at").in("board_id", boardIds),
        supabase.from("note_likes").select("note_id, user_id, notes!inner(board_id)").in("notes.board_id", boardIds),
      ]);
      if (notesRes.error) throw notesRes.error;
      const likeCount: Record<string, number> = {};
      const likedByMe: Record<string, boolean> = {};
      for (const l of likesRes.data ?? []) {
        likeCount[l.note_id] = (likeCount[l.note_id] ?? 0) + 1;
        if (l.user_id === user.id) likedByMe[l.note_id] = true;
      }
      const byBoard: Record<string, { id: string; content: string; color: string; pinned: boolean; column_key: string; likes: number; likedByMe: boolean; created_at: string; author_id: string }[]> = {};
      for (const n of notesRes.data ?? []) {
        (byBoard[n.board_id] ??= []).push({ id: n.id, content: n.content, color: n.color, pinned: n.pinned, column_key: n.column_key, likes: likeCount[n.id] ?? 0, likedByMe: !!likedByMe[n.id], created_at: n.created_at, author_id: n.author_id });
      }
      return byBoard;
    },
  });

  async function toggleLike(noteId: string, currentlyLiked: boolean) {
    // optimistic
    qc.setQueryData(notesQueryKey, (old: any) => {
      if (!old) return old;
      const next: any = {};
      for (const [bid, list] of Object.entries(old)) {
        next[bid] = (list as any[]).map((n) =>
          n.id === noteId ? { ...n, likedByMe: !currentlyLiked, likes: n.likes + (currentlyLiked ? -1 : 1) } : n
        );
      }
      return next;
    });
    if (currentlyLiked) {
      const { error } = await supabase.from("note_likes").delete().eq("note_id", noteId).eq("user_id", user.id);
      if (error) { toast.error("Không bỏ tim được"); qc.invalidateQueries({ queryKey: notesQueryKey }); }
    } else {
      const { error } = await supabase.from("note_likes").insert({ note_id: noteId, user_id: user.id });
      if (error) { toast.error("Không thả tim được"); qc.invalidateQueries({ queryKey: notesQueryKey }); }
    }
  }

  const totals = useMemo(() => {
    let cards = 0, pinned = 0, likes = 0;
    for (const list of Object.values(notesByBoard ?? {})) {
      cards += list.length;
      for (const n of list) { if (n.pinned) pinned++; likes += n.likes; }
    }
    return { cards, pinned, likes, teams: (teams ?? []).length };
  }, [notesByBoard, teams]);

  async function findByCode(e: React.FormEvent) {
    e.preventDefault();
    const code = joinCode.trim().padStart(3, "0");
    if (!/^\d{3}$/.test(code)) {
      toast.error("Mã team phải là 3 chữ số nha");
      return;
    }
    const { data, error } = await supabase
      .from("teams")
      .select("id, boards(id)")
      .eq("code", code)
      .maybeSingle();
    if (error || !data) {
      toast.error(`Không tìm thấy team #${code}`);
      return;
    }
    const board = (data as any).boards?.[0];
    if (board) {
      setLoadingTeamId(data.id);
      await supabase.from("team_members").upsert({ team_id: data.id, user_id: user.id }, { onConflict: "team_id,user_id" });
      navigate({ to: "/board/$roomId/$teamId", params: { roomId, teamId: code } });
    }
  }

  async function createTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!teamName.trim()) return;
    setBusy(true);
    try {
      const { data: team, error: e1 } = await supabase.from("teams")
        .insert({ room_id: roomId, name: teamName.trim(), description: teamDesc.trim() || null, color, created_by: user.id, code: "" })
        .select().single();
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("team_members").insert({ team_id: team.id, user_id: user.id });
      if (e2) throw e2;
      const { data: board, error: e3 } = await supabase.from("boards")
        .insert({ team_id: team.id, template: "sprint_retrospective", title: `${teamName.trim()} • Retro` })
        .select().single();
      if (e3) throw e3;
      toast.success("Đã tạo team thành công! 🎉");
      qc.invalidateQueries({ queryKey: ["teams", roomId] });
      navigate({ to: "/board/$roomId/$teamId", params: { roomId, teamId: team.code } });
    } catch (err: any) {
      toast.error(err.message ?? "Không tạo được team rồi 😢");
    } finally {
      setBusy(false);
    }
  }

  async function joinTeam(teamId: string, teamCode: string, boardId?: string) {
    setLoadingTeamId(teamId);
    try {
      await supabase.from("team_members").upsert({ team_id: teamId, user_id: user.id }, { onConflict: "team_id,user_id" });
      if (boardId) navigate({ to: "/board/$roomId/$teamId", params: { roomId, teamId: teamCode } });
    } catch (err: any) {
      setLoadingTeamId(null);
      toast.error(err.message ?? "Không vào được team rồi 😢");
    }
  }

  return (
    <main className="canvas-grid">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/rooms" className="hover:text-foreground">Phòng học</Link>
          <span>/</span>
          <span className="font-semibold text-foreground">{roomId}</span>
        </div>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-brand">Bước 2 / Chọn team của bạn</span>
            <h1 className="font-display mt-2 text-balance text-4xl font-bold leading-tight tracking-tight">
              Phòng <span className="text-brand">{roomId}</span> — Các team đang hoạt động
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <form onSubmit={findByCode} className="flex items-center gap-2 rounded-xl border border-border bg-white/70 px-3 py-1.5">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Mã team</span>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
                inputMode="numeric"
                placeholder="001"
                className="w-16 bg-transparent text-center font-mono text-base font-bold tracking-widest focus:outline-none"
              />
              <button type="submit" className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-bold text-background hover:opacity-90">Vào</button>
            </form>
            <button onClick={() => setShowCreate(true)} className="shrink-0 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand/20 hover:opacity-90">
              + Tạo team mới
            </button>
          </div>
        </div>

        {teams && teams.length > 0 && (
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Số team" value={totals.teams} accent="brand" />
            <StatCard label="Tổng số card" value={totals.cards} accent="emerald" />
            <StatCard label="Card được ghim" value={totals.pinned} accent="amber" />
            <StatCard label="Lượt thả tim" value={totals.likes} accent="rose" />
          </div>
        )}

        {teams && teams.length === 0 && (
          <div className="rounded-3xl border-2 border-dashed border-border bg-white/40 p-12 text-center">
            <div className="text-4xl">🌱</div>
            <h2 className="font-display mt-3 text-xl font-bold">Chưa có team nào cả</h2>
            <p className="mt-1 text-sm text-muted-foreground">Làm người đầu tiên lập team cho phòng này nhé!</p>
            <button onClick={() => setShowCreate(true)} className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
              Tạo team đầu tiên
            </button>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...(teams ?? [])]
            .sort((a, b) => {
              const boardA = a.boards?.[0];
              const boardB = b.boards?.[0];
              const notesA = boardA ? (notesByBoard?.[boardA.id] ?? []) : [];
              const notesB = boardB ? (notesByBoard?.[boardB.id] ?? []) : [];
              const likesA = notesA.reduce((s, n) => s + n.likes, 0);
              const likesB = notesB.reduce((s, n) => s + n.likes, 0);
              if (likesB !== likesA) return likesB - likesA;
              return notesB.length - notesA.length;
            })
            .map((t) => {
            const board = t.boards?.[0];
            const isMember = t.team_members?.some((m: any) => m.user_id === user.id);
            const isLoading = loadingTeamId === t.id;
            const boardNotes = board ? (notesByBoard?.[board.id] ?? []) : [];
            const topBy = (key: string) =>
              boardNotes
                .filter((n) => n.column_key === key)
                .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.likes - a.likes || new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                .slice(0, 3);
            const sections: { key: string; title: string; emoji: string; accent: string; items: typeof boardNotes }[] = [
              { key: "went_well", title: "Top 3 điều làm tốt", emoji: "😊", accent: "sky", items: topBy("went_well") },
              { key: "do_differently", title: "Top 3 ý tưởng", emoji: "💡", accent: "emerald", items: topBy("do_differently") },
            ];
            return (
              <div key={t.id} className={`group relative rounded-3xl border-2 border-${t.color}-200 bg-${t.color}-50/40 p-6 transition hover:shadow-xl ${isLoading ? "" : "cursor-pointer"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className={`text-xs font-bold uppercase tracking-widest text-${t.color}-600`}>Team {t.color}</div>
                  <div className={`rounded-md bg-${t.color}-100 px-2 py-0.5 font-mono text-xs font-bold tracking-widest text-${t.color}-700`}>#{t.code}</div>
                </div>
                <h3 className="font-display mt-2 text-2xl font-bold">{t.name}</h3>
                {t.description && (
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>{new Set(boardNotes.map((n) => n.author_id)).size} thành viên</span>
                  <span>•</span>
                  <span className="font-semibold text-foreground/70">{boardNotes.length} card</span>
                  {boardNotes.some((n) => n.pinned) && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">📌 {boardNotes.filter((n) => n.pinned).length}</span>
                  )}
                </div>

                <div className="mt-4 space-y-3">
                  {sections.map((sec) => (
                    <div key={sec.key}>
                      <div className={`mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-${sec.accent}-700`}>
                        <span>{sec.emoji}</span>
                        <span>{sec.title}</span>
                        <span className={`ml-auto rounded-full bg-${sec.accent}-100 px-1.5 py-0.5 font-mono text-[10px] text-${sec.accent}-700`}>{sec.items.length}/3</span>
                      </div>
                      {sec.items.length === 0 ? (
                        <div className={`rounded-lg border border-dashed border-${sec.accent}-200 bg-white/40 px-2.5 py-2 text-[11px] italic text-muted-foreground`}>
                          Chưa có card nào ở mục này
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {sec.items.map((h, idx) => (
                            <div key={h.id} className={`group/line relative flex items-start gap-2 rounded-lg bg-white/70 px-2.5 py-1.5 text-xs ring-1 ring-${sec.accent}-200/60 transition hover:ring-${sec.accent}-300`}>
                              <span className="mt-0.5 shrink-0 font-mono text-[10px] font-bold text-muted-foreground">{idx + 1}.</span>
                              {h.pinned && <span className="mt-0.5 shrink-0 text-amber-500">📌</span>}
                              <span className="line-clamp-2 flex-1 text-foreground/85">{h.content || <span className="italic text-muted-foreground">(note trống)</span>}</span>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); toggleLike(h.id, h.likedByMe); }}
                                className={`shrink-0 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold transition ${h.likedByMe ? "bg-rose-100 text-rose-600" : "text-muted-foreground hover:bg-rose-50 hover:text-rose-500"}`}
                                title={h.likedByMe ? "Bỏ tim" : "Thả tim"}
                              >
                                <span>{h.likedByMe ? "♥" : "♡"}</span>
                                {h.likes > 0 && <span>{h.likes}</span>}
                              </button>
                              <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 w-56 -translate-y-1/2 rounded-lg bg-gray-800 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover/line:opacity-100 break-words">
                                {h.content || "(note trống)"}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex gap-2">
                  {board && (
                    <button onClick={() => joinTeam(t.id, t.code, board.id)} disabled={isLoading} className="flex-1 cursor-pointer rounded-lg bg-foreground px-3 py-2 text-xs font-bold text-background hover:opacity-90 disabled:cursor-wait disabled:opacity-70">
                      {isMember ? "Mở board →" : "Tham gia team →"}
                    </button>
                  )}
                </div>
                {isLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-3xl bg-white/85 backdrop-blur-sm animate-fade-in">
                    <div className={`size-10 animate-spin rounded-full border-4 border-${t.color}-200 border-t-${t.color}-600`} />
                    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-foreground">
                      Đang mở board
                      <span className="inline-block size-1.5 animate-pulse rounded-full bg-foreground" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
          <form onSubmit={createTeam} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl border border-border bg-white p-7 shadow-2xl">
            <h2 className="font-display text-2xl font-bold">Tạo team mới ở {roomId}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Bạn sẽ là thành viên đầu tiên và board mới sẽ chờ bạn đó! ✨</p>
            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tên team</label>
                <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="VD: Team Phượng Hoàng" required
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mô tả <span className="font-normal normal-case text-muted-foreground/60">(không bắt buộc)</span></label>
                <input value={teamDesc} onChange={(e) => setTeamDesc(e.target.value)} placeholder="Team mình tập trung vào điều gì?"
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Màu của team</label>
                <div className="mt-2 flex gap-2">
                  {TEAM_COLORS.map((c) => (
                    <button type="button" key={c} onClick={() => setColor(c)}
                      className={`size-8 rounded-full bg-${c}-400 ring-offset-2 transition ${color === c ? "ring-2 ring-foreground" : ""}`} />
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">Huỷ</button>
              <button type="submit" disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand/20 disabled:opacity-50">
                {busy ? "Đang tạo…" : "Tạo team & mở board"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: "brand" | "emerald" | "amber" | "rose" }) {
  const accentClass: Record<string, string> = {
    brand: "border-brand/20 bg-brand/5 text-brand",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
  };
  return (
    <div className={`rounded-2xl border-2 px-4 py-3 ${accentClass[accent]}`}>
      <div className="text-[10px] font-bold uppercase tracking-widest opacity-80">{label}</div>
      <div className="font-display mt-1 text-3xl font-bold tabular-nums text-foreground">{value}</div>
    </div>
  );
}
