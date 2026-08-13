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

// Email và trạng thái khoá nằm ở auth.users chứ không ở bảng profiles, nên
// getAdminData không lấy được. Giấy nhớ thì đã có sẵn trong getAdminData rồi,
// chỉ cần gom theo author_id ở phía client.
export const adminListAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = (context.claims as any)?.email;
    if (email !== ADMIN_EMAIL) {
      throw new Error("Forbidden");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const users: { id: string; email: string | null; banned: boolean }[] = [];
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      for (const u of data?.users ?? []) {
        users.push({
          id: u.id,
          email: u.email ?? null,
          banned: Boolean(u.banned_until && new Date(u.banned_until) > new Date()),
        });
      }
      if (!data?.users?.length || data.users.length < 200) break;
    }
    return users;
  });

export const adminSetUserBan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string; banned: boolean }) => input)
  .handler(async ({ data, context }) => {
    const email = (context.claims as any)?.email;
    if (email !== ADMIN_EMAIL) {
      throw new Error("Forbidden");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Tự khoá chính mình là mất luôn đường vào trang admin, không mở lại được
    // từ giao diện. Chặn ở server chứ không chỉ ẩn nút ngoài UI.
    const { data: me } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    const target = (me?.users ?? []).find((u) => u.id === data.user_id);
    if (target?.email === ADMIN_EMAIL) {
      throw new Error("Không thể khoá chính tài khoản quản trị.");
    }

    // Supabase tính khoá theo thời hạn; mốc rất xa coi như vĩnh viễn.
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: data.banned ? "876000h" : "none",
    });
    if (error) throw new Error(error.message);
    return { ok: true, banned: data.banned };
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
