import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // This call is what refreshes the session. Without it cookies go stale and
  // people get logged out at random. Nothing goes between createServerClient
  // and this line.
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  /**
   * API routes are never redirected.
   *
   * Redirecting a fetch to /login hands back an HTML page where the caller
   * expected JSON, which is both useless and confusing to debug. Every route
   * under /api checks the session itself and answers 401 when it needs to —
   * and /api/auth/* has to work before a session exists at all.
   */
  const isApi = path.startsWith("/api");

  const isPublic =
    isApi ||
    path === "/" ||
    path.startsWith("/login") ||
    path.startsWith("/signup") ||
    path.startsWith("/auth") ||
    path.startsWith("/_next");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const redirect = NextResponse.redirect(url);
    // Carry the refreshed cookies onto the redirect. A bare
    // NextResponse.redirect() throws them away, which logs people straight
    // back out after a successful magic link.
    supabaseResponse.cookies.getAll().forEach((c) =>
      redirect.cookies.set(c.name, c.value)
    );
    return redirect;
  }

  return supabaseResponse;
}
