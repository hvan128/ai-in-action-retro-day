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

export const adminListConfessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = (context.claims as any)?.email;
    if (email !== ADMIN_EMAIL) {
      throw new Error("Forbidden");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("confessions")
      .select("id, content, status, number, created_at, reviewed_at, author_id, pinned")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    // Ẩn danh là ẩn với học viên khác. Admin cần thấy tên để xử lý được khi có
    // người lợi dụng — đúng lý do bảng vẫn lưu author_id.
    const ids = [...new Set((rows ?? []).map((r) => r.author_id))];
    const { data: profiles } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, display_name").in("id", ids)
      : { data: [] };
    const nameOf = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name]));

    return (rows ?? []).map((r) => ({
      id: r.id,
      content: r.content,
      status: r.status,
      number: r.number,
      created_at: r.created_at,
      author_name: nameOf.get(r.author_id) ?? "?",
      author_id: r.author_id,
      pinned: r.pinned,
    }));
  });

export const adminReviewConfession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; approve: boolean }) => input)
  .handler(async ({ data, context }) => {
    const email = (context.claims as any)?.email;
    if (email !== ADMIN_EMAIL) {
      throw new Error("Forbidden");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let number: number | null = null;
    if (data.approve) {
      // Số thứ tự chỉ gán khi duyệt, và không tái sử dụng số của bài bị từ chối
      // để thứ tự hiển thị luôn tăng đều.
      const { data: top } = await supabaseAdmin
        .from("confessions")
        .select("number")
        .not("number", "is", null)
        .order("number", { ascending: false })
        .limit(1)
        .maybeSingle();
      number = ((top?.number as number | null) ?? 0) + 1;
    }

    const { error } = await supabaseAdmin
      .from("confessions")
      .update({
        status: data.approve ? "approved" : "rejected",
        number,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, number };
  });

export const adminSetConfessionPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; pinned: boolean }) => input)
  .handler(async ({ data, context }) => {
    const email = (context.claims as any)?.email;
    if (email !== ADMIN_EMAIL) {
      throw new Error("Forbidden");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("confessions")
      .update({ pinned: data.pinned })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, pinned: data.pinned };
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
