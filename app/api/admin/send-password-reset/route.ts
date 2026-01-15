import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireCoachOrAssistant } from "../_auth";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  email: z.string().trim().email(),
});

function getSiteOrigin(request: NextRequest) {
  // 1) Explicit (recommended)
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  // 2) Vercel / proxy headers
  const xfHost = request.headers.get("x-forwarded-host");
  const xfProto = request.headers.get("x-forwarded-proto") || "https";
  if (xfHost) return `${xfProto}://${xfHost}`.replace(/\/$/, "");

  // 3) Vercel env fallback
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`.replace(/\/$/, "");

  // 4) Local/dev fallback
  return request.nextUrl.origin.replace(/\/$/, "");
}

export async function POST(request: NextRequest) {
  const gate = await requireCoachOrAssistant(request);
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { email } = parsed.data;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !service) {
    return NextResponse.json(
      {
        error:
          "Server misconfigured: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 500 }
    );
  }

  // IMPORTANT: Always point to your deployed site when available
  const siteOrigin = getSiteOrigin(request);

  // Send them directly to the branded reset route (the page that accepts the hash)
  // Your root page.tsx already forwards recovery hashes -> /auth/reset, so this is safe.
  const redirectTo = `${siteOrigin}/auth/reset`;

  const supabaseAdmin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });

  if (error) {
    return NextResponse.json(
      { error: `Failed to generate reset link: ${error.message}` },
      { status: 400 }
    );
  }

  const actionLink = (data as any)?.properties?.action_link as string | undefined;

  if (!actionLink) {
    return NextResponse.json(
      { error: "Reset link generated, but no action link was returned." },
      { status: 500 }
    );
  }

  // Include this so you can SEE what the server thought your origin was
  return NextResponse.json({
    ok: true,
    reset_link: actionLink,
    site_origin_used: siteOrigin,
    redirect_to_used: redirectTo,
  });
}
