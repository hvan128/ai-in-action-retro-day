import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Send, Clock, MessageCircle, Trash2 } from "lucide-react";
import { Linkify } from "@/lib/linkify";

export const Route = createFileRoute("/_authenticated/confession")({
  ssr: false,
  head: () => ({ meta: [{ title: "Confession — AI IN ACTION DAY15 - RETRO" }] }),
  component: ConfessionPage,
});

const MAX = 2000;
const MAX_COMMENT = 500;
const EMOJIS = ["❤️", "😂", "😮", "😢", "👏"] as const;

function ConfessionPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [openComments, setOpenComments] = useState<string | null>(null);

  // Bảng confessions không nằm trong publication realtime (xem migration), nên
  // bài mới duyệt về bằng cách hỏi lại định kỳ. Cảm xúc và bình luận thì có
  // realtime thật, xử lý ở useEffect bên dưới.
  const { data: posts, isLoading } = useQuery({
    queryKey: ["confessions"],
    queryFn: async () => {
      // Quyền cột không cho đọc author_id và status — select("*") sẽ lỗi 403.
      const { data, error } = await supabase
        .from("confessions")
        .select("id, content, number, created_at")
        .order("number", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15000,
  });

  const { data: reactions } = useQuery({
    queryKey: ["confession-reactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("confession_reactions")
        .select("confession_id, user_id, emoji");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: comments } = useQuery({
    queryKey: ["confession-comments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("confession_comments")
        .select("id, confession_id, author_id, content, created_at")
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Tên người bình luận: bài thì ẩn danh, bình luận thì hiện tên.
  const { data: names } = useQuery({
    queryKey: ["confession-commenter-names", (comments ?? []).length],
    enabled: (comments?.length ?? 0) > 0,
    queryFn: async () => {
      const ids = [...new Set((comments ?? []).map((c: any) => c.author_id))];
      const { data } = await supabase.from("profiles").select("id, display_name").in("id", ids);
      return new Map((data ?? []).map((p: any) => [p.id, p.display_name]));
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("confession-activity")
      .on("postgres_changes", { event: "*", schema: "public", table: "confession_reactions" }, () => {
        qc.invalidateQueries({ queryKey: ["confession-reactions"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "confession_comments" }, () => {
        qc.invalidateQueries({ queryKey: ["confession-comments"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const byPost = useMemo(() => {
    const r = new Map<string, { counts: Record<string, number>; mine: string | null }>();
    for (const x of reactions ?? []) {
      let e = r.get(x.confession_id);
      if (!e) {
        e = { counts: {}, mine: null };
        r.set(x.confession_id, e);
      }
      e.counts[x.emoji] = (e.counts[x.emoji] ?? 0) + 1;
      if (x.user_id === user.id) e.mine = x.emoji;
    }
    return r;
  }, [reactions, user.id]);

  const commentsByPost = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const c of comments ?? []) {
      if (!m.has(c.confession_id)) m.set(c.confession_id, []);
      m.get(c.confession_id)!.push(c);
    }
    return m;
  }, [comments]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setSending(true);
    try {
      const { error } = await supabase.from("confessions").insert({ content, author_id: user.id });
      if (error) throw error;
      setText("");
      toast.success("Đã gửi! Bài sẽ hiện lên sau khi được duyệt.");
    } catch (err: any) {
      toast.error(err.message ?? "Không gửi được, thử lại nhé");
    } finally {
      setSending(false);
    }
  }

  async function react(confessionId: string, emoji: string) {
    const current = byPost.get(confessionId)?.mine ?? null;
    try {
      if (current === emoji) {
        await supabase.from("confession_reactions").delete()
          .eq("confession_id", confessionId).eq("user_id", user.id);
      } else if (current) {
        await supabase.from("confession_reactions").update({ emoji })
          .eq("confession_id", confessionId).eq("user_id", user.id);
      } else {
        await supabase.from("confession_reactions")
          .insert({ confession_id: confessionId, user_id: user.id, emoji });
      }
      qc.invalidateQueries({ queryKey: ["confession-reactions"] });
    } catch (err: any) {
      toast.error(err.message ?? "Không thả được cảm xúc");
    }
  }

  return (
    <main className="canvas-grid min-h-[calc(100vh-4rem)]">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="font-display text-3xl font-bold text-foreground">Confession</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Bài gửi <strong>ẩn danh</strong> và được duyệt trước khi hiện. Nhưng{" "}
          <strong>bình luận thì hiện tên bạn</strong> — cân nhắc trước khi gõ.
        </p>

        <form onSubmit={submit} className="mt-6 rounded-xl border border-border bg-card p-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX))}
            rows={5}
            placeholder="Điều bạn muốn nói mà chưa tiện nói trực tiếp…"
            className="w-full resize-y bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">{text.length}/{MAX}</span>
            <button
              type="submit"
              disabled={sending || !text.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand/20 hover:opacity-90 disabled:opacity-50"
            >
              <Send className="size-4" />
              {sending ? "Đang gửi…" : "Gửi ẩn danh"}
            </button>
          </div>
        </form>

        <div className="mt-8 space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Đang tải…</p>}
          {!isLoading && (posts?.length ?? 0) === 0 && (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <Clock className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-2 text-sm font-semibold text-foreground">Chưa có bài nào được duyệt</p>
              <p className="mt-1 text-xs text-muted-foreground">Gửi bài đầu tiên đi, ai mà biết được.</p>
            </div>
          )}

          {posts?.map((p: any) => {
            const r = byPost.get(p.id);
            const cs = commentsByPost.get(p.id) ?? [];
            const isOpen = openComments === p.id;
            return (
              <article key={p.id} className="rounded-xl border border-border bg-card p-4">
                <div className="font-display text-sm font-bold text-brand">#{p.number}</div>
                <div className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground/90">
                  <Linkify text={p.content} />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
                  {EMOJIS.map((e) => {
                    const n = r?.counts[e] ?? 0;
                    const mine = r?.mine === e;
                    return (
                      <button
                        key={e}
                        onClick={() => react(p.id, e)}
                        className={`rounded-full border px-2 py-0.5 text-sm transition ${
                          mine ? "border-brand bg-brand/10 font-semibold" : "border-border hover:bg-muted"
                        }`}
                        title={mine ? "Bấm lại để bỏ" : "Thả cảm xúc"}
                      >
                        {e}
                        {n > 0 && <span className="ml-1 text-xs">{n}</span>}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setOpenComments(isOpen ? null : p.id)}
                    className="ml-auto inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold hover:bg-muted"
                  >
                    <MessageCircle className="size-3.5" />
                    {cs.length > 0 ? cs.length : "Bình luận"}
                  </button>
                </div>

                {isOpen && (
                  <CommentBox
                    confessionId={p.id}
                    comments={cs}
                    names={names}
                    userId={user.id}
                    onChanged={() => qc.invalidateQueries({ queryKey: ["confession-comments"] })}
                  />
                )}
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}

function CommentBox({
  confessionId,
  comments,
  names,
  userId,
  onChanged,
}: {
  confessionId: string;
  comments: any[];
  names: Map<string, string> | undefined;
  userId: string;
  onChanged: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("confession_comments")
        .insert({ confession_id: confessionId, author_id: userId, content });
      if (error) throw error;
      setText("");
      onChanged();
    } catch (err: any) {
      toast.error(err.message ?? "Không gửi được bình luận");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      const { error } = await supabase.from("confession_comments").delete().eq("id", id);
      if (error) throw error;
      onChanged();
    } catch (err: any) {
      toast.error(err.message ?? "Không xoá được");
    }
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      {comments.map((c) => (
        <div key={c.id} className="mb-2 flex items-start gap-2 text-sm">
          <span className="shrink-0 font-semibold text-foreground">
            {names?.get(c.author_id) ?? "?"}
          </span>
          <span className="min-w-0 flex-1 break-words text-foreground/80">
            <Linkify text={c.content} />
          </span>
          {c.author_id === userId && (
            <button
              onClick={() => remove(c.id)}
              className="shrink-0 text-muted-foreground hover:text-red-500"
              title="Xoá bình luận của mình"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      ))}

      <form onSubmit={send} className="mt-2 flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_COMMENT))}
          placeholder="Bình luận công khai tên bạn…"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Gửi
        </button>
      </form>
    </div>
  );
}
