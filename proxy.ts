import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Role-based route guards for staff-only areas.
 * This runs BEFORE any route renders.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only guard staff-only routes here
  const isStaffOnlyRoute =
    pathname === "/app/roster" || pathname.startsWith("/app/roster/");

  if (!isStaffOnlyRoute) {
    return NextResponse.next();
  }

  // Prepare response so we can set cookies if Supabase needs to refresh tokens
  const response = NextResponse.next();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Not logged in -> send to login
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Logged in -> check role
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  // If profile missing or query fails, treat as non-staff (fail closed)
  const role = profile?.role ?? "athlete";
  const isStaff = role === "coach" || role === "assistant_coach" || role === "trainer";

  if (!isStaff) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }

  // Staff -> allowed
  return response;
}

/**
 * Only run proxy for roster routes (fast + minimal).
 */
export const config = {
  matcher: ["/app/roster/:path*"],
};
