import { NextResponse, type NextRequest } from "next/server";
import { requireCoachOrAssistant } from "../../_auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requireCoachOrAssistant(request);
  if (!gate.ok) return gate.response;

  const { data, error } = await gate.supabase
    .from("profiles")
    .select("user_id, full_name, role, gender, email, phone, created_at")
    .in("role", ["coach", "assistant_coach", "athlete"])
    .order("role", { ascending: true })
    .order("full_name", { ascending: true, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ accounts: data ?? [] });
}
