"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";

type ThreadRow = {
  id: string;
  type: string;
  created_by: string;
  subject: string | null;
  created_at: string;
};

type ParticipantRow = {
  thread_id: string;
  user_id: string;
  added_by: string | null;
  created_at: string;
  last_read_at: string | null;
};

type MessageRow = {
  id: string;
  thread_id: string;
  sender_user_id: string;
  body: string;
  created_at: string;
};

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  role: string | null;
};

function fmtTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Mobile detection hook: true when viewport < breakpoint (default 768px).
 * Safe for SSR (guards window).
 */
function useIsMobile(breakpointPx = 768) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
    const apply = () => setIsMobile(mq.matches);

    apply();

    // Safari fallback
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    } else {
      mq.addListener(apply);
      return () => mq.removeListener(apply);
    }
  }, [breakpointPx]);

  return isMobile;
}

export default function MessagesClient({ initialThreadId }: { initialThreadId?: string }) {
  const router = useRouter();
  const isMobile = useIsMobile(768);

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createBrowserClient(url, anon);
  }, []);

  const [me, setMe] = useState<{ id: string; role: string | null; name: string | null } | null>(null);

  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, ProfileRow>>({});
  const [latestByThread, setLatestByThread] = useState<Record<string, MessageRow | null>>({});
  const [unreadByThread, setUnreadByThread] = useState<Record<string, number>>({});

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Compose (reply)
  const [reply, setReply] = useState("");

  // Optional: reply draft persistence per thread
  const [replyDraftByThread, setReplyDraftByThread] = useState<Record<string, string>>({});

  // New Message modal (coach-only) - desktop only
  const [showNew, setShowNew] = useState(false);
  const [athletes, setAthletes] = useState<ProfileRow[]>([]);
  const [newAthleteId, setNewAthleteId] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [newFirstMsg, setNewFirstMsg] = useState("");

  const activeThreadRef = useRef<string | null>(null);
  activeThreadRef.current = activeThreadId;

  // Ensure initialThreadId is only applied once (prevents loops)
  const initialAppliedRef = useRef(false);

  // Scroll handling: keep pinned to bottom if user is near bottom
  const threadScrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const autoScrollEnabledRef = useRef(true); // updated on scroll

  function updateAutoScrollFlag() {
    const el = threadScrollRef.current;
    if (!el) return;
    const thresholdPx = 120; // "near bottom" tolerance
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    autoScrollEnabledRef.current = distanceFromBottom <= thresholdPx;
  }

  function scrollToBottom(mode: "auto" | "force" = "auto") {
    if (mode === "auto" && !autoScrollEnabledRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }

  // -----------------------------
  // Bootstrap: session + my profile/role
  // -----------------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr(null);

      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) {
        if (!cancelled) {
          setLoading(false);
          setErr("You are not signed in.");
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
          setLoading(false);
          setErr(profErr.message);
        }
        return;
      }

      if (!cancelled) {
        setMe({
          id: uid,
          role: prof?.role ?? null,
          name: prof?.full_name ?? null,
        });
      }

      await reloadAll(uid);
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // When switching to a thread view, default to "pinned"
  useEffect(() => {
    autoScrollEnabledRef.current = true;
  }, [activeThreadId]);

  // Apply initialThreadId (once) after we have threads + me
  useEffect(() => {
    if (!me?.id) return;
    if (!initialThreadId) return;
    if (initialAppliedRef.current) return;
    if (loading) return;

    // Only apply if the thread exists in current visible thread list (RLS enforced)
    const exists = threads.some((t) => t.id === initialThreadId);
    if (!exists) {
      initialAppliedRef.current = true; // prevent repeating attempts
      return;
    }

    initialAppliedRef.current = true;
    (async () => {
      // Persist current draft if any
      if (activeThreadId) {
        setReplyDraftByThread((prev) => ({ ...prev, [activeThreadId]: reply }));
      }

      setActiveThreadId(initialThreadId);
      setReply(replyDraftByThread[initialThreadId] ?? "");
      await loadThreadMessages(initialThreadId, me.id, true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, initialThreadId, loading, threads]);

  // -----------------------------
  // Realtime: listen for new messages/participants and refresh UI
  // -----------------------------
  useEffect(() => {
    if (!me?.id) return;

    const ch = supabase
      .channel("messages-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async (payload) => {
        const row = payload.new as any as MessageRow;

        // If message belongs to active thread, append immediately
        if (activeThreadRef.current && row.thread_id === activeThreadRef.current) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev].concat(row).sort((a, b) => a.created_at.localeCompare(b.created_at));
          });

          // If incoming (not mine), mark read ONLY because the thread is open
          if (row.sender_user_id !== me.id) {
            await markThreadRead(row.thread_id, me.id);
          }

          setTimeout(() => scrollToBottom("auto"), 0);
        }

        // Always refresh thread summaries so inbox updates without navigation
        await reloadSummaries(me.id);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_thread_participants" }, async () => {
        await reloadSummaries(me.id);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, me?.id]);

  // Auto-scroll when messages change (covers initial load + send) if user is near bottom
  useEffect(() => {
    if (!activeThreadId) return;
    scrollToBottom("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, activeThreadId]);

  // -----------------------------
  // Data loaders
  // -----------------------------
  async function reloadAll(uid: string) {
    await reloadSummaries(uid);

    setActiveThreadId((cur) => {
      if (cur) return cur;
      return null;
    });
  }

  async function reloadSummaries(uid: string) {
    setErr(null);

    // 1) Threads I can see (RLS enforced)
    const { data: th, error: thErr } = await supabase
      .from("message_threads")
      .select("id,type,created_by,subject,created_at")
      .order("created_at", { ascending: false });

    if (thErr) {
      setErr(thErr.message);
      return;
    }

    // 2) Participants (includes last_read_at)
    const { data: part, error: partErr } = await supabase
      .from("message_thread_participants")
      .select("thread_id,user_id,added_by,created_at,last_read_at");

    if (partErr) {
      setErr(partErr.message);
      return;
    }

    const threadsList = (th ?? []) as ThreadRow[];
    const partsList = (part ?? []) as ParticipantRow[];

    setThreads(threadsList);
    setParticipants(partsList);

    // 3) Recent slice of messages for latest + unread calc
    const { data: msgSlice, error: msgErr } = await supabase
      .from("messages")
      .select("id,thread_id,sender_user_id,body,created_at")
      .order("created_at", { ascending: false })
      .limit(500);

    if (msgErr) {
      setErr(msgErr.message);
      return;
    }

    const slice = (msgSlice ?? []) as MessageRow[];

    // Latest per thread
    const latestMap: Record<string, MessageRow | null> = {};
    for (const m of slice) {
      if (!latestMap[m.thread_id]) latestMap[m.thread_id] = m;
    }
    setLatestByThread(latestMap);

    // Profiles cache (participants + latest senders)
    const ids = new Set<string>();
    for (const p of partsList) ids.add(p.user_id);
    for (const m of slice) ids.add(m.sender_user_id);

    if (ids.size > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id,full_name,role")
        .in("user_id", Array.from(ids));

      const map: Record<string, ProfileRow> = {};
      (profs ?? []).forEach((r: any) => (map[r.user_id] = r));
      setProfilesById((prev) => ({ ...prev, ...map }));
    }

    // Unread counts for current user
    const myLastReadByThread: Record<string, string> = {};
    for (const p of partsList) {
      if (p.user_id === uid) {
        myLastReadByThread[p.thread_id] = p.last_read_at ?? "1970-01-01T00:00:00Z";
      }
    }

    const unreadMap: Record<string, number> = {};
    for (const m of slice) {
      const lastRead = myLastReadByThread[m.thread_id];
      if (!lastRead) continue;
      if (m.created_at > lastRead && m.sender_user_id !== uid) {
        unreadMap[m.thread_id] = (unreadMap[m.thread_id] ?? 0) + 1;
      }
    }
    setUnreadByThread(unreadMap);

    // If active thread no longer visible, clear it
    setActiveThreadId((cur) => {
      if (!cur) return cur;
      if (threadsList.some((t) => t.id === cur)) return cur;
      return null;
    });
  }

  async function loadThreadMessages(threadId: string, uid: string, markRead: boolean) {
    setErr(null);

    const { data, error } = await supabase
      .from("messages")
      .select("id,thread_id,sender_user_id,body,created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    if (error) {
      setErr(error.message);
      return;
    }

    autoScrollEnabledRef.current = true;
    setMessages((data ?? []) as MessageRow[]);

    setTimeout(() => scrollToBottom("force"), 0);

    if (markRead) {
      await markThreadRead(threadId, uid);
      await reloadSummaries(uid);
    }
  }

  async function markThreadRead(threadId: string, uid: string) {
    await supabase
      .from("message_thread_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("thread_id", threadId)
      .eq("user_id", uid);
  }

  // -----------------------------
  // UI Actions
  // -----------------------------
  async function onSelectThread(tid: string) {
    if (!me) return;

    if (activeThreadId) {
      setReplyDraftByThread((prev) => ({ ...prev, [activeThreadId]: reply }));
    }

    setActiveThreadId(tid);
    setReply(replyDraftByThread[tid] ?? "");

    await loadThreadMessages(tid, me.id, true);
  }

  function onMobileBackToInbox() {
    if (activeThreadId) {
      setReplyDraftByThread((prev) => ({ ...prev, [activeThreadId]: reply }));
    }
    setActiveThreadId(null);
    setMessages([]);
    setReply("");
  }

  async function onRefresh() {
    if (!me) return;
    setBusy("refresh");
    try {
      await reloadSummaries(me.id);
      if (activeThreadId) {
        await loadThreadMessages(activeThreadId, me.id, false);
      }
    } finally {
      setBusy(null);
    }
  }

  async function onSendReply() {
    if (!me || !activeThreadId) return;
    const body = reply.trim();
    if (!body) return;

    setBusy("send");
    setErr(null);

    try {
      const { data: ins, error } = await supabase
        .from("messages")
        .insert({
          thread_id: activeThreadId,
          sender_user_id: me.id,
          body,
        })
        .select("id,thread_id,sender_user_id,body,created_at")
        .single();

      if (error) throw error;

      setReply("");
      setReplyDraftByThread((prev) => ({ ...prev, [activeThreadId]: "" }));

      setMessages((prev) => {
        const next = [...prev, ins as any as MessageRow];
        const dedup = Array.from(new Map(next.map((m) => [m.id, m])).values());
        return dedup.sort((a, b) => a.created_at.localeCompare(b.created_at));
      });

      setTimeout(() => scrollToBottom("force"), 0);

      await markThreadRead(activeThreadId, me.id);
      await reloadSummaries(me.id);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to send message.");
    } finally {
      setBusy(null);
    }
  }

  async function openNewMessage() {
    if (!me) return;

    if (!(me.role === "coach" || me.role === "assistant_coach")) {
      setErr("Only coaches can create new threads.");
      return;
    }

    if (isMobile) {
      router.push("/app/messages/compose");
      return;
    }

    setShowNew(true);
    setNewAthleteId("");
    setNewSubject("");
    setNewFirstMsg("");

    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, full_name, role")
      .eq("role", "athlete")
      .order("full_name", { ascending: true });

    if (error) {
      setErr(error.message);
      setAthletes([]);
      return;
    }

    setAthletes((data ?? []) as any as ProfileRow[]);
  }

  async function createThread() {
    if (!me) return;
    if (!(me.role === "coach" || me.role === "assistant_coach")) return;

    const athleteId = newAthleteId.trim();
    if (!athleteId) {
      setErr("Select an athlete.");
      return;
    }

    const subject = (newSubject.trim() || "New thread").slice(0, 120);

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
        .select("id,type,created_by,subject,created_at")
        .single();

      if (tErr) throw tErr;

      const { error: pErr } = await supabase.from("message_thread_participants").insert([
        { thread_id: t.id, user_id: me.id, added_by: me.id },
        { thread_id: t.id, user_id: athleteId, added_by: me.id },
      ]);
      if (pErr) throw pErr;

      const first = newFirstMsg.trim();
      if (first) {
        const { error: mErr } = await supabase.from("messages").insert({
          thread_id: t.id,
          sender_user_id: me.id,
          body: first,
        });
        if (mErr) throw mErr;
      }

      setShowNew(false);

      await reloadSummaries(me.id);
      setActiveThreadId(t.id);
      await loadThreadMessages(t.id, me.id, true);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to create thread.");
    } finally {
      setBusy(null);
    }
  }

  const participantNames = (tid: string) => {
    const ids = participants.filter((p) => p.thread_id === tid).map((p) => p.user_id);
    const names = ids
      .map((id) => profilesById[id]?.full_name || (id === me?.id ? me?.name : null) || "Unknown")
      .filter(Boolean);
    return names.join(", ");
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="glass rounded-3xl p-6">Loading messages…</div>
      </div>
    );
  }

  const canCreate = me?.role === "coach" || me?.role === "assistant_coach";

  const activeThread = activeThreadId ? threads.find((t) => t.id === activeThreadId) : null;
  const activeHeader = activeThread ? activeThread.subject || "Thread" : "Select a thread";

  const showInboxPane = !isMobile || !activeThreadId;
  const showThreadPane = !isMobile || !!activeThreadId;

  const threadBoxHeightClass = isMobile ? "h-[70vh]" : "h-[360px]";

  const headerStickyClass = isMobile
    ? "sticky top-0 z-10 -mx-4 px-4 pt-4 pb-3 bg-[#0b1220]/80 backdrop-blur-md border-b border-white/10"
    : "";
  const replyStickyWrapClass = isMobile
    ? "sticky bottom-0 z-10 -mx-4 px-4 pt-3 pb-4 bg-[#0b1220]/80 backdrop-blur-md border-t border-white/10"
    : "";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Messages</h1>
          <p className="mt-1 text-sm text-white/70">Athletes can reply within threads they are added to by coaching staff.</p>
          {err && <p className="mt-2 text-sm text-red-200">{err}</p>}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={busy === "refresh"}
            className={[
              "rounded-2xl px-4 py-2 text-sm font-semibold transition",
              "border border-white/10 bg-white/5 hover:bg-white/10",
              busy === "refresh" ? "opacity-60" : "",
            ].join(" ")}
          >
            {busy === "refresh" ? "Refreshing…" : "Refresh"}
          </button>

          <button
            onClick={openNewMessage}
            disabled={!canCreate}
            className={[
              "rounded-2xl px-4 py-2 text-sm font-semibold transition",
              canCreate ? "bg-white text-black hover:bg-white/90" : "bg-white/10 text-white/50",
            ].join(" ")}
          >
            New message
          </button>
        </div>
      </div>

      <div className={isMobile ? "mt-6" : "mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]"}>
        {/* Inbox */}
        {showInboxPane && (
          <section className="glass rounded-3xl p-4">
            <div className="text-sm font-semibold text-white/80">Inbox</div>
            <div className="mt-3 space-y-2">
              {threads.length === 0 && <div className="text-sm text-white/60">No threads yet.</div>}

              {threads.map((t) => {
                const isActive = t.id === activeThreadId;
                const latest = latestByThread[t.id] ?? null;

                const unread = unreadByThread[t.id] ?? 0;
                const isUnread = unread > 0;

                return (
                  <button
                    key={t.id}
                    onClick={() => onSelectThread(t.id)}
                    className={[
                      "w-full rounded-2xl border px-3 py-3 text-left transition",
                      isActive
                        ? "border-white/25 bg-white/10"
                        : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/5",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 truncate">
                        <span className={isUnread ? "font-extrabold text-white" : "font-semibold text-white"}>
                          {t.subject || "Thread"}
                        </span>

                        {isUnread ? (
                          <>
                            <span
                              className="ml-2 inline-block h-2 w-2 rounded-full bg-white align-middle sm:hidden"
                              aria-label="Unread"
                            />
                            <span className="ml-2 hidden items-center rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold text-white sm:inline-flex">
                              New {unread}
                            </span>
                          </>
                        ) : null}
                      </div>

                      <div className="shrink-0 text-xs text-white/55">
                        {latest ? fmtTime(latest.created_at) : fmtTime(t.created_at)}
                      </div>
                    </div>

                    <div className="mt-1 line-clamp-1 text-sm text-white/70">{latest ? latest.body : "—"}</div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Thread */}
        {showThreadPane && (
          <section className="glass rounded-3xl p-4 lg:p-6">
            {/* Sticky header on mobile */}
            <div className={headerStickyClass}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{activeHeader}</h2>
                  {activeThreadId && (
                    <div className="mt-1 text-sm text-white/60">Participants: {participantNames(activeThreadId)}</div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {isMobile && activeThreadId && (
                    <button
                      onClick={onMobileBackToInbox}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
                    >
                      Back
                    </button>
                  )}
                  {activeThread && <div className="text-xs text-white/55">{fmtTime(activeThread.created_at)}</div>}
                </div>
              </div>
            </div>

            <div
              ref={threadScrollRef}
              onScroll={updateAutoScrollFlag}
              className={[
                "mt-4 overflow-auto rounded-2xl border border-white/10 bg-black/20 p-3",
                threadBoxHeightClass,
              ].join(" ")}
            >
              {!activeThreadId ? (
                <div className="text-sm text-white/60">Select a thread from the inbox.</div>
              ) : (
                <div className="space-y-3">
                  {messages.map((m) => {
                    const mine = m.sender_user_id === me?.id;
                    const senderName =
                      profilesById[m.sender_user_id]?.full_name || (mine ? me?.name : null) || "Unknown";

                    return (
                      <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                        <div
                          className={[
                            "max-w-[78%] rounded-2xl border px-3 py-2",
                            mine ? "border-white/10 bg-white/10" : "border-white/10 bg-black/30",
                          ].join(" ")}
                        >
                          <div className="text-xs text-white/60">
                            {senderName} · {fmtTime(m.created_at)}
                          </div>
                          <div className="mt-1 whitespace-pre-wrap text-sm text-white">{m.body}</div>
                        </div>
                      </div>
                    );
                  })}

                  <div ref={bottomRef} />
                </div>
              )}
            </div>

            {/* Reply */}
            <div className={replyStickyWrapClass}>
              <div className="flex items-end gap-2">
                <textarea
                  value={reply}
                  onChange={(e) => {
                    const v = e.target.value;
                    setReply(v);
                    if (activeThreadId) setReplyDraftByThread((prev) => ({ ...prev, [activeThreadId]: v }));
                  }}
                  onFocus={() => setTimeout(() => scrollToBottom("auto"), 0)}
                  disabled={!activeThreadId || busy === "send"}
                  placeholder={activeThreadId ? "Type a reply…" : "Select a thread to reply…"}
                  className="h-12 flex-1 resize-none rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-white/20"
                />
                <button
                  onClick={onSendReply}
                  disabled={!activeThreadId || busy === "send" || reply.trim().length === 0}
                  className={[
                    "rounded-2xl px-4 py-3 text-sm font-semibold transition",
                    activeThreadId && reply.trim().length > 0 && busy !== "send"
                      ? "bg-white text-black hover:bg-white/90"
                      : "bg-white/10 text-white/50",
                  ].join(" ")}
                >
                  {busy === "send" ? "Sending…" : "Send"}
                </button>
              </div>

              {isMobile && (
                <div className="mt-2 text-xs text-white/50">Note: Editing/deleting messages is disabled by policy.</div>
              )}
            </div>

            {!isMobile && (
              <div className="mt-2 text-xs text-white/50">Note: Editing/deleting messages is disabled by policy.</div>
            )}
          </section>
        )}
      </div>

      {/* New Message Modal (desktop only) */}
      {showNew && (
        <div className="fixed inset-0 z-[9999]">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowNew(false)}
            aria-hidden="true"
          />

          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div
              className={[
                "w-full max-w-2xl",
                "rounded-3xl border border-white/10",
                "bg-[#0b1220]/95 shadow-2xl",
                "overflow-hidden",
              ].join(" ")}
              role="dialog"
              aria-modal="true"
              aria-label="New message"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
                <div>
                  <h3 className="text-xl font-semibold text-white">New message</h3>
                  <p className="mt-1 text-sm text-white/70">
                    Coach-only thread creation. Select an athlete to start a direct thread.
                  </p>
                </div>

                <button
                  onClick={() => setShowNew(false)}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              <div className="space-y-4 px-6 py-6">
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
                    className="mt-2 h-28 w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-white/20"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-white/10 px-6 py-4">
                <button
                  onClick={() => setShowNew(false)}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={createThread}
                  disabled={busy === "create"}
                  className={[
                    "rounded-2xl px-4 py-2 text-sm font-semibold transition",
                    busy === "create" ? "bg-white/30 text-white/70" : "bg-white text-black hover:bg-white/90",
                  ].join(" ")}
                >
                  {busy === "create" ? "Creating…" : "Create thread"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
