import { supabaseServer } from "@/lib/supabase/server";
import AnnouncementsClient, { type AnnouncementRow } from "../_components/AnnouncementsClient";

export const dynamic = "force-dynamic";

export default async function AnnouncementsPage() {
  const supabase = await supabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  // Normalize role to avoid issues like "Coach", "coach ", etc.
  const role = String(profile?.role ?? "athlete").trim().toLowerCase();

  // Coaches can create/edit/delete. Athletes are view-only.
  const canManage = role === "coach" || role === "assistant_coach" || role === "assistant";

  const { data: announcements } = await supabase
    .from("announcements")
    .select("*")
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });

  const initial = (announcements as AnnouncementRow[]) ?? [];

  return <AnnouncementsClient initialAnnouncements={initial} canManage={canManage} />;
}
