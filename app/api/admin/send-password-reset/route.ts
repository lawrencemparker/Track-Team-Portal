import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireCoachOrAssistant } from "../_auth";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  email: z.string().trim().email(),
});

// Prefer an explicit canonical site URL in production.
// Fallbacks:
// - VERCEL_URL is provided by Vercel (no protocol)
// - request.nextUrl.origin works for local dev
function getSiteOrigin(request: NextRequest) {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`.replace(/\/$/, "");

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

  // Always route through callback then to the reset page
  const siteOrigin = getSiteOrigin(request);
  const redirectTo = `${siteOrigin}/auth/callback?next=/auth/reset`;

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

  return NextResponse.json({
    ok: true,
    reset_link: actionLink,
    // Helpful for debugging (optional—remove if you want)
    site_origin_used: siteOrigin,
  });
}
