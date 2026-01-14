"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white"
    />
  );
}

export default function ResetPasswordClient() {
  const router = useRouter();

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createBrowserClient(url, anon);
  }, []);

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = pw1.trim().length >= 6 && pw1 === pw2;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !canSubmit) return;

    setErr(null);
    setOk(null);
    setSaving(true);

    try {
      // After /auth/callback, the user should have a session.
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error("Reset link is missing or expired. Please request a new password reset email.");
      }

      const { error } = await supabase.auth.updateUser({ password: pw1.trim() });
      if (error) throw error;

      setOk("Password updated. You can now sign in.");

      // Optional but clean: sign out so they re-auth with new password.
      await supabase.auth.signOut();

      // Send them to login after a brief confirmation.
      setTimeout(() => router.push("/login"), 800);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to update password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-xl px-4 py-10">
        <section className="glass rounded-3xl p-6 lg:p-8">
          <h1 className="text-2xl font-semibold">Reset password</h1>
          <p className="mt-2 text-sm text-white/70">
            Enter a new password for your account.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-xs font-semibold text-white/60">New password</label>
              <input
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder:text-white/35 outline-none ring-0 focus:border-white/20"
                type="password"
                placeholder="min 6 characters"
                value={pw1}
                onChange={(e) => {
                  setPw1(e.target.value);
                  setErr(null);
                  setOk(null);
                }}
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-white/60">Confirm new password</label>
              <input
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder:text-white/35 outline-none ring-0 focus:border-white/20"
                type="password"
                placeholder="repeat password"
                value={pw2}
                onChange={(e) => {
                  setPw2(e.target.value);
                  setErr(null);
                  setOk(null);
                }}
                autoComplete="new-password"
              />
              {pw2.length > 0 && pw1 !== pw2 && (
                <div className="mt-2 text-xs text-red-200">Passwords do not match.</div>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit || saving}
              className={[
                "mt-1 w-full rounded-2xl px-4 py-3 font-semibold transition",
                "inline-flex items-center justify-center gap-2",
                canSubmit && !saving
                  ? "bg-white text-black hover:bg-white/90"
                  : "bg-white/25 text-white/75",
              ].join(" ")}
            >
              {saving && <Spinner />}
              <span>{saving ? "Updating…" : "Update password"}</span>
            </button>

            {ok && (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-100">
                {ok}
              </div>
            )}

            {err && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-100">
                {err}
              </div>
            )}
          </form>
        </section>
      </div>
    </main>
  );
}
