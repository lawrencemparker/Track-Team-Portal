import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCoachOrAssistant } from "../_auth";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  full_name: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().optional().default(""),
  role: z.enum(["athlete", "coach", "assistant_coach"]),
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

  const { full_name, email, phone, role } = parsed.data;

  const admin = supabaseAdmin();

  // Create/invite auth user (sends email to set password)
  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    email,
    {
      data: {
        full_name,
        role,
      },
    }
  );

  if (inviteError) {
    return NextResponse.json(
      { error: inviteError.message },
      { status: 400 }
    );
  }

  const newUser = inviteData.user;
  if (!newUser?.id) {
    return NextResponse.json(
      { error: "Supabase did not return a user id." },
      { status: 500 }
    );
  }

  // Upsert profile row (service role bypasses RLS)
  const { error: profileError } = await admin
    .from("profiles")
    .upsert(
      {
        user_id: newUser.id,
        full_name,
        role,
        email,
        phone,
      },
      { onConflict: "user_id" }
    );

  if (profileError) {
    return NextResponse.json(
      { error: profileError.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, user_id: newUser.id });
}
