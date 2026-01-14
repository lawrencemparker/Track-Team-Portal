import { supabaseServer } from "@/lib/supabase/server";
import AssignmentsClient from "../_components/AssignmentsClient";

export const dynamic = "force-dynamic";

export default async function AssignmentsPage() {
  const supabase = await supabaseServer();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) {
    return (
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold">Assignments</h1>
        <p className="mt-2 text-white/70">Failed to load user session.</p>
        <pre className="mt-3 text-xs text-red-200">{userErr.message}</pre>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold">Assignments</h1>
        <p className="mt-2 text-white/70">You must be signed in.</p>
      </div>
    );
  }

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (profErr) {
    return (
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold">Assignments</h1>
        <p className="mt-2 text-white/70">Failed to load profile role.</p>
        <pre className="mt-3 text-xs text-red-200">{profErr.message}</pre>
      </div>
    );
  }

  return <AssignmentsClient role={profile?.role ?? "athlete"} />;
}
