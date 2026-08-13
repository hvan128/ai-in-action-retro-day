import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { NOTE_COLORS, noteBg, TEMPLATES, type NoteColor, type TemplateKey } from "@/lib/utils";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download, Maximize2, Minimize2, Pencil, Pin, Plus, Trash2, Users, X } from "lucide-react";
import { exportCSV, exportMarkdown, exportPDF, type ExportNote } from "@/lib/board-export";
import { Linkify } from "@/lib/linkify";
import { UserAvatar } from "@/components/user-avatar";


interface Note {
  id: string;
  board_id: string;
  author_id: string;
  content: string;
  color: NoteColor;
  column_key: string;
  pos_x: number;
  pos_y: number;
  votes: number;
  stickers: string[];
  labels: string[];
  pinned: boolean;
}

const STICKERS = ["⭐", "🔥", "💡", "🚀", "❗", "✅", "❓", "🎯", "💎", "👀", "🐛", "🏆"];

interface BoardData {
  id: string;
  title: string;
  template: TemplateKey;
  team_id: string;
  teams: { name: string; color: string; room_id: string };
}

export const Route = createFileRoute("/_authenticated/board/$roomId/$teamId")({
  ssr: false,
  head: () => ({ meta: [{ title: "Bảng Retro — AI IN ACTION DAY15 - RETRO" }] }),
  beforeLoad: async ({ params }) => {
    // params.teamId is the team CODE (e.g. "001"), not the UUID.
    // Resolve the team within the room first, then load its board.
    const { data: team } = await supabase
      .from("teams")
      .select("id")
      .eq("room_id", params.roomId)
      .eq("code", params.teamId)
      .maybeSingle();
    if (!team) throw redirect({ to: "/rooms/$roomId", params: { roomId: params.roomId } });
    const { data: board, error } = await supabase
      .from("boards")
      .select("id, title, template, team_id, teams!inner(name, color, room_id)")
      .eq("team_id", team.id)
      .maybeSingle();
    if (error || !board) throw redirect({ to: "/rooms/$roomId", params: { roomId: params.roomId } });
    return { board: board as unknown as BoardData };
  },
  component: BoardPage,
});

const COLUMN_WIDTH = 306;
const COLUMN_GAP = 16;

function BoardPage() {
  const ctx = Route.useRouteContext() as unknown as { board: BoardData; user: { id: string; email?: string } };
  const board = ctx.board;
  const user = ctx.user;
  const isAdmin = user.email === "admin@gmail.com";
  const template = TEMPLATES[board.template as TemplateKey] ?? TEMPLATES["sprint_retrospective"];
  const [notes, setNotes] = useState<Note[]>([]);
  const [members, setMembers] = useState<{ user_id: string; display_name: string }[]>([]);
  const [likes, setLikes] = useState<{ note_id: string; user_id: string }[]>([]);
  const [authors, setAuthors] = useState<Record<string, string>>({});
  // note_likes has no board_id column, so its realtime stream can't be filtered
  // server-side — every like in the room arrives here. Keep the ids of this
  // board's notes to drop the foreign ones before they touch state.
  const boardNoteIdsRef = useRef<Set<string>>(new Set());
  // Realtime chưa lên được (thường vì chạm trần connection của Supabase khi
  // đông người vào cùng lúc). Khi đó chuyển sang refetch định kỳ.
  // Thêm ?slowsync vào URL để ép bật nhánh này mà kiểm tra — không có cách nào
  // khác để dựng lại tình huống chạm trần connection trước khi nó xảy ra thật.
  const forceSlowSync =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("slowsync");
  const [realtimeDown, setRealtimeDown] = useState(forceSlowSync);

  const refetchBoardContent = useCallback(async () => {
    const [notesRes, likesRes] = await Promise.all([
      supabase.from("notes").select("*").eq("board_id", board.id),
      supabase.from("note_likes").select("note_id, user_id, notes!inner(board_id)").eq("notes.board_id", board.id),
    ]);
    if (notesRes.data) {
      const rows = notesRes.data as Note[];
      boardNoteIdsRef.current = new Set(rows.map((n) => n.id));
      setNotes(rows);
    }
    if (likesRes.data) {
      setLikes((likesRes.data as { note_id: string; user_id: string }[]).map((l) => ({ note_id: l.note_id, user_id: l.user_id })));
    }
  }, [board.id]);
  // Presence
  const [presence, setPresence] = useState<Record<string, { display_name: string; editing_note_id: string | null }>>({});
  const presenceChRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // AI feature removed

  // activeMembers removed — replaced by presence-based onlineUsers below
  const onlineUsers = useMemo(
    () => Object.entries(presence).map(([uid, p]) => ({ user_id: uid, display_name: p.display_name })),
    [presence],
  );
  const editorByNote = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [uid, p] of Object.entries(presence)) {
      if (p.editing_note_id && uid !== user.id) map[p.editing_note_id] = p.display_name;
    }
    return map;
  }, [presence, user.id]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [scrollInfo, setScrollInfo] = useState({ left: false, right: false });

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => {
      const left = el.scrollLeft > 4;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
      setScrollInfo((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [board.id]);

  // Ensure membership first (idempotent), then load board data — RLS requires membership
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await supabase.from("team_members").upsert(
        { team_id: board.team_id, user_id: user.id },
        { onConflict: "team_id,user_id" },
      );
      if (cancelled) return;
      const [notesRes, membersRes, likesRes] = await Promise.all([
        supabase.from("notes").select("*").eq("board_id", board.id),
        supabase.from("team_members").select("user_id, profiles(display_name)").eq("team_id", board.team_id),
        supabase.from("note_likes").select("note_id, user_id, notes!inner(board_id)").eq("notes.board_id", board.id),
      ]);
      if (cancelled) return;
      if (notesRes.data) {
        boardNoteIdsRef.current = new Set((notesRes.data as Note[]).map((n) => n.id));
        setNotes(notesRes.data as Note[]);
      }
      if (membersRes.data) setMembers((membersRes.data as any[]).map((m) => ({ user_id: m.user_id, display_name: m.profiles?.display_name ?? "?" })));
      if (likesRes.data) setLikes((likesRes.data as any[]).map((l) => ({ note_id: l.note_id, user_id: l.user_id })));
    })();
    return () => { cancelled = true; };
  }, [board.id, board.team_id, user.id]);



  // Fetch display_name for every note author (covers users not in current team_members list)
  useEffect(() => {
    const missing = Array.from(new Set(notes.map((n) => n.author_id))).filter((id) => !authors[id]);
    if (missing.length === 0) return;
    supabase.from("profiles").select("id, display_name").in("id", missing).then(({ data }) => {
      if (!data) return;
      setAuthors((prev) => {
        const next = { ...prev };
        for (const p of data as { id: string; display_name: string }[]) next[p.id] = p.display_name;
        return next;
      });
    });
  }, [notes]);



  // Realtime
  useEffect(() => {
    const ch = supabase.channel(`board-${board.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notes", filter: `board_id=eq.${board.id}` },
        (payload) => {
          // This stream is filtered to board_id server-side, so every note here
          // belongs to this board. Update the id set synchronously: a like on a
          // brand-new note can arrive before React has re-rendered.
          if (payload.eventType === "INSERT") {
            boardNoteIdsRef.current.add((payload.new as Note).id);
            setNotes((prev) => prev.some((n) => n.id === (payload.new as Note).id) ? prev : [...prev, payload.new as Note]);
          } else if (payload.eventType === "UPDATE") {
            boardNoteIdsRef.current.add((payload.new as Note).id);
            setNotes((prev) => prev.map((n) => n.id === (payload.new as Note).id ? (payload.new as Note) : n));
          } else if (payload.eventType === "DELETE") {
            boardNoteIdsRef.current.delete((payload.old as Note).id);
            setNotes((prev) => prev.filter((n) => n.id !== (payload.old as Note).id));
            setLikes((prev) => prev.filter((l) => l.note_id !== (payload.old as Note).id));
          }
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "note_likes" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as { note_id: string; user_id: string };
            if (!boardNoteIdsRef.current.has(row.note_id)) return;
            setLikes((prev) => prev.some((l) => l.note_id === row.note_id && l.user_id === row.user_id) ? prev : [...prev, row]);
          } else if (payload.eventType === "DELETE") {
            const row = payload.old as { note_id: string; user_id: string };
            if (!boardNoteIdsRef.current.has(row.note_id)) return;
            setLikes((prev) => prev.filter((l) => !(l.note_id === row.note_id && l.user_id === row.user_id)));
          }
        })
      .subscribe((status) => {
        // CHANNEL_ERROR / TIMED_OUT gần như luôn là chạm trần connection.
        // Không báo lỗi ra UI, chỉ bật polling để board vẫn cập nhật.
        if (!forceSlowSync) setRealtimeDown(status !== "SUBSCRIBED");
      });
    return () => { supabase.removeChannel(ch); };
  }, [board.id, forceSlowSync]);

  // Fallback khi realtime không lên: refetch định kỳ, chỉ lúc tab đang hiện,
  // lệch pha ngẫu nhiên để hàng trăm máy không gọi dồn vào cùng một nhịp.
  // Dùng chuỗi setTimeout thay setInterval để request chậm không chồng lên nhau.
  useEffect(() => {
    if (!realtimeDown) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible") await refetchBoardContent();
      if (stopped) return;
      timer = setTimeout(tick, 7000 + Math.random() * 3000);
    };
    timer = setTimeout(tick, 1000 + Math.random() * 2000);
    const onVisible = () => { if (document.visibilityState === "visible") refetchBoardContent(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [realtimeDown, refetchBoardContent]);

  // Presence: who is online + who is editing which note
  useEffect(() => {
    const myName = authors[user.id] ?? members.find((m) => m.user_id === user.id)?.display_name ?? "Bạn";
    const ch = supabase.channel(`presence-board-${board.id}`, { config: { presence: { key: user.id } } });
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState() as Record<string, Array<{ display_name: string; editing_note_id: string | null }>>;
      const map: Record<string, { display_name: string; editing_note_id: string | null }> = {};
      for (const [uid, metas] of Object.entries(state)) {
        const last = metas[metas.length - 1];
        if (last) map[uid] = { display_name: last.display_name, editing_note_id: last.editing_note_id ?? null };
      }
      setPresence(map);
    }).subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ display_name: myName, editing_note_id: null });
      }
    });
    presenceChRef.current = ch;
    return () => {
      presenceChRef.current = null;
      supabase.removeChannel(ch);
    };
  }, [board.id, user.id, authors, members]);

  async function setEditingNote(noteId: string | null) {
    const ch = presenceChRef.current;
    if (!ch) return;
    const myName = authors[user.id] ?? members.find((m) => m.user_id === user.id)?.display_name ?? "Bạn";
    try { await ch.track({ display_name: myName, editing_note_id: noteId }); } catch {}
  }

  async function toggleLike(noteId: string) {
    const already = likes.some((l) => l.note_id === noteId && l.user_id === user.id);
    if (already) {
      setLikes((prev) => prev.filter((l) => !(l.note_id === noteId && l.user_id === user.id)));
      const { error } = await supabase.from("note_likes").delete().eq("note_id", noteId).eq("user_id", user.id);
      if (error) toast.error(error.message);
    } else {
      setLikes((prev) => [...prev, { note_id: noteId, user_id: user.id }]);
      const { error } = await supabase.from("note_likes").insert({ note_id: noteId, user_id: user.id });
      if (error) {
        setLikes((prev) => prev.filter((l) => !(l.note_id === noteId && l.user_id === user.id)));
        toast.error(error.message);
      }
    }
  }

  function columnRect(idx: number) {
    return { left: 40 + idx * (COLUMN_WIDTH + COLUMN_GAP), top: 0, width: COLUMN_WIDTH };
  }

  async function addNote(columnIdx: number, atPos?: { x: number; y: number }) {
    const col = template.columns[columnIdx];
    const rect = columnRect(columnIdx);
    const yOffset = 40 + notes.filter((n) => n.column_key === col.key).length * 32;
    const pos_x = atPos ? Math.max(rect.left + 8, atPos.x - 110) : rect.left + 20;
    const pos_y = atPos ? Math.max(rect.top + 8, atPos.y - 40) : rect.top + 80 + yOffset;
    const newNote = {
      board_id: board.id,
      author_id: user.id,
      content: "",
      color: "yellow" as NoteColor,
      column_key: col.key,
      pos_x,
      pos_y,
      votes: 0,
      stickers: [] as string[],
    };
    const { data, error } = await supabase.from("notes").insert(newNote).select().single();
    if (error) { toast.error(error.message); return; }
    setNotes((prev) => [...prev, data as Note]);
  }

  async function updateNote(id: string, patch: Partial<Note>) {
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, ...patch } : n));
    const { error } = await supabase.from("notes").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  }

  async function deleteNote(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    await supabase.from("notes").delete().eq("id", id);
  }

  return (
    <div className="relative h-[calc(100vh-64px)] overflow-hidden canvas-grid">

      {/* Canvas */}
      <div ref={canvasRef} className="relative h-full w-full overflow-auto">
        {/* Header bar — sticky */}
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-white/85 px-6 py-3 backdrop-blur">
          <div className="flex items-center gap-4">
            <Link to="/rooms/$roomId" params={{ roomId: board.teams.room_id }} className="text-sm text-muted-foreground hover:text-foreground">
              ← {board.teams.room_id}
            </Link>
            <div>
              <div className={`text-[10px] font-bold uppercase tracking-widest text-${board.teams.color}-600`}>{board.teams.name}</div>
              <div className="font-display text-lg font-bold leading-tight">{board.title}</div>
            </div>
            <div className="ml-3 rounded-full border border-border bg-muted px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {template.name}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ExportMenu
              getPayload={() => ({
                boardTitle: board.title,
                teamName: board.teams.name,
                template: board.template,
                notes: notes.map<ExportNote>((n) => ({
                  content: n.content,
                  color: n.color,
                  column_key: n.column_key,
                  votes: n.votes,
                  stickers: n.stickers ?? [],
                  author_name: authors[n.author_id] ?? members.find((m) => m.user_id === n.author_id)?.display_name ?? "Unknown",
                  like_count: likes.filter((l) => l.note_id === n.id).length,
                })),
              })}
            />
            {/* Realtime hỏng thì presence cũng hỏng (chung một WebSocket), nên
                pill xanh sẽ luôn hiện 0 người — đổi hẳn sang cảnh báo cho khỏi hiểu nhầm. */}
            {realtimeDown ? (
              <div
                className="flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200"
                title="Chưa kết nối được realtime — board đang tự làm mới vài giây một lần. Bài viết và tim của bạn vẫn được lưu bình thường."
              >
                <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
                Đồng bộ chậm
              </div>
            ) : (
              <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200" title="Đang online">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                <Users className="size-3" /> {onlineUsers.length}
              </div>
            )}
            <div className="flex -space-x-2">
              {onlineUsers.slice(0, 5).map((m) => (
                <div
                  key={m.user_id}
                  title={`${m.display_name}${m.user_id === user.id ? " (bạn)" : ""} • online`}
                  className="relative"
                >
                  <UserAvatar
                    seed={m.user_id}
                    name={m.display_name}
                    className={`size-8 border-2 shadow-sm ${m.user_id === user.id ? "border-brand" : "border-white"}`}
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-white bg-emerald-500" />
                </div>
              ))}
              {onlineUsers.length > 5 && (
                <div className="grid size-8 place-items-center rounded-full border-2 border-white bg-foreground text-[10px] font-bold text-background">
                  +{onlineUsers.length - 5}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="relative" style={{ width: 40 + template.columns.length * (COLUMN_WIDTH + COLUMN_GAP), minHeight: 1200, transform: `scale(${zoom})`, transformOrigin: "0 0" }}>
          {/* Sticky column headers */}
          <div className="sticky top-[56px] z-20 flex gap-4 px-10 pt-0">
            {template.columns.map((col, idx) => {
              const rect = columnRect(idx);
              const count = notes.filter((n) => n.column_key === col.key).length;
              return (
                <div key={`header-${col.key}`} style={{ width: rect.width }} className="shrink-0">
                  <div className={`rounded-t-3xl border-2 border-dashed border-${col.color}-200 bg-white/90 px-5 pt-5 pb-3 backdrop-blur-sm`}>
                    <div className="flex items-center justify-between">
                      <div className="group/title relative">
                        <h2 className={`font-display flex cursor-help items-center gap-2 text-xl font-bold`}>
                          <span>{col.emoji}</span>
                          <span>{col.title}</span>
                          <span className={`ml-1 inline-flex size-5 items-center justify-center rounded-full bg-${col.color}-100 text-[10px] font-bold text-${col.color}-700`}>?</span>
                        </h2>
                        <div className={`pointer-events-none absolute left-0 top-full z-40 mt-2 w-72 origin-top-left scale-95 rounded-2xl border border-${col.color}-200 bg-white p-3 opacity-0 shadow-xl transition-all group-hover/title:pointer-events-auto group-hover/title:scale-100 group-hover/title:opacity-100`}>
                          <div className={`text-[10px] font-bold uppercase tracking-widest text-${col.color}-700`}>Gợi ý để reflect</div>
                          <ul className="mt-2 space-y-1.5">
                            {col.prompts.map((p, i) => (
                              <li key={i} className="flex gap-1.5 text-xs leading-snug text-foreground/75">
                                <span className={`mt-0.5 text-${col.color}-500`}>•</span>
                                <span>{p}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      <span className={`rounded-full bg-${col.color}-100 px-2.5 py-0.5 text-xs font-bold text-${col.color}-700 border border-${col.color}-200`}>{count}</span>
                    </div>
                    <button onClick={() => addNote(idx)}
                      className={`mt-3 flex w-full items-center justify-center gap-1 rounded-xl border-2 border-dashed border-${col.color}-300 bg-white/60 py-2 text-xs font-semibold text-${col.color}-700 hover:bg-white cursor-pointer`}>
                      <Plus className="size-4" /> Thêm note
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Columns (backgrounds only for notes + right-click) */}
          {template.columns.map((col, idx) => {
            const rect = columnRect(idx);
            return (
              <div key={col.key} className="absolute"
                onContextMenu={(e) => {
                  e.preventDefault();
                  const parent = (e.currentTarget.parentElement as HTMLElement);
                  const pr = parent.getBoundingClientRect();
                  addNote(idx, { x: (e.clientX - pr.left) / zoom, y: (e.clientY - pr.top) / zoom });
                }}
                style={{ left: rect.left, top: rect.top, width: rect.width, minHeight: 1000 }}>
                <div className={`rounded-b-3xl border-2 border-t-0 border-dashed border-${col.color}-200 bg-${col.color}-50/20 p-5 min-h-[1000px]`} />
              </div>
            );
          })}

          {/* Notes */}
          {[...notes]
            .sort((a, b) => (b.pinned === a.pinned ? 0 : b.pinned ? 1 : -1))
            .map((n) => {
            const noteLikes = likes.filter((l) => l.note_id === n.id);
            const likerNames = noteLikes.map((l) => authors[l.user_id] ?? members.find((m) => m.user_id === l.user_id)?.display_name ?? "?");
            const col = template.columns.find((c) => c.key === n.column_key);
            return (
            <StickyNote key={n.id} note={n}
              isOwner={n.author_id === user.id}
              canDelete={n.author_id === user.id || isAdmin}
              likeCount={noteLikes.length}
              liked={noteLikes.some((l) => l.user_id === user.id)}
              likerNames={likerNames}
              onToggleLike={() => toggleLike(n.id)}
              onUpdate={(patch) => updateNote(n.id, patch)}
              onDelete={() => deleteNote(n.id)}
              onEditingChange={(isEditing) => setEditingNote(isEditing ? n.id : null)}
              editingByName={editorByNote[n.id]}
              placeholder={col?.placeholder ?? "Gõ suy nghĩ của bạn vào đây…"}
              columnKeys={template.columns.map((c) => c.key)}
              authorName={authors[n.author_id] ?? members.find((m) => m.user_id === n.author_id)?.display_name ?? "Unknown"} />

            );
          })}

        </div>
      </div>

      {/* Scroll fade indicators */}
      {scrollInfo.left && (
        <div className="pointer-events-none absolute left-0 top-[56px] bottom-0 z-20 w-10 bg-gradient-to-r from-white/90 to-transparent" />
      )}
      {scrollInfo.right && (
        <div className="pointer-events-none absolute right-0 top-[56px] bottom-0 z-20 w-10 bg-gradient-to-l from-white/90 to-transparent" />
      )}

      {/* Scroll arrow buttons */}
      {scrollInfo.left && (
        <button
          onClick={() => canvasRef.current?.scrollBy({ left: -400, behavior: "smooth" })}
          className="absolute left-3 top-1/2 z-30 -translate-y-1/2 grid size-10 place-items-center rounded-full bg-white shadow-lg border border-border text-muted-foreground hover:text-foreground hover:shadow-xl transition-all"
          aria-label="Scroll left"
        >
          <ChevronLeft className="size-5" />
        </button>
      )}
      {scrollInfo.right && (
        <button
          onClick={() => canvasRef.current?.scrollBy({ left: 400, behavior: "smooth" })}
          className="absolute right-3 top-1/2 z-30 -translate-y-1/2 grid size-10 place-items-center rounded-full bg-white shadow-lg border border-border text-muted-foreground hover:text-foreground hover:shadow-xl transition-all"
          aria-label="Scroll right"
        >
          <ChevronRight className="size-5" />
        </button>
      )}

      {/* Bottom controls */}
      <div className="absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-4 rounded-2xl bg-foreground/95 px-5 py-2.5 text-white shadow-2xl backdrop-blur">
        <button onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))} className="text-slate-400 hover:text-white">−</button>
        <span className="w-12 text-center text-xs font-bold">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))} className="text-slate-400 hover:text-white">+</button>
        <div className="h-4 w-px bg-white/15" />
        <div className="text-[10px] font-medium text-slate-400">Kéo note để di chuyển • Nhấp đúp để chỉnh sửa • Chuột phải vào cột để thêm note</div>
      </div>
    </div>
  );
}

function StickyNote({ note, isOwner, canDelete, onUpdate, onDelete, authorName, likeCount, liked, likerNames, onToggleLike, placeholder, onEditingChange, editingByName, columnKeys }:
  { note: Note; isOwner: boolean; canDelete?: boolean; onUpdate: (p: Partial<Note>) => void; onDelete: () => void; authorName: string; likeCount: number; liked: boolean; likerNames: string[]; onToggleLike: () => void; placeholder: string; onEditingChange?: (isEditing: boolean) => void; editingByName?: string; columnKeys: string[] }) {

  const [editing, setEditing] = useState(note.content === "");
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState(note.content);
  const [localPos, setLocalPos] = useState<{ x: number; y: number } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const dragOff = useRef({ x: 0, y: 0 });
  const dragging = localPos !== null;
  const rot = useMemo(() => ((note.id.charCodeAt(0) % 5) - 2) * 0.7, [note.id]);
  const stickers = note.stickers ?? [];

  useEffect(() => { setContent(note.content); }, [note.content]);

  // Broadcast editing state via presence (any editing surface counts)
  useEffect(() => {
    const isEditing = editing || expanded;
    onEditingChange?.(isEditing);
    return () => { if (isEditing) onEditingChange?.(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, expanded]);

  const isDirty = content !== note.content;

  // Auto-save mỗi 5s khi đang mở rộng và có thay đổi chưa lưu
  useEffect(() => {
    if (!expanded || !isDirty) return;
    const t = setInterval(() => { onUpdate({ content }); }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, isDirty, content]);

  function tryCloseExpanded() {
    if (isDirty) {
      const save = window.confirm(
        "Bạn có thay đổi chưa lưu.\n\nNhấn OK để LƯU rồi đóng.\nNhấn Cancel để HUỶ thay đổi và đóng."
      );
      if (save) onUpdate({ content });
      else setContent(note.content);
    }
    setExpanded(false);
  }

  function commitContent(next: string) {
    setContent(next);
    if (next !== note.content) onUpdate({ content: next });
  }

  function onPointerDown(e: React.PointerEvent) {
    if (editing || expanded) return;
    if ((e.target as HTMLElement).closest("button, textarea")) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    dragOff.current = { x: e.clientX - note.pos_x, y: e.clientY - note.pos_y };
    setLocalPos({ x: note.pos_x, y: note.pos_y });
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    setLocalPos({ x: Math.max(0, e.clientX - dragOff.current.x), y: Math.max(0, e.clientY - dragOff.current.y) });
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!dragging || !localPos) return;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    const finalPos = localPos;
    setLocalPos(null);
    if (finalPos.x !== note.pos_x || finalPos.y !== note.pos_y) {
      // Determine which column the note now belongs to based on its center x
      const centerX = finalPos.x + 110;
      const COL_W = COLUMN_WIDTH;
      const GAP = COLUMN_GAP;
      const LEFT = 40;
      let idx = Math.floor((centerX - LEFT) / (COL_W + GAP));
      if (idx < 0) idx = 0;
      if (idx > columnKeys.length - 1) idx = columnKeys.length - 1;
      const newColKey = columnKeys[idx];
      const patch: Partial<Note> = { pos_x: Math.round(finalPos.x), pos_y: Math.round(finalPos.y) };
      if (newColKey && newColKey !== note.column_key) patch.column_key = newColKey;
      onUpdate(patch);
    }
  }


  function addSticker(s: string) {
    onUpdate({ stickers: [...stickers, s] });
    setPickerOpen(false);
  }
  function removeSticker(idx: number) {
    const next = stickers.slice();
    next.splice(idx, 1);
    onUpdate({ stickers: next });
  }

  const x = localPos?.x ?? note.pos_x;
  const y = localPos?.y ?? note.pos_y;
  // Auto-expand width/height while typing inline for comfort
  const widthCls = editing ? "w-80" : "w-56";

  return (
    <>
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={() => setEditing(true)}
      className={`note-pop absolute flex ${widthCls} select-none flex-col rounded-md p-4 shadow-lg ring-1 transition-[width] duration-200 ${editingByName ? "ring-2 ring-brand/70 animate-pulse" : "ring-black/5"} ${noteBg[note.color]} ${dragging ? "z-20 cursor-grabbing scale-105" : "z-10 cursor-grab"} ${editing ? "z-20 shadow-2xl ring-2 ring-brand/40" : ""}`}
      style={{ left: x, top: y, transform: `rotate(${editing ? 0 : rot}deg)`, ["--rot" as any]: `${rot}deg` }}
    >
      {editingByName && (
        <div className="pointer-events-none absolute -top-3 left-2 z-30 inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-md ring-1 ring-brand-700"
          style={{ transform: `rotate(${-rot}deg)` }}>
          <Pencil className="size-2.5" /> {editingByName} đang sửa…
        </div>
      )}
      {stickers.length > 0 && (
        <div className="pointer-events-auto absolute -top-3 -right-2 flex flex-wrap-reverse justify-end gap-1 max-w-[12rem]">
          {stickers.map((s, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); removeSticker(i); }}
              title="Nhấp để gỡ"
              className="grid size-7 place-items-center rounded-full bg-white text-base shadow-md ring-1 ring-black/10 transition hover:scale-110"
              style={{ transform: `rotate(${((i * 37) % 20) - 10}deg)` }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {editing ? (
        <div className="relative">
          <textarea autoFocus value={content} onChange={(e) => setContent(e.target.value)}
            onBlur={() => { setEditing(false); if (content !== note.content) onUpdate({ content }); }}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setEditing(false); setContent(note.content); }
              else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { (e.currentTarget as HTMLTextAreaElement).blur(); }
            }}
            rows={8} placeholder={`${placeholder}\nDán link vào sẽ tự thành hyperlink…\n(Ctrl/Cmd+Enter để lưu • Esc để huỷ)`}
            className="w-full resize-none bg-transparent text-sm font-medium leading-snug outline-none placeholder:text-foreground/30 min-h-[160px]" />
          <button
            onMouseDown={(e) => { e.preventDefault(); }}
            onClick={(e) => { e.stopPropagation(); if (content !== note.content) onUpdate({ content }); setEditing(false); setExpanded(true); }}
            title="Mở rộng để viết thoải mái"
            className="absolute -top-1 -right-1 grid size-7 place-items-center rounded-full bg-white text-foreground/70 shadow-md ring-1 ring-black/10 transition hover:scale-110 hover:text-brand">
            <Maximize2 className="size-3.5" />
          </button>
        </div>
      ) : (
        <div className="min-h-[56px] whitespace-pre-wrap break-all text-sm font-medium leading-tight overflow-hidden">
          {note.content
            ? <Linkify text={note.content} />
            : <span className="text-foreground/30 italic">Note trống — nhấp đúp để viết nhé</span>}
        </div>
      )}
      {(note.labels?.length ?? 0) > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {note.labels.map((lbl, i) => (
            <button
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                if (!isOwner) return;
                const next = note.labels.filter((_, idx) => idx !== i);
                onUpdate({ labels: next });
              }}
              title={isOwner ? `Nhấp để gỡ "${lbl}"` : lbl}
              className="inline-flex items-center gap-1 rounded-full bg-foreground/85 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-background shadow-sm transition hover:bg-foreground"
            >
              🏷 {lbl}
            </button>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider">
        <span className="truncate text-foreground/55">{authorName}</span>
        <div className="relative flex items-center gap-0.5">
          <button onClick={(e) => { e.stopPropagation(); onUpdate({ pinned: !note.pinned }); }}
            className={`grid size-7 place-items-center rounded-full shadow-sm ring-1 ring-black/10 transition hover:scale-110 ${note.pinned ? "bg-amber-400 text-foreground" : "bg-white/70 text-foreground/60 hover:bg-white hover:text-amber-600"}`}
            title={note.pinned ? "Bỏ ghim card" : "Ghim card lên trang phòng"}>
            <Pin className={`size-3.5 ${note.pinned ? "fill-current" : ""}`} />
          </button>
          {isOwner && (
            <>
              <button onClick={(e) => { e.stopPropagation(); setColorOpen((v) => !v); }}
                className="grid size-7 place-items-center rounded-full bg-white/70 text-foreground/80 shadow-sm ring-1 ring-black/10 transition hover:bg-white hover:text-foreground hover:scale-110"
                title="Đổi màu">
                <div className={`size-3 rounded-full border border-black/20 ${noteBg[note.color]}`} />
              </button>
              {colorOpen && (
                <div onPointerDown={(e) => e.stopPropagation()}
                  className="absolute bottom-9 right-0 z-50 flex gap-1 rounded-xl border border-border bg-white p-2 shadow-2xl"
                  style={{ transform: `rotate(${-rot}deg)` }}>
                  {NOTE_COLORS.map((c) => (
                    <button key={c} onClick={(e) => { e.stopPropagation(); onUpdate({ color: c }); setColorOpen(false); }}
                      className={`size-6 rounded-md ${noteBg[c]} ring-offset-1 transition hover:scale-110 ${note.color === c ? "ring-2 ring-foreground" : ""}`}
                      title={c} />
                  ))}
                </div>
              )}
              <button onClick={(e) => { e.stopPropagation(); setEditing(true); }}
                className="grid size-7 place-items-center rounded-full bg-white/70 text-foreground/80 shadow-sm ring-1 ring-black/10 transition hover:bg-white hover:text-foreground hover:scale-110"
                title="Chỉnh sửa">
                <Pencil className="size-3.5" />
              </button>
            </>
          )}
          {(canDelete ?? isOwner) && (
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="grid size-7 place-items-center rounded-full bg-white/70 text-foreground/80 shadow-sm ring-1 ring-black/10 transition hover:bg-rose-50 hover:text-rose-600 hover:scale-110"
              title="Xoá">
              <Trash2 className="size-3.5" />
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); setPickerOpen((v) => !v); }}
            className="grid size-7 place-items-center rounded-full bg-white/70 text-base leading-none shadow-sm ring-1 ring-black/10 transition hover:bg-white hover:scale-110"
            title="Thêm sticker">
            <span>😀</span>
          </button>
          {pickerOpen && (
            <div onPointerDown={(e) => e.stopPropagation()}
              className="absolute bottom-9 right-0 z-50 w-[15rem] rounded-2xl border border-border bg-white p-2 shadow-2xl"
              style={{ transform: `rotate(${-rot}deg)` }}>
              <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Chọn sticker</div>
              <div className="grid grid-cols-6 gap-1">
                {STICKERS.map((s) => (
                  <button key={s} onClick={(e) => { e.stopPropagation(); addSticker(s); }}
                    className="grid size-8 place-items-center rounded-md text-xl transition hover:scale-125 hover:bg-muted">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="group/like relative">
            <button onClick={(e) => { e.stopPropagation(); onToggleLike(); }}
              className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold shadow-sm ring-1 transition hover:scale-105 ${liked ? "bg-rose-500 text-white ring-rose-600" : "bg-white/70 text-foreground/80 ring-black/10 hover:bg-white"}`}
              title={liked ? "Bỏ thích" : "Thích"}>
              <span className="text-sm leading-none">{liked ? "❤" : "🤍"}</span>
              <span className="leading-none">{likeCount}</span>
            </button>
            {likerNames.length > 0 && (
              <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 opacity-0 transition group-hover/like:pointer-events-auto group-hover/like:opacity-100"
                style={{ transform: `translateX(-50%)` }}>
                <div className="rounded-xl border border-border bg-white px-3 py-2 shadow-xl"
                  style={{ transform: `rotate(${-rot}deg)` }}>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <span className="text-rose-500">❤</span>
                    <span className="max-w-[16rem] whitespace-normal break-words leading-snug">{likerNames.join(", ")}</span>
                  </div>
                  <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* Full-screen modal editor */}
    {expanded && (
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-foreground/50 p-4 backdrop-blur-sm"
        onPointerDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) { tryCloseExpanded(); } }}
      >
        <div
          className={`relative flex w-full max-w-3xl flex-col rounded-2xl ${noteBg[note.color]} p-6 shadow-2xl ring-1 ring-black/10`}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-foreground/60">
              <Pencil className="size-3.5" /> Đang viết note · <span className="text-foreground/80">{authorName}</span>
              {isDirty && <span className="ml-1 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] text-amber-900">● chưa lưu (tự lưu mỗi 5s)</span>}
              {!isDirty && expanded && <span className="ml-1 text-[10px] text-foreground/40">đã lưu</span>}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => { if (isDirty) onUpdate({ content }); setExpanded(false); }}
                className="rounded-full bg-foreground px-3 py-1.5 text-xs font-bold text-background shadow-sm hover:opacity-90"
                title="Lưu (Ctrl/Cmd+Enter)">Lưu</button>
              <button
                onClick={() => tryCloseExpanded()}
                className="grid size-8 place-items-center rounded-full bg-white/70 text-foreground/70 ring-1 ring-black/10 hover:bg-white"
                title="Đóng (Esc)"><X className="size-4" /></button>
              <button
                onClick={(e) => { e.stopPropagation(); if (isDirty) onUpdate({ content }); setExpanded(false); setEditing(true); }}
                className="grid size-8 place-items-center rounded-full bg-white/70 text-foreground/70 ring-1 ring-black/10 hover:bg-white"
                title="Thu gọn về card"><Minimize2 className="size-4" /></button>
            </div>
          </div>
          <textarea
            autoFocus
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.preventDefault(); tryCloseExpanded(); }
              else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { if (isDirty) onUpdate({ content }); setExpanded(false); }
            }}
            placeholder={`${placeholder}\n\n(Ctrl/Cmd+Enter để lưu • Esc để đóng)`}
            className="min-h-[55vh] w-full resize-none rounded-xl bg-white/40 p-4 text-base font-medium leading-relaxed outline-none ring-1 ring-black/5 placeholder:text-foreground/30 focus:bg-white/70"
          />
          {isOwner && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/50">Màu</span>
              {NOTE_COLORS.map((c) => (
                <button key={c} onClick={() => onUpdate({ color: c })}
                  className={`size-6 rounded-md ${noteBg[c]} ring-offset-1 transition hover:scale-110 ${note.color === c ? "ring-2 ring-foreground" : "ring-1 ring-black/10"}`}
                  title={c} />
              ))}
              <div className="mx-2 h-4 w-px bg-foreground/10" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/50">Sticker</span>
              {STICKERS.map((s) => (
                <button key={s} onClick={() => onUpdate({ stickers: [...stickers, s] })}
                  className="grid size-7 place-items-center rounded-md text-lg transition hover:scale-125 hover:bg-white/60"
                  title="Thêm sticker">{s}</button>
              ))}
            </div>
          )}
          <div className="mt-2 text-right text-[11px] text-foreground/50">{content.length} ký tự</div>
        </div>
      </div>
    )}
    </>
  );
}

function ExportMenu({ getPayload }: { getPayload: () => Parameters<typeof exportMarkdown>[0] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  function run(fn: (p: Parameters<typeof exportMarkdown>[0]) => void) {
    try {
      fn(getPayload());
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Xuất file lỗi rồi 😢");
    }
  }
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold hover:bg-muted"
        title="Xuất board"
      >
        <Download className="size-3.5" /> Xuất file
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-44 overflow-hidden rounded-xl border border-border bg-white shadow-xl">
          <button onClick={() => run(exportMarkdown)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted">
            Markdown <span className="text-[10px] text-muted-foreground">.md</span>
          </button>
          <button onClick={() => run(exportCSV)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted">
            CSV <span className="text-[10px] text-muted-foreground">.csv</span>
          </button>
          <button onClick={() => run(exportPDF)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted">
            PDF <span className="text-[10px] text-muted-foreground">.pdf</span>
          </button>
        </div>
      )}
    </div>
  );
}
