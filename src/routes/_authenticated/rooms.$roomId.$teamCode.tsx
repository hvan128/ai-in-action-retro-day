import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/rooms/$roomId/$teamCode")({
  component: TeamByCode,
});

function TeamByCode() {
  const { roomId, teamCode } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const code = teamCode.padStart(3, "0");
      const { data, error } = await supabase
        .from("teams")
        .select("id, room_id, boards(id)")
        .eq("code", code)
        .maybeSingle();
      if (error || !data) {
        toast.error(`Không tìm thấy team #${code}`);
        navigate({ to: "/rooms/$roomId", params: { roomId } });
        return;
      }
      await supabase.from("team_members").upsert(
        { team_id: data.id, user_id: user.id },
        { onConflict: "team_id,user_id" }
      );
      const board = (data as any).boards?.[0];
      if (board) {
        navigate({ to: "/board/$roomId/$teamId", params: { roomId: data.room_id, teamId: code } });
      } else {
        navigate({ to: "/rooms/$roomId", params: { roomId: data.room_id } });
      }
    })();
  }, [teamCode, roomId, user.id, navigate]);

  return (
    <main className="canvas-grid grid min-h-[60vh] place-items-center">
      <div className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        Đang mở team #{teamCode.padStart(3, "0")}…
      </div>
    </main>
  );
}
