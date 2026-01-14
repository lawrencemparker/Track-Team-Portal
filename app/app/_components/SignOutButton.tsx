"use client";

import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    const supabase = supabaseBrowser();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-xs text-white/75 hover:bg-white/10"
      type="button"
    >
      Sign out
    </button>
  );
}
