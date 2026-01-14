import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCoachOrAssistant } from "../../_auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  user_id: z.string().uuid(),
  full_name: z.string().trim().min(1).max(200).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  role: z.enum(["athlete", "coach", "assistant_coach"]).nullable().optional(),
  gender: z.enum(["male", "female"]).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const gate = await requireCoachOrAssistant(request);
  if (!gate.ok) return gate.response;

  let parsed: z.infer<typeof BodySchema>;
  try {
    const json = await request.json();
    parsed = BodySchema.parse(json);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Invalid request body." }, { status: 400 });
  }

  const { user_id, full_name, email, phone, role, gender } = parsed;

  const admin = supabaseAdmin();

  // If email is being updated, keep Auth user in sync.
  if (email != null) {
    const { error: authErr } = await admin.auth.admin.updateUserById(user_id, { email });
    if (authErr) {
      return NextResponse.json(
        { error: `Auth email update failed: ${authErr.message}` },
        { status: 400 }
      );
    }
  }

  const updatePayload: Record<string, any> = {};
  if (full_name !== undefined) updatePayload.full_name = full_name;
  if (email !== undefined) updatePayload.email = email;
  if (phone !== undefined) updatePayload.phone = phone;
  if (role !== undefined) updatePayload.role = role;

  // Only store gender for athletes.
  if (gender !== undefined) {
    const effectiveRole = (role ?? null) as string | null;
    updatePayload.gender = effectiveRole === "athlete" ? gender : null;
  }

  const { data: updated, error: updErr } = await admin
    .from("profiles")
    .update(updatePayload)
    .eq("user_id", user_id)
    .select("user_id, full_name, role, gender, email, phone, created_at")
    .maybeSingle();

  if (updErr) {
    return NextResponse.json({ error: `Profile update failed: ${updErr.message}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true, account: updated });
}
