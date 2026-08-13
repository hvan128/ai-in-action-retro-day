import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";


export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "AI IN ACTION DAY15 - RETRO — Retro vui như đi chơi" },
      { name: "description", content: "Bảng retrospective dễ thương cho team học viên. Kéo & thả sticky note tự do trên canvas vô tận." },
    ],
  }),
  component: Landing,
});

interface Room {
  id: string;
  name: string;
  description: string | null;
  teams?: { id: string }[] | null;
}

/* ─────────── Demo sticky-note canvas ─────────── */
interface DemoNote {
  id: number;
  column: number;
  x: number;
  y: number;
  text: string;
  color: string;
  rotate: number;
}

const COLS = [
  { title: "Tuyệt vời 🌟", color: "bg-yellow-200" },
  { title: "Cần cải thiện 🛠️", color: "bg-rose-200" },
  { title: "Hành động tiếp theo 🚀", color: "bg-sky-200" },
];

const NOTE_COLORS = ["bg-yellow-200", "bg-lime-200", "bg-rose-200", "bg-sky-200", "bg-purple-200"];

const INITIAL_NOTES: DemoNote[] = [
  { id: 1, column: 0, x: 20, y: 30, text: "Mentor rất nhiệt tình 🔥", color: "bg-yellow-200", rotate: -2 },
  { id: 2, column: 0, x: 160, y: 90, text: "Team giúp nhau chu đáo 💚", color: "bg-lime-200", rotate: 1 },
  { id: 3, column: 1, x: 30, y: 60, text: "Cần thêm thời gian thực hành ⏱️", color: "bg-rose-200", rotate: 2 },
  { id: 4, column: 1, x: 150, y: 20, text: "WiFi lúc nhanh lúc chậm 📶", color: "bg-purple-200", rotate: -1 },
  { id: 5, column: 2, x: 40, y: 40, text: "Làm thêm bài tập nhóm cuối tuần 📚", color: "bg-sky-200", rotate: 0 },
  { id: 6, column: 2, x: 170, y: 100, text: "Tạo checklist trước buổi học ✅", color: "bg-yellow-200", rotate: -2 },
];

function DemoCanvas() {
  const [notes, setNotes] = useState<DemoNote[]>(INITIAL_NOTES);
  const dragRef = useRef<{ id: number | null; offsetX: number; offsetY: number; colW: number }>({ id: null, offsetX: 0, offsetY: 0, colW: 300 });

  function onPointerDown(e: React.PointerEvent, id: number) {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const parent = el.offsetParent?.getBoundingClientRect();
    const colW = parent ? parent.width / 3 : 300;
    dragRef.current = { id, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top, colW };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    el.style.zIndex = "50";
    el.style.transform = "scale(1.05)";
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (d.id == null) return;
    const parent = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const colW = parent.width / 3;
    const x = e.clientX - parent.left - d.offsetX;
    const y = e.clientY - parent.top - d.offsetY;
    const newCol = Math.min(2, Math.max(0, Math.floor((e.clientX - parent.left) / colW)));
    setNotes((prev) => prev.map((n) => (n.id === d.id ? { ...n, x: Math.max(0, x), y: Math.max(0, y), column: newCol } : n)));
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = dragRef.current;
    if (d.id == null) return;
    setNotes((prev) => prev.map((n) => (n.id === d.id ? { ...n, rotate: Math.floor(Math.random() * 6 - 3) } : n)));
    dragRef.current.id = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    (e.currentTarget as HTMLElement).style.zIndex = "";
    (e.currentTarget as HTMLElement).style.transform = "";
  }

  return (
    <div className="mx-auto mt-16 max-w-6xl rounded-3xl border border-border bg-white p-6 shadow-xl">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-xl font-bold">Demo bảng Retro</h3>
        <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">Kéo & thả sticky note tự do</span>
      </div>
      <div className="grid grid-cols-1 gap-4 rounded-2xl md:grid-cols-3" onPointerMove={onPointerMove}>
        {COLS.map((col, ci) => (
          <div key={ci} className={`relative h-80 rounded-2xl border-2 border-dashed border-border ${col.color} overflow-hidden`} onPointerUp={onPointerUp}>
            <div className="absolute inset-x-0 top-0 border-b border-black/10 bg-white/60 px-4 py-2 text-center text-sm font-bold tracking-wide backdrop-blur-sm">
              {col.title}
            </div>
            {notes
              .filter((n) => n.column === ci)
              .map((n) => (
                <div
                  key={n.id}
                  className={`absolute w-36 cursor-grab select-none rounded-lg p-3 text-sm font-medium shadow-md transition-shadow active:cursor-grabbing ${n.color}`}
                  style={{ left: n.x, top: n.y + 48, transform: `rotate(${n.rotate}deg)` }}
                  onPointerDown={(e) => onPointerDown(e, n.id)}
                >
                  {n.text}
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Landing() {
  const navigate = useNavigate();
  const [authOpen, setAuthOpen] = useState<null | "signin" | "signup">(null);
  const [pendingRoomId, setPendingRoomId] = useState<string | null>(null);
  const [loadingRoomId, setLoadingRoomId] = useState<string | null>(null);

  const { data: rooms } = useQuery<Room[]>({
    queryKey: ["public-rooms"],
    queryFn: async () => {
      // Trang này công khai, nhưng bảng teams không cấp quyền cho role anon —
      // embed teams(id) làm hỏng cả query với khách chưa đăng nhập, khiến trang
      // chủ không hiện phòng nào. Thử kèm số team trước; hỏng thì lấy danh sách
      // trơn để phòng vẫn hiện ra và bấm vào được.
      const withCounts = await supabase
        .from("rooms")
        .select("id, name, description, teams(id)")
        .order("id");
      if (!withCounts.error) return (withCounts.data ?? []) as Room[];

      const { data, error } = await supabase
        .from("rooms")
        .select("id, name, description")
        .order("id");
      if (error) throw error;
      return (data ?? []) as Room[];
    },
  });


  async function handleRoomClick(roomId: string) {
    setLoadingRoomId(roomId);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      navigate({ to: "/rooms/$roomId", params: { roomId } });
    } else {
      setPendingRoomId(roomId);
      setAuthOpen("signin");
      setLoadingRoomId(null);
    }
  }

  function closeAuth() {
    setAuthOpen(null);
    setPendingRoomId(null);
  }

  return (
    <div className="min-h-screen bg-canvas canvas-grid">
      <nav className="fixed top-0 z-40 flex h-16 w-full items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-lg bg-brand">
            <div className="size-4 rounded-sm border-2 border-white" />
          </div>
          <span className="font-display text-xl font-bold tracking-tight">AI IN ACTION DAY15 - RETRO</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setAuthOpen("signin")} className="text-sm font-medium text-muted-foreground hover:text-foreground">Đăng nhập</button>
          <button onClick={() => setAuthOpen("signup")} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
            Bắt đầu ngay
          </button>
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-7xl px-6 pt-24 pb-16">
        <div className="text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="size-2 animate-pulse rounded-full bg-emerald-500" /> Đang phục vụ 500+ bạn học viên
          </div>
          <h1 className="font-display text-balance text-5xl font-bold leading-tight tracking-tight md:text-6xl">
            Retro giai đoạn 1 <span className="text-brand">🎉</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-balance text-base text-muted-foreground md:text-lg">
            Chọn lớp học hôm nay để bắt đầu retro của riêng team bạn — nhanh xíu, đăng nhập là vào liền!
          </p>
        </div>

        {/* 3 lớp học */}
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {(rooms ?? []).map((room) => {
            const isLoading = loadingRoomId === room.id;
            return (
              <button
                key={room.id}
                onClick={() => handleRoomClick(room.id)}
                disabled={isLoading}
                className="group relative cursor-pointer overflow-hidden rounded-3xl border border-border bg-white p-7 text-left transition-all hover:-translate-y-1 hover:border-brand hover:shadow-2xl hover:shadow-brand/10 disabled:cursor-wait disabled:opacity-80"
              >
                {isLoading && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
                    <div className="relative">
                      <div className="size-12 animate-spin rounded-full border-4 border-brand/20 border-t-brand" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="size-3 animate-pulse rounded-full bg-brand" />
                      </div>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-brand animate-pulse">Đang mở phòng…</p>
                  </div>
                )}
                <div className="mt-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">Phòng</div>
                <div className="font-display mt-2 text-4xl font-bold text-foreground group-hover:text-brand transition-colors">{room.name}</div>
                <div className="mt-12 flex items-center justify-between">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Đang mở</span>
                  {/* Khách chưa đăng nhập không đọc được teams — ẩn hẳn nhãn
                      thay vì hiện "0 team" sai sự thật. */}
                  {room.teams && <span className="text-xs text-muted-foreground">{room.teams.length} team</span>}
                </div>
              </button>
            );
          })}
        </div>

        {/* Demo canvas */}
        <DemoCanvas />
      </main>

      {authOpen && <AuthModal mode={authOpen} setMode={setAuthOpen} onClose={closeAuth} pendingRoomId={pendingRoomId} />}
    </div>
  );
}

function AuthModal({ mode, setMode, onClose, pendingRoomId }: { mode: "signin" | "signup"; setMode: (m: "signin" | "signup") => void; onClose: () => void; pendingRoomId: string | null }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [needsName, setNeedsName] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => { setNeedsName(false); }, [email, mode]);

  function isMissingAccount(msg: string) {
    const m = msg.toLowerCase();
    return m.includes("invalid login credentials") || m.includes("invalid_credentials") || m.includes("user not found") || m.includes("email not confirmed") === false && m.includes("invalid");
  }

  async function trySignIn() {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error;
  }
  async function trySignUp() {
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        data: { display_name: displayName || email.split("@")[0] },
        emailRedirectTo: window.location.origin,
      },
    });
    return error;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const err = await trySignUp();
        if (err) {
          if (err.message?.toLowerCase().includes("already") || err.message?.toLowerCase().includes("registered")) {
            const signInErr = await trySignIn();
            if (signInErr) throw signInErr;
            toast.success("Email đã có sẵn — đã đăng nhập giúp bạn luôn! 👋");
          } else {
            throw err;
          }
        } else {
          toast.success("Tạo tài khoản thành công — chào mừng bạn nhé! 🎉");
        }
      } else {
        const err = await trySignIn();
        if (err) {
          if (isMissingAccount(err.message)) {
            if (!needsName) {
              setNeedsName(true);
              toast.message("Chưa có tài khoản với email này — mình sẽ tạo mới giúp bạn nhé! ✨", {
                description: "Nhập tên hiển thị rồi bấm Tạo tài khoản.",
              });
              return;
            }
            const upErr = await trySignUp();
            if (upErr) throw upErr;
            toast.success("Tạo tài khoản xong — chào mừng bạn! 🎉");
          } else {
            throw err;
          }
        } else {
          toast.success("Chào mừng quay lại! 👋");
        }
      }
      try { localStorage.setItem("retro_login_at", String(Date.now())); } catch {}
      if (pendingRoomId) {
        navigate({ to: "/rooms/$roomId", params: { roomId: pendingRoomId } });
      } else {
        navigate({ to: "/rooms" });
      }
    } catch (err: any) {
      toast.error(err.message ?? "Có gì đó không ổn rồi 😢");
    } finally {
      setLoading(false);
    }
  }

  const showNameField = mode === "signup" || needsName;
  const primaryLabel = loading
    ? "Chờ xíu nhé…"
    : mode === "signup" || needsName
      ? "Tạo tài khoản"
      : "Đăng nhập / Tạo tài khoản";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl border border-border bg-white p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight">
              {mode === "signin" ? "Chào mừng quay lại 👋" : "Tham gia retro nào 🚀"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "signin"
                ? "Nhập email & mật khẩu — mình tự nhận diện và đăng nhập, chưa có thì tạo luôn nhé."
                : "Nhập email & mật khẩu để bắt đầu trong 10 giây."}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted" aria-label="Đóng">✕</button>
        </div>


        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          {showNameField && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tên hiển thị</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="VD: Minh Anh"
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand" />
              {needsName && mode === "signin" && (
                <p className="mt-1 text-xs text-brand">Tài khoản chưa tồn tại — đặt tên rồi tạo mới nha!</p>
              )}
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
            {primaryLabel}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signin" ? (
            <>Muốn tạo tài khoản ngay từ đầu?{" "}
              <button onClick={() => setMode("signup")} className="font-semibold text-brand hover:underline">Đăng ký mới</button>
            </>
          ) : (
            <>Đã có tài khoản rồi?{" "}
              <button onClick={() => setMode("signin")} className="font-semibold text-brand hover:underline">Đăng nhập ngay</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}