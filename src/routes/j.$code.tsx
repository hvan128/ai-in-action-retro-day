import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { rememberPendingJoin } from "@/lib/pending-join";

// Link ngắn để in lên mã QR: /j/002
//
// Mã nhóm là duy nhất trên toàn hệ thống (unique index trên teams.code) nên
// không cần room trong đường dẫn — ngắn hơn hẳn /rooms/D303/002 khi chiếu lên
// máy chiếu hoặc khi ai đó phải gõ tay.
//
// Route này KHÔNG nằm dưới /_authenticated: người chưa đăng nhập vẫn phải vào
// được để mã kịp được ghi nhớ trước khi bị đẩy sang màn hình đăng nhập.
export const Route = createFileRoute("/j/$code")({
  ssr: false,
  head: () => ({ meta: [{ title: "Đang mở nhóm — AI IN ACTION DAY15 - RETRO" }] }),
  component: ShortJoin,
});

function ShortJoin() {
  const { code } = Route.useParams();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const padded = code.padStart(3, "0");

      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!session?.user) {
        rememberPendingJoin(padded);
        navigate({ to: "/auth" });
        return;
      }

      // teams chỉ đọc được khi đã đăng nhập, nên bước này phải nằm sau kiểm tra session.
      const { data: team } = await supabase
        .from("teams")
        .select("id, room_id, boards(id)")
        .eq("code", padded)
        .maybeSingle();
      if (cancelled) return;

      if (!team) {
        toast.error(`Không tìm thấy nhóm #${padded}`);
        navigate({ to: "/rooms" });
        return;
      }

      await supabase.from("team_members").upsert(
        { team_id: team.id, user_id: session.user.id },
        { onConflict: "team_id,user_id" },
      );
      if (cancelled) return;

      const board = (team as { boards?: { id: string }[] }).boards?.[0];
      if (board) {
        navigate({ to: "/board/$roomId/$teamId", params: { roomId: team.room_id, teamId: padded } });
      } else {
        navigate({ to: "/rooms/$roomId", params: { roomId: team.room_id } });
      }
    })();
    return () => { cancelled = true; };
  }, [code, navigate]);

  return (
    <main className="canvas-grid grid min-h-screen place-items-center">
      <div className="text-center">
        <div className="font-display text-5xl font-bold text-foreground">#{code.padStart(3, "0")}</div>
        <div className="mt-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Đang mở nhóm…
        </div>
      </div>
    </main>
  );
}
