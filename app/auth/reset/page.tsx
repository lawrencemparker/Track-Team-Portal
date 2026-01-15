// track-team-portal/app/auth/reset/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

function parseHashParams(hash: string) {
  const h = (hash || "").startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(h);
  return {
    access_token: params.get("access_token") ?? "",
    refresh_token: params.get("refresh_token") ?? "",
    type: params.get("type") ?? "",
    error: params.get("error") ?? "",
    error_code: params.get("error_code") ?? "",
    error_description: params.get("error_description") ?? "",
    expires_in: params.get("expires_in") ?? "",
    expires_at: params.get("expires_at") ?? "",
    token_type: params.get("token_type") ?? "",
  };
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [error, setError] = useState<string>("");
  const [notice, setNotice] = useState<string>("");

  useEffect(() => {
    const init = async () => {
      setError("");
      setNotice("");
      setChecking(true);
      setReady(false);

      try {
        // 1) If Supabase sent an error in the hash, show it immediately.
        const hash = typeof window !== "undefined" ? window.location.hash : "";
        const hp = parseHashParams(hash);

        if (hp.error || hp.error_description) {
          const msg =
            decodeURIComponent(hp.error_description || hp.error || "").trim() ||
            "This password reset link is invalid or has expired. Please request a new one.";
          setError(msg);
          return;
        }

        // 2) Recovery links commonly arrive as:
        //    /auth/reset#access_token=...&refresh_token=...&type=recovery
        //    We must set the session client-side.
        if (hp.access_token && hp.refresh_token) {
          const { error: setErr } = await supabase.auth.setSession({
            access_token: hp.access_token,
            refresh_token: hp.refresh_token,
          });

          if (setErr) {
            throw setErr;
          }

          setReady(true);
          return;
        }

        // 3) Fallback: sometimes auth flows use ?code= (PKCE).
        //    If present, try to exchange it. (Not always needed for recovery, but harmless.)
        const url = typeof window !== "undefined" ? new URL(window.location.href) : null;
        const code = url?.searchParams.get("code");
        if (code) {
          const exchange = (supabase.auth as any)?.exchangeCodeForSession;
          if (typeof exchange === "function") {
            const { error: exErr } = await exchange(code);
            if (exErr) throw exErr;
            setReady(true);
            return;
          }
        }

        // 4) Final fallback: if the user refreshed after session was stored, accept existing session.
        const { data: s2, error: s2Err } = await supabase.auth.getSession();
        if (s2Err) throw s2Err;

        if (!s2?.session) {
          setError("This password reset link is invalid or has expired. Please request a new one.");
          return;
        }

        setReady(true);
      } catch (e: any) {
        setError(String(e?.message ?? "Unable to validate password reset link."));
      } finally {
        setChecking(false);
      }
    };

    init();
  }, [supabase]);

  const canSubmit =
    !checking &&
    ready &&
    password.length >= 8 &&
    confirm.length >= 8 &&
    password === confirm;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");

    if (!canSubmit) return;

    try {
      const { error: upErr } = await supabase.auth.updateUser({ password });
      if (upErr) throw upErr;

      setNotice("Password updated successfully. You can now sign in.");
      setPassword("");
      setConfirm("");

      setTimeout(() => router.replace("/login"), 900);
    } catch (e: any) {
      setError(String(e?.message ?? "Unable to update password."));
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f1a] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_20px_80px_rgba(0,0,0,.55)]">
        <h1 className="text-2xl font-bold">Set a new password</h1>
        <p className="mt-2 text-white/70 text-sm">
          Choose a new password for your account. Minimum 8 characters.
        </p>

        {checking ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
            Validating your reset link…
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {notice}
          </div>
        ) : null}

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="text-xs text-white/60">New password</label>
            <input
              type="password"
              className="mt-2 w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white outline-none focus:border-white/30"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password"
              autoComplete="new-password"
              disabled={!ready || checking}
            />
          </div>

          <div>
            <label className="text-xs text-white/60">Confirm new password</label>
            <input
              type="password"
              className="mt-2 w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white outline-none focus:border-white/30"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter new password"
              autoComplete="new-password"
              disabled={!ready || checking}
            />
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className={`w-full rounded-2xl px-4 py-3 font-semibold ${
              canSubmit
                ? "bg-white text-black"
                : "bg-white/10 text-white/40 border border-white/10 cursor-not-allowed"
            }`}
          >
            Save new password
          </button>

          <div className="text-xs text-white/60">
            <span>Return to </span>
            <a className="text-white underline" href="/login">
              Sign in
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
