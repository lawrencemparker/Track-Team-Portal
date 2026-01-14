import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCoachOrAssistant } from "../../_auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  full_name: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().nullable().optional(),
  password: z.string().min(6),
  role: z.enum(["athlete", "coach", "assistant_coach"]),
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

  const { full_name, email, phone, password, role, gender } = parsed;

  // Only athletes should have gender set.
  const normalizedGender = role === "athlete" ? (gender ?? null) : null;

  const admin = supabaseAdmin();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr || !created?.user?.id) {
    return NextResponse.json(
      { error: createErr?.message ?? "Failed to create auth user." },
      { status: 400 }
    );
  }

  const userId = created.user.id;

  const { error: upsertErr } = await admin.from("profiles").upsert(
    {
      user_id: userId,
      full_name,
      role,
      gender: normalizedGender,
      email,
      phone: phone ?? null,
    },
    { onConflict: "user_id" }
  );

  if (upsertErr) {
    // Roll back auth user if profile write fails
    await admin.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: upsertErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, user_id: userId });
}
