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

  const body = await request.json();
  const parsed = BodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { email } = parsed.data;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!url || !service || !siteUrl) {
    return NextResponse.json(
      { error: "Missing required environment variables." },
      { status: 500 }
    );
  }

  // ALWAYS use canonical site URL (never request.origin)
  const redirectTo = `${siteUrl}/auth/callback?next=/auth/reset`;

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
      { error: error.message },
      { status: 400 }
    );
  }

  const actionLink = (data as any)?.properties?.action_link;

  if (!actionLink) {
    return NextResponse.json(
      { error: "Reset link not returned." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    reset_link: actionLink,
  });
}
