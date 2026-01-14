import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AppHome() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data.user!;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("user_id", user.id)
    .single();

  const name = profile?.full_name || "User";
  const role = profile?.role || "athlete";

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Dashboard</h1>
            <p className="mt-1 text-sm text-white/60">
              Signed in as <span className="text-white/80 font-medium">{name}</span>{" "}
              <span className="text-white/45">({role})</span>
            </p>
          </div>

          <div className="rounded-2xl bg-black/25 ring-1 ring-white/10 px-3 py-2 text-xs text-white/70">
            Today
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white/85">Upcoming meets</h2>
            <span className="text-xs text-white/55">Schedule</span>
          </div>

          <div className="mt-4 space-y-3">
            <div className="rounded-2xl bg-black/25 ring-1 ring-white/10 p-4">
              <div className="text-sm font-medium text-white/85">County Invitational</div>
              <div className="mt-1 text-xs text-white/55">Central Stadium • 3:30 PM</div>
              <div className="mt-3 text-xs text-white/60">Notes: Bus departs 2:15 PM</div>
            </div>

            <div className="rounded-2xl bg-black/25 ring-1 ring-white/10 p-4">
              <div className="text-sm font-medium text-white/85">Dual Meet vs West HS</div>
              <div className="mt-1 text-xs text-white/55">Home Track • 4:00 PM</div>
              <div className="mt-3 text-xs text-white/60">Notes: Warmups begin 3:00 PM</div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white/85">Announcements</h2>
            <span className="text-xs text-white/55">Latest</span>
          </div>

          <div className="mt-4 space-y-3">
            <div className="rounded-2xl bg-black/25 ring-1 ring-white/10 p-4">
              <div className="text-sm font-medium text-white/85">Practice moved indoors</div>
              <div className="mt-1 text-xs text-white/55">Posted today</div>
              <div className="mt-3 text-xs text-white/60">
                Due to weather, meet in the gym at 3:10 PM.
              </div>
            </div>

            <div className="rounded-2xl bg-black/25 ring-1 ring-white/10 p-4">
              <div className="text-sm font-medium text-white/85">Uniform reminder</div>
              <div className="mt-1 text-xs text-white/55">Posted yesterday</div>
              <div className="mt-3 text-xs text-white/60">
                Bring spikes and team top for Friday’s meet.
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white/85">My events</h2>
            <span className="text-xs text-white/55">Next meet</span>
          </div>

          <div className="mt-4 space-y-3">
            <div className="rounded-2xl bg-black/25 ring-1 ring-white/10 p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-white/85">100m</div>
                <div className="text-xs text-white/55 mt-1">Heat assignment pending</div>
              </div>
              <div className="text-xs text-white/60">—</div>
            </div>

            <div className="rounded-2xl bg-black/25 ring-1 ring-white/10 p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-white/85">4x100 relay</div>
                <div className="text-xs text-white/55 mt-1">Leg TBD</div>
              </div>
              <div className="text-xs text-white/60">—</div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white/85">Recent results</h2>
            <span className="text-xs text-white/55">Last meet</span>
          </div>

          <div className="mt-4 space-y-3">
            <div className="rounded-2xl bg-black/25 ring-1 ring-white/10 p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-white/85">200m</div>
                <div className="text-xs text-white/55 mt-1">PR</div>
              </div>
              <div className="text-sm text-white/80 font-medium">24.81</div>
            </div>

            <div className="rounded-2xl bg-black/25 ring-1 ring-white/10 p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-white/85">100m</div>
                <div className="text-xs text-white/55 mt-1">Wind legal</div>
              </div>
              <div className="text-sm text-white/80 font-medium">12.35</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
