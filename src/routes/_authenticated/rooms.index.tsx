import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/rooms/")({
  head: () => ({ meta: [{ title: "Phòng học — AI IN ACTION DAY15 - RETRO" }] }),
  component: RoomsPage,
});

function RoomsPage() {
  const { data: rooms } = useQuery({
    queryKey: ["rooms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, name, description, teams(id)")
        .order("id");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <main className="canvas-grid">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-10">
          <span className="text-xs font-bold uppercase tracking-widest text-brand">Bước 1 / Chọn phòng</span>
          <h1 className="font-display mt-2 text-balance text-5xl font-bold leading-tight tracking-tight">
            Hôm nay lớp mình<br />học ở phòng nào? 🏫
          </h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Mỗi phòng có team và board riêng. Nhảy vào phòng của bạn để tham gia hoặc tạo team mới nha!
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {(rooms ?? []).map((room) => (
            <Link key={room.id} to="/rooms/$roomId" params={{ roomId: room.id }}
              className="group relative cursor-pointer overflow-hidden rounded-3xl border border-border bg-white p-7 transition-all hover:-translate-y-1 hover:border-brand hover:shadow-2xl hover:shadow-brand/10">
              <div className="absolute right-5 top-5 text-xs font-semibold text-muted-foreground">{room.description}</div>
              <div className="mt-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">Phòng</div>
              <div className="font-display mt-2 text-4xl font-bold text-foreground group-hover:text-brand">{room.name}</div>
              <div className="mt-12 flex items-center justify-between">
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Đang mở</span>
                <span className="text-xs text-muted-foreground">{room.teams?.length ?? 0} team</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
