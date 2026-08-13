import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Ơ, không thấy trang này 🙈</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Trang bạn tìm có thể đã đi chơi xa hoặc chưa từng tồn tại.
        </p>
        <Link to="/" className="mt-6 inline-flex rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Về trang chủ
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => { reportLovableError(error, { boundary: "tanstack_root_error_component" }); }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-xl font-semibold">Oops, trang chưa tải được 😅</h1>
        <p className="mt-2 text-sm text-muted-foreground">Có gì đó hơi trục trặc. Thử tải lại nha!</p>
        <button onClick={() => { router.invalidate(); reset(); }} className="mt-6 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">Thử lại</button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "AI IN ACTION DAY15 - RETRO — Cùng nhìn lại, cùng tiến lên" },
      { name: "description", content: "Buổi retrospective sau hành trình 14 ngày tại AI Thực Chiến" },
      { property: "og:title", content: "AI IN ACTION DAY15 - RETRO — Cùng nhìn lại, cùng tiến lên" },
      { property: "og:description", content: "Buổi retrospective sau hành trình 14 ngày tại AI Thực Chiến" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "AI IN ACTION DAY15 - RETRO — Cùng nhìn lại, cùng tiến lên" },
      { name: "twitter:description", content: "Buổi retrospective sau hành trình 14 ngày tại AI Thực Chiến" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/776de853-a930-462a-bcba-7fb61fb02cfb" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/776de853-a930-462a-bcba-7fb61fb02cfb" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Inter:wght@400;500;600&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    // 24h session policy: sign users out if their login is older than 24 hours.
    const SESSION_MAX_MS = 24 * 60 * 60 * 1000;
    try {
      const loginAt = Number(localStorage.getItem("retro_login_at") ?? 0);
      if (loginAt && Date.now() - loginAt > SESSION_MAX_MS) {
        localStorage.removeItem("retro_login_at");
        supabase.auth.signOut();
      }
    } catch {}

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      if (event === "SIGNED_IN") {
        try { localStorage.setItem("retro_login_at", String(Date.now())); } catch {}
      }
      if (event === "SIGNED_OUT") {
        try { localStorage.removeItem("retro_login_at"); } catch {}
      }
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
