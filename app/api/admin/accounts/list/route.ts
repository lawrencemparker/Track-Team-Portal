import { NextResponse, type NextRequest } from "next/server";
import { requireCoachOrAssistant } from "../../_auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function isBannedIndefinitelyOrActiveBan(user: any) {
  // Supabase user may expose banned_until; treat any future timestamp as banned.
  const bannedUntil = user?.banned_until ?? user?.ban_until ?? null;
  if (!bannedUntil) return false;

  const t = Date.parse(bannedUntil);
  if (Number.isNaN(t)) return true; // if it exists but can't parse, assume banned
  return t > Date.now();
}

export async function GET(request: NextRequest) {
  const gate = await requireCoachOrAssistant(request);
  if (!gate.ok) return gate.response;

  // Include gender to match your client code + database updates
  const { data, error } = await gate.supabase
    .from("profiles")
    .select("user_id, full_name, role, gender, email, phone, created_at")
    .in("role", ["coach", "assistant_coach", "athlete"])
    .order("role", { ascending: true })
    .order("full_name", { ascending: true, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const accounts = data ?? [];
  if (accounts.length === 0) return NextResponse.json({ accounts: [] });

  // Filter out deactivated users by checking Auth banned status.
  // (Small account counts -> fine. This avoids schema changes.)
  const admin = supabaseAdmin();

  const kept: any[] = [];
  for (const r of accounts) {
    try {
      const { data: u, error: uErr } = await admin.auth.admin.getUserById(r.user_id);
      if (uErr) {
        // If we can't read auth record, keep it visible rather than hiding unexpectedly
        kept.push(r);
        continue;
      }
      const isBanned = isBannedIndefinitelyOrActiveBan(u?.user);
      if (!isBanned) kept.push(r);
    } catch {
      kept.push(r);
    }
  }

  return NextResponse.json({ accounts: kept });
}
