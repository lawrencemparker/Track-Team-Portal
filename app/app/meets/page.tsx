import { supabaseServer } from "@/lib/supabase/server";
import MeetsClient, { type MeetRow } from "../_components/MeetsClient";

export const dynamic = "force-dynamic";

export default async function MeetsPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  // AppLayout already guards auth, but keeping meets page safe.
  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  const role = profile?.role ?? "athlete";
  const canManage = role === "coach" || role === "assistant_coach";

  const { data: meets } = await supabase
    .from("meets")
    .select("*")
    .order("meet_date", { ascending: false });

  return <MeetsClient initialMeets={(meets as MeetRow[]) ?? []} canManage={canManage} />;
}
