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

  // Delete profile first (optional but keeps DB clean)
  await admin.from("profiles").delete().eq("user_id", user_id);

  const { error } = await admin.auth.admin.deleteUser(user_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
