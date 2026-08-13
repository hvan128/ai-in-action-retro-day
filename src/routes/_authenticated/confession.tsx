import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Send, Clock } from "lucide-react";
import { Linkify } from "@/lib/linkify";

export const Route = createFileRoute("/_authenticated/confession")({
  ssr: false,
  head: () => ({ meta: [{ title: "Confession — AI IN ACTION DAY15 - RETRO" }] }),
  component: ConfessionPage,
});

const MAX = 2000;

function ConfessionPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  // Quyền cột trên bảng confessions không cho authenticated đọc author_id và
  // status, nên chỉ chọn đúng những cột được phép — select("*") sẽ lỗi 403.
  const { data: posts, isLoading } = useQuery({
    queryKey: ["confessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("confessions")
        .select("id, content, number, created_at")
        .order("number", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

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
      qc.invalidateQueries({ queryKey: ["confessions"] });
    } catch (err: any) {
      toast.error(err.message ?? "Không gửi được, thử lại nhé");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="canvas-grid min-h-[calc(100vh-4rem)]">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="font-display text-3xl font-bold text-foreground">Confession</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Gửi ẩn danh — không ai trong lớp biết bài nào của ai. Bài được duyệt trước khi hiện lên.
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
            <span className="text-xs text-muted-foreground">
              {text.length}/{MAX}
            </span>
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
          {posts?.map((p: any) => (
            <article key={p.id} className="rounded-xl border border-border bg-card p-4">
              <div className="font-display text-sm font-bold text-brand">#{p.number}</div>
              <div className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground/90">
                <Linkify text={p.content} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
