"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type MeetRow = {
  id: string;
  name: string | null;
  meet_date: string | null;
};

type MeetEventRow = {
  id: string;
  meet_id: string;
  event_name: string | null;
};

type AssignmentRow = {
  id: string;
  meet_event_id: string;
  athlete_id: string;
};

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

type ResultRow = {
  id: string;
  meet_event_id: string;
  athlete_id: string;
  mark: string | null;
  place: number | null;
  points: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
};

type ResultViewRow = ResultRow & {
  meetLabel: string;
  eventName: string;
  athleteName: string;
};

function formatMeetLabel(name: string | null, meet_date: string | null) {
  const nm = name ?? "Meet";
  if (!meet_date) return nm;
  // Match AssignmentsClient behavior to avoid timezone/day-shift
  const d = new Date(meet_date + "T00:00:00");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${nm} - ${mm}/${dd}/${yyyy}`;
}

function fmtPosted(ts: string) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export default function ResultsClient() {
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [meets, setMeets] = useState<MeetRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);

  // Meet-scoped data that drives the cascading dropdowns
  const [meetEvents, setMeetEvents] = useState<MeetEventRow[]>([]);
  const [meetAssignments, setMeetAssignments] = useState<AssignmentRow[]>([]);

  const [results, setResults] = useState<ResultViewRow[]>([]);

  const [selectedMeetId, setSelectedMeetId] = useState<string>("");
  const [selectedEventId, setSelectedEventId] = useState<string>("ALL");
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>("");

  const [mark, setMark] = useState("");
  const [place, setPlace] = useState("");
  const [points, setPoints] = useState("");
  const [notes, setNotes] = useState("");

  const [reloadNonce, setReloadNonce] = useState(0);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sessionRole, setSessionRole] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);

  const canManage = useMemo(() => {
    const r = (sessionRole ?? "").toLowerCase();
    return r === "coach" || r === "assistant_coach" || r === "assistant" || r === "admin";
  }, [sessionRole]);

  const inputCls =
    "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-white/25";
  const labelCls = "text-xs font-semibold tracking-wide text-white/70";
  const helpCls = "mt-2 text-xs text-white/60";

  const meetsById = useMemo(() => new Map(meets.map((m) => [m.id, m])), [meets]);

  const profileNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of profiles) map.set(p.user_id, p.full_name || p.email || p.user_id);
    return map;
  }, [profiles]);

  const meetLabel = useMemo(() => {
    const m = meetsById.get(selectedMeetId);
    return formatMeetLabel(m?.name ?? null, m?.meet_date ?? null);
  }, [meetsById, selectedMeetId]);

  // Bootstrap: role + base lists
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setLoading(true);
      setError(null);

      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;

      if (!uid) {
        if (!cancelled) {
          setSessionUserId(null);
          setSessionRole(null);
          setMeets([]);
          setProfiles([]);
          setSelectedMeetId("");
          setLoading(false);
        }
        return;
      }

      const [{ data: prof }, meetsRes, profsRes] = await Promise.all([
        supabase.from("profiles").select("role").eq("user_id", uid).maybeSingle(),
        supabase.from("meets").select("id,name,meet_date").order("meet_date", { ascending: false }),
        supabase.from("profiles").select("user_id,full_name,email,role"),
      ]);

      if (cancelled) return;

      setSessionUserId(uid);
      setSessionRole((prof as any)?.role ?? null);

      const m = (meetsRes.data ?? []) as any[];
      setMeets(m as MeetRow[]);
      setProfiles((profsRes.data ?? []) as any);

      const initialMeet = m?.[0]?.id ?? "";
      setSelectedMeetId((prev) => prev || initialMeet);

      setLoading(false);
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Load meet-scoped data (meet_events + assignments for those meet_events)
  useEffect(() => {
    let cancelled = false;

    async function loadMeetScoped() {
      setError(null);

      if (!selectedMeetId) {
        setMeetEvents([]);
        setMeetAssignments([]);
        return;
      }

      const me = await supabase
        .from("meet_events")
        .select("id, meet_id, event_name")
        .eq("meet_id", selectedMeetId)
        .order("event_name", { ascending: true });

      if (cancelled) return;

      if (me.error) {
        setError(me.error.message);
        setMeetEvents([]);
        setMeetAssignments([]);
        return;
      }

      const meRows = (me.data ?? []) as MeetEventRow[];
      setMeetEvents(meRows);

      const meetEventIds = meRows.map((x) => x.id);

      if (meetEventIds.length === 0) {
        setMeetAssignments([]);
        return;
      }

      const asn = await supabase.from("assignments").select("id, meet_event_id, athlete_id").in("meet_event_id", meetEventIds);

      if (cancelled) return;

      if (asn.error) {
        setError(asn.error.message);
        setMeetAssignments([]);
        return;
      }

      setMeetAssignments((asn.data ?? []) as any);
    }

    // Cascade reset exactly like prior behavior
    setSelectedEventId("ALL");
    setSelectedAthleteId("");

    loadMeetScoped();

    return () => {
      cancelled = true;
    };
  }, [supabase, selectedMeetId]);

  // Only events that are tied to assignments for this meet
  const availableEventIdsForMeet = useMemo(() => {
    const s = new Set<string>();
    for (const a of meetAssignments) s.add(a.meet_event_id);
    return s;
  }, [meetAssignments]);

  const availableEventsForMeet = useMemo(() => {
    const list = meetEvents.filter((ev) => availableEventIdsForMeet.has(ev.id));
    list.sort((a, b) => (a.event_name ?? "").localeCompare(b.event_name ?? ""));
    return list;
  }, [meetEvents, availableEventIdsForMeet]);

  // Athlete options: only athletes tied to selected meet + selected event
  const availableAthleteIds = useMemo(() => {
    if (!selectedMeetId) return [];
    if (selectedEventId === "ALL") return [];
    const s = new Set<string>();
    for (const a of meetAssignments) {
      if (a.meet_event_id === selectedEventId) s.add(a.athlete_id);
    }
    return Array.from(s).sort((a, b) => {
      const an = profileNameById.get(a) ?? a;
      const bn = profileNameById.get(b) ?? b;
      return an.localeCompare(bn);
    });
  }, [selectedMeetId, selectedEventId, meetAssignments, profileNameById]);

  // Reset athlete on event change
  useEffect(() => {
    setSelectedAthleteId("");
  }, [selectedEventId]);

  const eventDisabled = useMemo(() => !selectedMeetId, [selectedMeetId]);

  const athleteDisabled = useMemo(() => {
    return selectedEventId === "ALL" || availableAthleteIds.length === 0;
  }, [selectedEventId, availableAthleteIds.length]);

  const resolvedMeetEventId = useMemo(() => {
    if (selectedEventId === "ALL") return null;
    return selectedEventId || null;
  }, [selectedEventId]);

  // Load results based on cascading filters
  useEffect(() => {
    let cancelled = false;

    async function loadResults() {
      setError(null);

      if (!selectedMeetId) {
        setResults([]);
        return;
      }

      const restrictToAthlete = !canManage && !!sessionUserId;
      const athleteIdFilter = restrictToAthlete ? sessionUserId : selectedAthleteId;

      // All events => across all assigned events for this meet
      if (selectedEventId === "ALL") {
        const meetEventIds = availableEventsForMeet.map((e) => e.id);
        if (meetEventIds.length === 0) {
          setResults([]);
          return;
        }

        let q = supabase.from("results").select("*").in("meet_event_id", meetEventIds);
        if (athleteIdFilter) q = q.eq("athlete_id", athleteIdFilter);

        const { data, error } = await q.order("created_at", { ascending: false });
        if (cancelled) return;

        if (error) {
          setError(error.message);
          setResults([]);
          return;
        }

        const eventNameById = new Map<string, string>();
        for (const ev of meetEvents) eventNameById.set(ev.id, ev.event_name ?? "—");

        const view: ResultViewRow[] = (data ?? []).map((r: any) => ({
          ...(r as ResultRow),
          meetLabel,
          eventName: eventNameById.get(r.meet_event_id) ?? "—",
          athleteName: profileNameById.get(r.athlete_id) ?? r.athlete_id,
        }));

        setResults(view);
        return;
      }

      if (!resolvedMeetEventId) {
        setResults([]);
        return;
      }

      let q = supabase.from("results").select("*").eq("meet_event_id", resolvedMeetEventId);
      if (athleteIdFilter) q = q.eq("athlete_id", athleteIdFilter);

      const { data, error } = await q.order("created_at", { ascending: false });
      if (cancelled) return;

      if (error) {
        setError(error.message);
        setResults([]);
        return;
      }

      const ev = meetEvents.find((x) => x.id === resolvedMeetEventId);
      const evName = ev?.event_name ?? "—";

      const view: ResultViewRow[] = (data ?? []).map((r: any) => ({
        ...(r as ResultRow),
        meetLabel,
        eventName: evName,
        athleteName: profileNameById.get(r.athlete_id) ?? r.athlete_id,
      }));

      setResults(view);
    }

    loadResults();

    return () => {
      cancelled = true;
    };
  }, [
    supabase,
    selectedMeetId,
    selectedEventId,
    selectedAthleteId,
    canManage,
    sessionUserId,
    availableEventsForMeet,
    meetEvents,
    meetLabel,
    profileNameById,
    resolvedMeetEventId,
    reloadNonce,
  ]);

  const canEnterResults = useMemo(() => {
    if (!canManage) return false;
    if (!selectedMeetId) return false;
    if (!resolvedMeetEventId) return false;
    if (!selectedAthleteId) return false;
    return true;
  }, [canManage, selectedMeetId, resolvedMeetEventId, selectedAthleteId]);

  async function saveResult() {
    if (!canEnterResults) return;

    setSaving(true);
    setError(null);

    const placeNum = place.trim() === "" ? null : Number(place);
    const pointsNum = points.trim() === "" ? null : Number(points);

    const payload: any = {
      meet_event_id: resolvedMeetEventId,
      athlete_id: selectedAthleteId,
      mark: mark.trim() === "" ? null : mark.trim(),
      place: Number.isFinite(placeNum as any) ? placeNum : null,
      points: Number.isFinite(pointsNum as any) ? pointsNum : null,
      notes: notes.trim() === "" ? null : notes.trim(),
    };

    const { error } = await supabase.from("results").upsert(payload);

setSaving(false);

if (error) {
  const anyErr = error as any;
  const msg = String(anyErr?.message ?? "");
  const code = String(anyErr?.code ?? "");

  // Friendly duplicate-result message (athlete already has a result for this event)
  if (
    code === "23505" ||
    msg.includes("results_meet_event_id_athlete_id_key") ||
    msg.toLowerCase().includes("duplicate key value violates unique constraint")
  ) {
    setError(
      "This athlete already has a result recorded for this event. If you need to change it, delete the existing result below and then re-enter the updated mark."
    );
    return;
  }

  // Fallback to the raw error for anything else
  setError(msg || "Unable to save result. Please try again.");
  return;
}


    setMark("");
    setPlace("");
    setPoints("");
    setNotes("");

    setReloadNonce((n) => n + 1);
  }

  async function deleteResult(id: string) {
    if (!canManage) return;

    setError(null);
    const { error } = await supabase.from("results").delete().eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }

    setResults((prev) => prev.filter((r) => r.id !== id));
    setReloadNonce((n) => n + 1);
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-white/80">
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-semibold text-white">Results</h1>
            <p className="mt-2 text-white/70">Official meet results. Athletes can view only.</p>
          </div>
          {canManage && (
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">
              Coach access
            </span>
          )}
        </div>

        {error && (
          <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div>
            <div className={labelCls}>Meet</div>
            <select
              className={`mt-2 ${inputCls}`}
              value={selectedMeetId}
              onChange={(e) => setSelectedMeetId(e.target.value)}
            >
              {meets.map((m) => (
                <option key={m.id} value={m.id}>
                  {formatMeetLabel(m.name, m.meet_date)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className={labelCls}>Event</div>
            <select
              className={`mt-2 ${inputCls}`}
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              disabled={eventDisabled}
            >
              <option value="ALL">All events</option>
              {availableEventsForMeet.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.event_name ?? "—"}
                </option>
              ))}
            </select>

            {eventDisabled ? (
              <div className={helpCls}>Select a meet to load events.</div>
            ) : availableEventsForMeet.length === 0 ? (
              <div className={helpCls}>No assignments exist for this meet yet.</div>
            ) : selectedEventId === "ALL" ? (
              <div className={helpCls}>Athlete is disabled when viewing All events.</div>
            ) : (
              <div className={helpCls}>Select an event to load athletes.</div>
            )}
          </div>

          <div>
            <div className={labelCls}>Athlete</div>
            <select
              className={`mt-2 ${inputCls}`}
              value={selectedAthleteId}
              onChange={(e) => setSelectedAthleteId(e.target.value)}
              disabled={athleteDisabled || !canManage}
            >
              <option value="">{canManage ? "Select athlete..." : "Select athlete"}</option>
              {availableAthleteIds.map((id) => (
                <option key={id} value={id}>
                  {profileNameById.get(id) ?? id}
                </option>
              ))}
            </select>

            {!canManage ? (
              <div className={helpCls}>Athletes can view only.</div>
            ) : athleteDisabled ? (
              <div className={helpCls}>
                {selectedEventId === "ALL"
                  ? "Athlete is disabled when viewing All events."
                  : "No athletes are assigned to this event for the selected meet."}
              </div>
            ) : (
              <div className={`${helpCls} select-none opacity-0`} aria-hidden="true">
                spacer
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Entry form (coach-only) */}
      {canManage && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <div className="text-sm text-white/80">Enter a result and save it so athletes can view it.</div>

          <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-6 md:grid-cols-5">
            <div>
              <div className={labelCls}>Mark</div>
              <input
                className={`mt-2 ${inputCls}`}
                placeholder={`e.g., 10.90 | 42.10m | 5'8"`}
                value={mark}
                onChange={(e) => setMark(e.target.value)}
              />
              <div className={helpCls}>Enter a time, distance, or height.</div>
            </div>

            <div>
              <div className={labelCls}>Place</div>
              <input
                className={`mt-2 ${inputCls}`}
                placeholder="e.g., 1"
                value={place}
                onChange={(e) => setPlace(e.target.value)}
              />
              <div className={helpCls}>Whole number only (optional).</div>
            </div>

            <div>
              <div className={labelCls}>Points</div>
              <input
                className={`mt-2 ${inputCls}`}
                placeholder="e.g., 6 or 3.5"
                value={points}
                onChange={(e) => setPoints(e.target.value)}
              />
              <div className={helpCls}>Number (optional).</div>
            </div>

            <div>
              <div className={labelCls}>Notes</div>
              <input
                className={`mt-2 ${inputCls}`}
                placeholder="e.g., PB of season"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <div className={helpCls}>Optional.</div>
            </div>

            <div>
              <div className={`${labelCls} select-none opacity-0`}>Action</div>
              <button
                className={`mt-2 w-full rounded-2xl px-4 py-3 font-semibold ${
                  canEnterResults
                    ? "bg-white text-black"
                    : "bg-white/10 text-white/40 border border-white/10 cursor-not-allowed"
                }`}
                onClick={saveResult}
                disabled={!canEnterResults || saving}
              >
                {saving ? "Saving…" : "Save result"}
              </button>
              <div className={`${helpCls} select-none opacity-0`} aria-hidden="true">
                spacer
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results table */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-white">Results</div>
            <div className="mt-1 text-sm text-white/70">Meet: {meetLabel}</div>
            {selectedEventId === "ALL" ? (
              <div className="mt-1 text-xs text-white/60">
                Tip: When viewing All events, select a specific event to enter/update a result.
              </div>
            ) : null}
          </div>
          <div className="text-sm text-white/70">{results.length} records</div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="text-xs font-semibold tracking-wide text-white/70">
                <th className="pb-3">Meet</th>
                <th className="pb-3">Event</th>
                <th className="pb-3">Athlete</th>
                <th className="pb-3">Mark</th>
                <th className="pb-3">Place</th>
                <th className="pb-3">Points</th>
                <th className="pb-3">Notes</th>
                <th className="pb-3">Posted</th>
                {canManage && <th className="pb-3 text-right">Action</th>}
              </tr>
            </thead>

            <tbody className="text-sm text-white/90">
              {results.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 9 : 8} className="py-6 text-white/60">
                    No results found.
                  </td>
                </tr>
              ) : (
                results.map((r) => (
                  <tr key={r.id} className="border-t border-white/10">
                    <td className="py-4">{r.meetLabel}</td>
                    <td className="py-4">{r.eventName || "—"}</td>
                    <td className="py-4">{r.athleteName || "—"}</td>
                    <td className="py-4">{r.mark ?? "—"}</td>
                    <td className="py-4">{r.place ?? "—"}</td>
                    <td className="py-4">{r.points ?? "—"}</td>
                    <td className="py-4">{r.notes ?? "—"}</td>
                    <td className="py-4">{fmtPosted(r.created_at)}</td>
                    {canManage && (
                      <td className="py-4 text-right">
                        <button
                          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10"
                          onClick={() => deleteResult(r.id)}
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
