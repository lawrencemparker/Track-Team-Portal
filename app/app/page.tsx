import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTimestamp(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default async function AppHome() {
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

  const role = profile?.role ?? "athlete";

  /* ---------------- Announcements (5 most recent) ---------------- */
  const { data: announcements } = await supabase
    .from("announcements")
    .select("id,title,body,created_at,pinned")
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <div className="space-y-6">
      {/* ---------------- Announcements ---------------- */}
      <section className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold">Announcements</h2>
            <span className="text-xs text-white/50">Showing 5 most recent</span>
          </div>

          <Link
            href="/app/announcements"
            className="text-xs text-white/60 hover:text-white"
          >
            View all
          </Link>
        </div>

        <div className="mt-4 space-y-3">
          {!announcements || announcements.length === 0 ? (
            <div className="text-sm text-white/60">No announcements.</div>
          ) : (
            announcements.map((a) => (
              <div
                key={a.id}
                className="rounded-2xl bg-black/25 ring-1 ring-white/10 p-4"
              >
                {/* Title + Timestamp (concatenated) */}
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium">
                    {a.title} · {fmtTimestamp(a.created_at)}
                  </div>

                  {a.pinned && (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px]">
                      pinned
                    </span>
                  )}
                </div>

                {a.body && (
                  <div className="mt-2 text-xs text-white/70 line-clamp-3">
                    {a.body}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* ---- other dashboard sections remain unchanged ---- */}
    </div>
  );
}
