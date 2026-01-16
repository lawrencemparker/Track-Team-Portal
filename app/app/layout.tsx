import type { ReactNode } from "react";
import { supabaseServer } from "@/lib/supabase/server";
import SignOutButton from "./_components/SignOutButton";
import NavItem from "./_components/NavItem";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
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
    .select("full_name, role")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = profile?.role ?? "athlete";
  const fullName = profile?.full_name ?? user.email ?? "User";

  const canAdmin = role === "coach" || role === "assistant_coach";

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10">
            <span className="text-sm font-semibold">TT</span>
          </div>
          <div className="leading-tight">
            <div className="font-semibold">Track Team Portal</div>
            <div className="text-xs text-white/60">Dashboard</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right leading-tight">
            <div className="text-sm font-medium">{fullName}</div>
            <div className="text-xs text-white/60">{role}</div>
          </div>
          <SignOutButton />
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 pb-10 md:grid-cols-[260px_1fr]">
        <aside className="glass rounded-3xl p-3">
          <div className="px-3 py-2 text-xs font-semibold text-white/60">
            Navigation
          </div>

          <nav className="space-y-2">
            <NavItem href="/app" label="Home" />
            <NavItem href="/app/meets" label="Meets" />
            <NavItem href="/app/announcements" label="Announcements" />
            <NavItem href="/app/assignments" label="Assignments" />
            <NavItem href="/app/results" label="Results" />

            {/* NEW: Messaging */}
            <NavItem href="/app/messages" label="Messages" />

            {/* Existing: Chat */}
            <NavItem href="/app/chat" label="Chat with Bran-DEE" />

            {canAdmin && <NavItem href="/app/accounts" label="Accounts" />}
            {canAdmin && <NavItem href="/app/roster" label="Roster" />}
          </nav>

          {!canAdmin && (
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/65">
              Roster access is restricted to coaching staff.
            </div>
          )}
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
