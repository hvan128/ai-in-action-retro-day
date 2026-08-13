import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChevronDown, ChevronsLeft, ChevronsRight, Users, LayoutGrid, Check, Shield, MessageCircleHeart } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

type Room = { id: string; name: string; description: string | null };
type Team = { id: string; code: string; name: string; color: string; boards: { id: string }[] };

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isNavigating = useRouterState({ select: (s) => s.isLoading || s.isTransitioning });

  const [displayName, setDisplayName] = useState<string>("");
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar:collapsed") === "1";
  });
  const [roomOpen, setRoomOpen] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("sidebar:roomId");
  });

  // Sync selected room from URL when on /rooms/:roomId
  const urlRoomId = useMemo(() => {
    const m = pathname.match(/^\/rooms\/([^/]+)/);
    return m ? m[1] : null;
  }, [pathname]);

  useEffect(() => {
    if (urlRoomId && urlRoomId !== selectedRoomId) {
      setSelectedRoomId(urlRoomId);
      localStorage.setItem("sidebar:roomId", urlRoomId);
    }
  }, [urlRoomId]);

  useEffect(() => {
    localStorage.setItem("sidebar:collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data) setDisplayName(data.display_name);
    });
  }, [user.id]);

  useEffect(() => {
    supabase.from("rooms").select("id, name, description").order("id").then(({ data }) => {
      if (data) {
        setRooms(data);
        if (!selectedRoomId && data.length) {
          setSelectedRoomId(data[0].id);
          localStorage.setItem("sidebar:roomId", data[0].id);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (!selectedRoomId) {
      setTeams([]);
      return;
    }
    supabase
      .from("teams")
      .select("id, code, name, color, boards(id)")
      .eq("room_id", selectedRoomId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setTeams((data as any) ?? []));
  }, [selectedRoomId, pathname]);

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Đã đăng xuất, hẹn gặp lại! 👋");
    navigate({ to: "/auth" });
  }

  function pickRoom(id: string) {
    setSelectedRoomId(id);
    localStorage.setItem("sidebar:roomId", id);
    setRoomOpen(false);
    navigate({ to: "/rooms/$roomId", params: { roomId: id } });
  }

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);

  const sidebarWidth = collapsed ? "w-16" : "w-64";

  return (
    <div className="min-h-screen bg-canvas">
      <nav className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-white/85 px-6 backdrop-blur">
        {isNavigating && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden">
            <div className="h-full w-1/3 animate-[loadingbar_1.1s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-brand to-transparent" />
          </div>
        )}
        <div className="flex items-center gap-6">
          <Link to="/rooms" className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-brand">
              <div className="size-4 rounded-sm border-2 border-white" />
            </div>
            <span className="font-display text-xl font-bold tracking-tight">AI IN ACTION DAY15 - RETRO</span>
          </Link>
        </div>
        <div className="flex items-center gap-4">
          {user.email === "admin@gmail.com" && (
            <Link
              to="/admin"
              className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 ring-1 ring-red-200 hover:bg-red-100"
            >
              <Shield className="size-3.5" />
              Admin Dashboard
            </Link>
          )}
          <div className="hidden text-sm font-medium md:block">{displayName || user.email}</div>
          <UserAvatar
            seed={user.id}
            name={displayName || user.email}
            title={displayName || user.email}
            className="size-9 ring-2 ring-brand/20"
          />
          <button onClick={signOut} className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold hover:bg-muted">
            Đăng xuất
          </button>
        </div>
      </nav>

      <div className="flex">
        <aside className={`${sidebarWidth} sticky top-16 z-30 hidden h-[calc(100vh-4rem)] shrink-0 border-r border-border bg-white/70 backdrop-blur transition-[width] duration-200 md:block`}>
          <div className="flex h-full flex-col">
            {/* Collapse toggle */}
            <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between"} px-3 py-3`}>
              {!collapsed && <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Không gian làm việc</span>}
              <button
                onClick={() => setCollapsed((v) => !v)}
                className="grid size-7 place-items-center rounded-md border border-border bg-white text-muted-foreground hover:bg-muted"
                title={collapsed ? "Mở rộng" : "Thu gọn"}
              >
                {collapsed ? <ChevronsRight className="size-3.5" /> : <ChevronsLeft className="size-3.5" />}
              </button>
            </div>

            {/* Room switcher */}
            <div className="relative px-3">
              {collapsed ? (
                <Link
                  to="/rooms"
                  className="grid size-10 place-items-center rounded-lg border border-border bg-white text-sm font-bold text-brand hover:bg-muted"
                  title={selectedRoom?.name ?? "Phòng học"}
                >
                  {selectedRoom?.name?.[0] ?? "R"}
                </Link>
              ) : (
                <button
                  onClick={() => setRoomOpen((v) => !v)}
                  className="flex w-full items-center justify-between rounded-lg border border-border bg-white px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="grid size-6 shrink-0 place-items-center rounded-md bg-brand/10 text-[11px] font-bold text-brand">
                      {selectedRoom?.name?.[0] ?? "R"}
                    </span>
                    <span className="truncate font-semibold">{selectedRoom?.name ?? "Chọn lớp học"}</span>
                  </span>
                  <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition ${roomOpen ? "rotate-180" : ""}`} />
                </button>
              )}

              {roomOpen && !collapsed && (
                <div className="absolute left-3 right-3 top-full z-50 mt-1 max-h-72 overflow-auto rounded-xl border border-border bg-white p-1 shadow-xl">
                  {rooms.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => pickRoom(r.id)}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted ${r.id === selectedRoomId ? "bg-brand/5" : ""}`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-brand/10 text-[11px] font-bold text-brand">
                          {r.name[0]}
                        </span>
                        <span className="truncate">
                          <span className="font-semibold">{r.name}</span>
                        </span>
                      </span>
                      {r.id === selectedRoomId && <Check className="size-4 shrink-0 text-brand" />}
                    </button>
                  ))}
                  {rooms.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">Chưa có lớp nào</div>
                  )}
                </div>
              )}
            </div>

            {/* Teams list */}
            <div className="mt-4 flex-1 overflow-auto px-3 pb-4">
              {!collapsed && (
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Team</span>
                  <span className="text-[10px] text-muted-foreground">{teams.length}</span>
                </div>
              )}
              <div className="space-y-1">
                <Link
                  to="/confession"
                  className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-muted ${pathname === "/confession" ? "bg-brand/10 text-brand" : ""}`}
                  title="Confession ẩn danh"
                >
                  <MessageCircleHeart className="size-4 shrink-0" />
                  {!collapsed && <span className="font-semibold">Confession</span>}
                </Link>
                {selectedRoomId && (
                  <Link
                    to="/rooms/$roomId"
                    params={{ roomId: selectedRoomId }}
                    className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-muted ${pathname === `/rooms/${selectedRoomId}` ? "bg-brand/10 text-brand" : ""}`}
                    title="Tất cả team"
                  >
                    <LayoutGrid className="size-4 shrink-0" />
                    {!collapsed && <span className="font-semibold">Tất cả team</span>}
                  </Link>
                )}
                {teams.map((t) => {
                  const board = t.boards?.[0];
                  const active = board && pathname === `/board/${selectedRoomId}/${t.code}`;
                  const content = (
                    <>
                      <span className={`size-2.5 shrink-0 rounded-full bg-${t.color}-400`} />
                      {!collapsed && <span className="truncate font-medium">{t.name}</span>}
                    </>
                  );
                  if (board && selectedRoomId) {
                    return (
                      <Link
                        key={t.id}
                        to="/board/$roomId/$teamId"
                        params={{ roomId: selectedRoomId, teamId: t.code }}
                        className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-muted ${active ? "bg-brand/10 text-brand" : ""}`}
                        title={t.name}
                      >
                        {content}
                      </Link>
                    );
                  }
                  return (
                    <div key={t.id} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground" title={t.name}>
                      {content}
                    </div>
                  );
                })}
                {selectedRoomId && teams.length === 0 && !collapsed && (
                  <div className="px-2 py-2 text-xs text-muted-foreground">
                    <Users className="mb-1 size-4" />
                    Lớp này chưa có team nào, lập đội ngay thôi! 🚀
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
