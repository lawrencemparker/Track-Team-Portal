"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  role: string | null;
};

export default function ComposeClient() {
  const router = useRouter();

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createBrowserClient(url, anon);
  }, []);

  const [me, setMe] = useState<{ id: string; role: string | null; name: string | null } | null>(null);
  const [athletes, setAthletes] = useState<ProfileRow[]>([]);
  const [newAthleteId, setNewAthleteId] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [newFirstMsg, setNewFirstMsg] = useState("");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canCreate = me?.role === "coach" || me?.role === "assistant_coach";

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr(null);

      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;

      if (!uid) {
        if (!cancelled) {
          setErr("You are not signed in.");
          setLoading(false);
        }
        return;
      }

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("user_id, full_name, role")
        .eq("user_id", uid)
        .maybeSingle();

      if (profErr) {
        if (!cancelled) {
          setErr(profErr.message);
          setLoading(false);
        }
        return;
      }

      const role = prof?.role ?? null;

      if (!cancelled) {
        setMe({
          id: uid,
          role,
          name: prof?.full_name ?? null,
        });
      }

      // Coach-only access
      if (!(role === "coach" || role === "assistant_coach")) {
        if (!cancelled) {
          setErr("Only coaches can create new threads.");
          setLoading(false);
        }
        return;
      }

      // Load athletes
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, role")
        .eq("role", "athlete")
        .order("full_name", { ascending: true });

      if (error) {
        if (!cancelled) {
          setErr(error.message);
          setAthletes([]);
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setAthletes((data ?? []) as any as ProfileRow[]);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function createThread() {
    if (!me) return;
    if (!(me.role === "coach" || me.role === "assistant_coach")) return;

    const athleteId = newAthleteId.trim();
    if (!athleteId) {
      setErr("Select an athlete.");
      return;
    }

    const subject = (newSubject.trim() || "New thread").slice(0, 120);
    const first = newFirstMsg.trim();

    setBusy("create");
    setErr(null);

    try {
      const { data: t, error: tErr } = await supabase
        .from("message_threads")
        .insert({
          type: "direct",
          created_by: me.id,
          subject,
        })
        .select("id")
        .single();

      if (tErr) throw tErr;

      const { error: pErr } = await supabase.from("message_thread_participants").insert([
        { thread_id: t.id, user_id: me.id, added_by: me.id },
        { thread_id: t.id, user_id: athleteId, added_by: me.id },
      ]);
      if (pErr) throw pErr;

      if (first) {
        const { error: mErr } = await supabase.from("messages").insert({
          thread_id: t.id,
          sender_user_id: me.id,
          body: first,
        });
        if (mErr) throw mErr;
      }

      // Decision (1): return to Inbox (do NOT auto-open)
      router.push("/app/messages");
    } catch (e: any) {
      setErr(e?.message ?? "Failed to create thread.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="glass rounded-3xl p-6">Loading…</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">New message</h1>
          <p className="mt-1 text-sm text-white/70">
            Start a direct thread with an athlete. This page is intended for mobile compose.
          </p>
          {err && <p className="mt-2 text-sm text-red-200">{err}</p>}
        </div>

        <button
          onClick={() => router.push("/app/messages")}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
        >
          Back
        </button>
      </div>

      {!canCreate ? (
        <div className="mt-6 glass rounded-3xl p-6">
          <div className="text-sm text-white/70">You do not have permission to create threads.</div>
        </div>
      ) : (
        <div className="mt-6 glass rounded-3xl p-6">
          <div className="space-y-4">
            <div>
              <div className="text-xs font-semibold text-white/60">Athlete</div>
              <select
                value={newAthleteId}
                onChange={(e) => setNewAthleteId(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-white/20"
              >
                <option value="">Select an athlete…</option>
                {athletes.map((a) => (
                  <option key={a.user_id} value={a.user_id}>
                    {a.full_name || a.user_id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs font-semibold text-white/60">Subject</div>
              <input
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                placeholder="e.g., Practice attendance"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-white/20"
              />
            </div>

            <div>
              <div className="text-xs font-semibold text-white/60">Initial message (optional)</div>
              <textarea
                value={newFirstMsg}
                onChange={(e) => setNewFirstMsg(e.target.value)}
                placeholder="Type your first message…"
                className="mt-2 h-44 w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-white/20"
              />
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              onClick={() => router.push("/app/messages")}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              onClick={createThread}
              disabled={busy === "create" || newAthleteId.trim().length === 0}
              className={[
                "rounded-2xl px-4 py-2 text-sm font-semibold transition",
                busy === "create" || newAthleteId.trim().length === 0
                  ? "bg-white/10 text-white/50"
                  : "bg-white text-black hover:bg-white/90",
              ].join(" ")}
            >
              {busy === "create" ? "Creating…" : "Create thread"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
