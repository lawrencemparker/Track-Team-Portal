"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white"
    />
  );
}

export default function LoginClient() {
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createBrowserClient(url, anon);
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Autofocus email (mobile-friendly)
  useEffect(() => {
    const t = setTimeout(() => {
      const el = document.getElementById("login-email") as HTMLInputElement | null;
      el?.focus();
    }, 50);
    return () => clearTimeout(t);
  }, []);

  const canSubmit = email.trim().length > 3 && password.trim().length > 0;

  const buttonLabel = sending
    ? "Signing in…"
    : !canSubmit
      ? "Enter email and password"
      : "Sign in";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending || !canSubmit) return;

    setError(null);
    setSending(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      // Let SSR session pick it up; client redirect is fine.
      window.location.href = "/app";
    } catch (err: any) {
      setError(err?.message ?? "Sign-in failed.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left column */}
          <section className="glass rounded-3xl p-6 lg:p-8 hidden lg:block">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10">
                <span className="text-sm font-semibold">TT</span>
              </div>
              <div className="leading-tight">
                <div className="font-semibold">Track Team Portal</div>
                <div className="text-xs text-white/60">Internal team system</div>
              </div>
            </div>

            <div className="mt-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Team Portal
              </div>

              <h2 className="mt-5 text-lg font-semibold">Access</h2>
              <p className="mt-2 text-white/70">
                Sign in using your school or team email address. Access is managed by
                coaching staff.
              </p>

              <div className="mt-6">
                <div className="text-xs font-semibold text-white/60">
                  Available modules
                </div>
                <ul className="mt-3 space-y-3 text-sm text-white/80">
                  <li className="flex gap-3">
                    <span className="mt-0.5 text-emerald-300">✓</span>
                    <span>Meet schedules and logistics</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-0.5 text-emerald-300">✓</span>
                    <span>Event assignments (“My events”)</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-0.5 text-emerald-300">✓</span>
                    <span>Announcements and results</span>
                  </li>
                </ul>

                <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                  <div className="text-xs font-semibold text-white/60">
                    Access issue?
                  </div>
                  <div className="mt-1">
                    If you cannot sign in, confirm your email is on the team roster or
                    contact your coach.
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Right column */}
          <aside className="glass rounded-3xl p-6 lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold">Sign in</h1>
                <p className="mt-1 text-white/70">
                  Sign in using your email and password.
                </p>
              </div>
            </div>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-white/60">
                  Email address
                </label>
                <input
                  id="login-email"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder:text-white/35 outline-none ring-0 focus:border-white/20"
                  placeholder="name@school.org"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-white/60">
                  Password
                </label>
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder:text-white/35 outline-none ring-0 focus:border-white/20"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={!canSubmit || sending}
                className={[
                  "mt-1 w-full rounded-2xl px-4 py-3 font-semibold transition",
                  "inline-flex items-center justify-center gap-2",
                  canSubmit && !sending
                    ? "bg-white text-black hover:bg-white/90"
                    : "",
                  !canSubmit || sending ? "bg-white/25 text-white/75" : "",
                ].join(" ")}
              >
                {sending && <Spinner />}
                <span>{buttonLabel}</span>
              </button>

              {error && (
                <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-100">
                  {error}
                </div>
              )}

              <div className="text-xs text-white/55">
                Need access or forgot your password? Contact a coach for a password
                reset link.
              </div>
            </form>
          </aside>
        </div>
      </div>
    </main>
  );
}
