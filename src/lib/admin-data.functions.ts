import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ADMIN_EMAIL = "admin@gmail.com";

export const getAdminData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = (context.claims as any)?.email;
    if (email !== ADMIN_EMAIL) {
      throw new Error("Forbidden");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [roomsRes, teamsRes, boardsRes, notesRes, profilesRes, likesRes] = await Promise.all([
      supabaseAdmin.from("rooms").select("id, name, description").order("id"),
      supabaseAdmin.from("teams").select("id, name, code, color, room_id, created_at").order("code"),
      supabaseAdmin.from("boards").select("id, title, team_id"),
      supabaseAdmin
        .from("notes")
        .select("id, board_id, author_id, content, column_key, color, votes, pinned, created_at")
        .order("created_at", { ascending: true }),
      supabaseAdmin.from("profiles").select("id, display_name"),
      supabaseAdmin.from("note_likes").select("note_id, user_id"),
    ]);

    if (roomsRes.error) throw roomsRes.error;
    if (teamsRes.error) throw teamsRes.error;
    if (boardsRes.error) throw boardsRes.error;
    if (notesRes.error) throw notesRes.error;
    if (profilesRes.error) throw profilesRes.error;
    if (likesRes.error) throw likesRes.error;

    const likesByNote = new Map<string, string[]>();
    for (const l of likesRes.data ?? []) {
      const arr = likesByNote.get(l.note_id) ?? [];
      arr.push(l.user_id);
      likesByNote.set(l.note_id, arr);
    }
    const notesWithLikes = (notesRes.data ?? []).map((n: any) => ({
      ...n,
      likes: likesByNote.get(n.id)?.length ?? 0,
      liked_by: likesByNote.get(n.id) ?? [],
    }));

    return {
      rooms: roomsRes.data ?? [],
      teams: teamsRes.data ?? [],
      boards: boardsRes.data ?? [],
      notes: notesWithLikes,
      profiles: profilesRes.data ?? [],
    };
  });

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; password: string; display_name?: string }) => input)
  .handler(async ({ data, context }) => {
    const email = (context.claims as any)?.email;
    if (email !== ADMIN_EMAIL) {
      throw new Error("Forbidden");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: data.display_name ? { display_name: data.display_name } : undefined,
    });
    if (error) throw new Error(error.message);
    return { id: created.user?.id, email: created.user?.email };
  });

export const adminDeleteNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { note_id: string }) => input)
  .handler(async ({ data, context }) => {
    const email = (context.claims as any)?.email;
    if (email !== ADMIN_EMAIL) {
      throw new Error("Forbidden");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: likesError } = await supabaseAdmin.from("note_likes").delete().eq("note_id", data.note_id);
    if (likesError) throw new Error(likesError.message);
    const { error } = await supabaseAdmin.from("notes").delete().eq("id", data.note_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { team_id: string }) => input)
  .handler(async ({ data, context }) => {
    const email = (context.claims as any)?.email;
    if (email !== ADMIN_EMAIL) {
      throw new Error("Forbidden");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("teams").delete().eq("id", data.team_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
