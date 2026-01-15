import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCoachOrAssistant } from "../../_auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  user_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const gate = await requireCoachOrAssistant(request);
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { user_id } = parsed.data;
  const admin = supabaseAdmin();

  /**
   * SOFT DELETE / DEACTIVATE
   * -----------------------
   * We must retain historical Assignments + Results.
   * Those records reference profiles.user_id, so we must NOT delete:
   *  - auth.users row
   *  - profiles row
   *
   * Instead, prevent future login by banning the auth user indefinitely.
   */
  const { error } = await admin.auth.admin.updateUserById(user_id, {
    ban_duration: "876000h", // ~100 years = effectively permanent
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, status: "deactivated" });
}
