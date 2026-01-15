"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function RecoveryPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const run = async () => {
      setError("");

      // With hash-based links (#access_token=...), the browser already has the tokens.
      // We just need to ensure a session exists, then send them to the reset form.
      const { data, error } = await supabase.auth.getSession();

      if (error || !data.session) {
        setError("This link is invalid or expired. Please request a new password reset link.");
        return;
      }

      router.replace("/auth/reset");
    };

    run();
  }, [router, supabase]);

  return (
    <div className="min-h-screen bg-[#0b0f1a] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8">
        <h1 className="text-2xl font-bold">Preparing password reset…</h1>
        <p className="mt-2 text-white/70 text-sm">
          Please wait while we open the password reset screen.
        </p>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
