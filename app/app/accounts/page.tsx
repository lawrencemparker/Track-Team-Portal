import { supabaseServer } from "@/lib/supabase/server";
import AccountsClient from "./AccountsClient";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <div className="glass rounded-3xl p-6">
          <h1 className="text-xl font-semibold">Session required</h1>
          <p className="mt-2 text-white/70">Please sign in again.</p>
          <a
            className="mt-4 inline-flex rounded-xl bg-white/10 px-4 py-2 hover:bg-white/15"
            href="/login"
          >
            Go to login
          </a>
        </div>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = profile?.role ?? "athlete";
  return <AccountsClient role={role} />;
}
