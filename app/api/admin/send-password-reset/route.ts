// track-team-portal/app/api/admin/send-password-reset/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireCoachOrAssistant } from "../_auth";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  email: z.string().trim().email(),
});

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

  // IMPORTANT:
  // Send users straight to your reset page so the fragment lands on /auth/reset
  // and the client can setSession() from the hash.
  const origin = request.nextUrl.origin;
  const redirectTo = `${origin}/auth/reset`;

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
  });
}
