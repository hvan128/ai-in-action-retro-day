import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { takePendingJoin } from "@/lib/pending-join";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Đăng nhập — AI IN ACTION DAY15 - RETRO" }] }),
  component: AuthPage,
});

function AuthPage() {
  const { mode: initial } = useSearch({ from: "/auth" });
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">(initial ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: {
            data: { display_name: displayName || email.split("@")[0] },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        if (!data.session) {
          const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
          if (signInErr) throw signInErr;
        }
        toast.success("Tạo tài khoản thành công — chào mừng bạn nhé! 🎉");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Chào mừng quay lại! 👋");
      }
      // Quét QR lúc chưa đăng nhập thì đưa thẳng về nhóm đã định, đừng thả về
      // danh sách phòng bắt học viên tự mò lại.
      const pending = takePendingJoin();
      if (pending) navigate({ to: "/j/$code", params: { code: pending } });
      else navigate({ to: "/rooms" });
    } catch (err: any) {
      toast.error(err.message ?? "Có gì đó không ổn rồi 😢");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas canvas-grid">
      <nav className="flex h-16 items-center px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-lg bg-brand"><div className="size-4 rounded-sm border-2 border-white" /></div>
          <span className="font-display text-xl font-bold">AI IN ACTION DAY15 - RETRO</span>
        </Link>
      </nav>

      <main className="mx-auto flex max-w-md flex-col px-6 pt-12">
        <div className="rounded-3xl border border-border bg-white p-8 shadow-xl shadow-brand/5">
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {mode === "signin" ? "Chào mừng quay lại 👋" : "Tạo tài khoản mới 🚀"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "signin" ? "Đăng nhập để tham gia buổi retro của team nhé." : "Chỉ cần email và mật khẩu là bắt đầu được rồi!"}
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tên hiển thị</label>
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="VD: Minh Anh"
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand" />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ban@gmail.com"
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mật khẩu</label>
              <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Tối thiểu 6 ký tự"
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand/20 hover:opacity-90 disabled:opacity-50">
              {loading ? "Chờ xíu nhé…" : mode === "signin" ? "Đăng nhập" : "Tạo tài khoản"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" ? (
              <>Lần đầu ghé chơi?{" "}
                <button onClick={() => setMode("signup")} className="font-semibold text-brand hover:underline">Tạo tài khoản mới</button>
              </>
            ) : (
              <>Đã có tài khoản rồi?{" "}
                <button onClick={() => setMode("signin")} className="font-semibold text-brand hover:underline">Đăng nhập ngay</button>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
