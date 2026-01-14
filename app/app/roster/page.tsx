import { supabaseServer } from "@/lib/supabase/server";
import RosterClient, { type ProfileRow } from "../_components/RosterClient";

export const dynamic = "force-dynamic";

export default async function RosterPage() {
  const supabase = await supabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  const myRole = myProfile?.role ?? "athlete";
  const canManage = ["coach", "assistant_coach", "trainer"].includes(myRole);

  const { data: athletes } = await supabase
    .from("profiles")
    .select("user_id, full_name, role, email, phone")
    .eq("role", "athlete")
    .order("full_name", { ascending: true });

  return (
    <RosterClient
      meUserId={user.id}
      canManage={canManage}
      athletes={(athletes as ProfileRow[]) ?? []}
    />
  );
}
