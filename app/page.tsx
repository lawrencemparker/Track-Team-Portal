"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Supabase recovery links often arrive as:
    //   https://your-domain.com/#access_token=...&type=recovery
    // We must redirect to /auth/reset and preserve the hash so the reset page can read it.
    const hash = typeof window !== "undefined" ? window.location.hash : "";

    const isRecovery =
      hash.includes("access_token=") &&
      (hash.includes("type=recovery") || hash.includes("type=magiclink"));

    if (isRecovery) {
      // Preserve the fragment. /auth/reset/page.tsx will setSession() from the hash.
      window.location.replace(`/auth/reset${hash}`);
      return;
    }

    // Normal app entry
    router.replace("/login");
  }, [router]);

  // Minimal UI while redirecting
  return (
    <div className="min-h-screen bg-[#0b0f1a] text-white flex items-center justify-center px-6">
      <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-4 text-sm text-white/80">
        Redirecting…
      </div>
    </div>
  );
}
