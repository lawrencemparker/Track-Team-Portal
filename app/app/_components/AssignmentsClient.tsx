"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Role = "coach" | "assistant" | "assistant_coach" | "athlete" | string;

type MeetRow = {
  id: string;
  name: string;
  meet_date: string | null; // yyyy-mm-dd
};

type EventRow = {
  id: string;
  name: string;
  category: string | null;
};

type MeetEventRow = {
  id: string;
  meet_id: string;
  event_name: string | null;
  event_id?: string | null;
  events?: { name?: string | null } | null;
};

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  role?: string | null;
};

type AssignmentRow = {
  id: string;
  meet_event_id: string;
  athlete_id: string;
  status: string | null;
  created_at?: string | null;
};

type AssignmentView = {
  id: string;
  meet_label: string;
  event_name: string;
  athlete_name: string;
  status: string;
};

function fmtMeetLabel(m: MeetRow) {
  const d = m.meet_date ? new Date(m.meet_date + "T00:00:00") : null;
  const dateStr = d
    ? d.toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "numeric" })
    : "—";
  return `${m.name} - ${dateStr}`;
}

function safeMeetEventName(me: MeetEventRow) {
  return (me?.events?.name ?? me?.event_name ?? "").trim();
}

export default function AssignmentsClient({ role }: { role: Role }) {
  const supabase = useMemo(() => supabaseBrowser(), []);

  const canWrite = role === "coach" || role === "assistant" || role === "assistant_coach";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [notice, setNotice] = useState<string>("");

  const [userId, setUserId] = useState<string>("");

  const [meets, setMeets] = useState<MeetRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [athletes, setAthletes] = useState<ProfileRow[]>([]);

  const [meetEvents, setMeetEvents] = useState<MeetEventRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [views, setViews] = useState<AssignmentView[]>([]);

  const [selectedMeetId, setSelectedMeetId] = useState<string>("");

  // Coach builder fields
  const [selectedEventName, setSelectedEventName] = useState<string>("");
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>("");
  const [status, setStatus] = useState<string>("assigned");

  // styling (MATCH Results page)
  const card =
    "rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_20px_80px_rgba(0,0,0,.55)]";
  const selectCls =
    "mt-2 w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white outline-none focus:border-white/30";
  const buttonOutline =
    "text-sm px-4 py-2 rounded-2xl border border-white/10 text-white/80 hover:bg-white/5";
  const pill =
    "rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70";

  const selectedMeet = useMemo(
    () => meets.find((m) => m.id === selectedMeetId) ?? null,
    [meets, selectedMeetId]
  );

  const selectedMeetLabel = useMemo(
    () => (selectedMeet ? fmtMeetLabel(selectedMeet) : "—"),
    [selectedMeet]
  );

  // IMPORTANT: cache meet_events by (meet_id + event_name) to avoid cross-meet collisions.
  const meetEventByKey = useMemo(() => {
    const map = new Map<string, MeetEventRow>();
    for (const me of meetEvents) {
      const n = safeMeetEventName(me);
      if (!n) continue;
      map.set(`${me.meet_id}__${n}`, me);
    }
    return map;
  }, [meetEvents]);

  async function refreshAll() {
    setError("");
    setNotice("");
    setLoading(true);

    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? "";
      setUserId(uid);

      const { data: meetData, error: meetErr } = await supabase
        .from("meets")
        .select("id,name,meet_date")
        .order("meet_date", { ascending: false });

      if (meetErr) throw meetErr;

      const meetsList = (meetData ?? []) as MeetRow[];
      setMeets(meetsList);

      const defaultMeetId = selectedMeetId || (meetsList[0]?.id ?? "");
      setSelectedMeetId(defaultMeetId);

      // Global events (support either events.name or events.event_name)
      // This keeps the Event dropdown stable while making it resilient to schema differences.
      let evList: EventRow[] = [];
      const evTry1 = await supabase
        .from("events")
        .select("id,name,category")
        .order("category", { ascending: true })
        .order("name", { ascending: true });

      if (!evTry1.error && (evTry1.data ?? []).length > 0) {
        evList = (evTry1.data ?? []) as EventRow[];
      } else {
        const evTry2 = await supabase
          .from("events")
          .select("id,event_name,category")
          .order("category", { ascending: true })
          .order("event_name", { ascending: true });

        if (evTry2.error) throw evTry2.error;
        evList = ((evTry2.data ?? []) as any[]).map((r) => ({
          id: r.id,
          name: r.event_name,
          category: r.category ?? null,
        }));
      }

      setEvents(evList);

      if (canWrite && !selectedEventName) {
        setSelectedEventName(evList[0]?.name ?? "");
      }

      if (canWrite) {
        const { data: athData, error: athErr } = await supabase
          .from("profiles")
          .select("user_id, full_name, role")
          .eq("role", "athlete")
          .order("full_name", { ascending: true });

        if (athErr) throw athErr;
        setAthletes((athData ?? []) as ProfileRow[]);
      } else {
        setAthletes([]);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to refresh.");
    } finally {
      setLoading(false);
    }
  }

  async function loadMeetContext(meetId: string) {
    if (!meetId) return;

    setError("");
// Do NOT clear notice here. saveAssignment() relies on loadMeetContext() refresh,
// and clearing here would immediately wipe the success notification.


    // meet_events
    const { data: meData, error: meErr } = await supabase
      .from("meet_events")
      .select("id,meet_id,event_name,event_id,events(name)")
      .eq("meet_id", meetId);

    if (meErr) {
      setError(meErr.message);
      setMeetEvents([]);
      setAssignments([]);
      setViews([]);
      return;
    }

    const meRows = (meData ?? []) as MeetEventRow[];
    setMeetEvents(meRows);

    // Ensure the Event dropdown contains:
    // - Global events (from events table)
    // - Any existing meet_events.event_name (even if not in global list)
    // This is data-only and does not alter the dropdown UI/behavior.
    setEvents((prev) => {
      const byName = new Map<string, EventRow>();
      (prev ?? []).forEach((e) => {
        const n = (e?.name ?? "").trim();
        if (n) byName.set(n, e);
      });
      meRows.forEach((me) => {
        const n = safeMeetEventName(me);
        if (!n) return;
        if (!byName.has(n)) {
          byName.set(n, { id: `custom:${me.id}`, name: n, category: null });
        }
      });
      return Array.from(byName.values()).sort((a, b) => {
        const ac = (a.category ?? "").toLowerCase();
        const bc = (b.category ?? "").toLowerCase();
        if (ac !== bc) return ac.localeCompare(bc);
        return a.name.localeCompare(b.name);
      });
    });

    // assignments
    const meetEventIds = meRows.map((x) => x.id);
    if (meetEventIds.length === 0) {
      setAssignments([]);
      setViews([]);
      return;
    }

    let q = supabase
      .from("assignments")
      .select("id, meet_event_id, athlete_id, status, created_at")
      .in("meet_event_id", meetEventIds)
      .order("created_at", { ascending: false });

    if (!canWrite && userId) {
      q = q.eq("athlete_id", userId);
    }

    const { data: asgData, error: asgErr } = await q;

    if (asgErr) {
      setError(asgErr.message);
      setAssignments([]);
      setViews([]);
      return;
    }

    const asgRows = (asgData ?? []) as AssignmentRow[];
    setAssignments(asgRows);

    // map names
    const eventNameByMeetEventId = new Map<string, string>();
    for (const me of meRows) eventNameByMeetEventId.set(me.id, safeMeetEventName(me) || "—");

    const athleteIds = Array.from(new Set(asgRows.map((r) => r.athlete_id).filter(Boolean)));
    const athleteNameMap = new Map<string, string>();

    if (athleteIds.length > 0) {
      if (canWrite && athletes.length > 0) {
        athletes.forEach((a) => athleteNameMap.set(a.user_id, (a.full_name ?? a.user_id) as string));
      } else {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", athleteIds);
        (profs ?? []).forEach((p: any) =>
          athleteNameMap.set(p.user_id, (p.full_name ?? p.user_id) as string)
        );
      }
    }

    const meetLabel = selectedMeetLabel;

    setViews(
      asgRows.map((r) => ({
        id: r.id,
        meet_label: meetLabel,
        event_name: eventNameByMeetEventId.get(r.meet_event_id) ?? "—",
        athlete_name: athleteNameMap.get(r.athlete_id) ?? r.athlete_id,
        status: (r.status ?? "assigned") as string,
      }))
    );
  }

  async function ensureMeetEvent(meetId: string, eventName: string): Promise<MeetEventRow> {
    const key = `${meetId}__${eventName}`;
    const cached = meetEventByKey.get(key);
    if (cached) return cached;

    const { data: found, error: findErr } = await supabase
      .from("meet_events")
      .select("id,meet_id,event_name,event_id,events(name)")
      .eq("meet_id", meetId)
      .eq("event_name", eventName)
      .maybeSingle();

    if (!findErr && found) {
      const row = found as MeetEventRow;
      setMeetEvents((prev) => (prev.some((x) => x.id === row.id) ? prev : [row, ...prev]));
      return row;
    }

    // Create meet_event if it doesn't exist yet (so you can add assignments for a fresh meet)
    const { data: created, error: createErr } = await supabase
      .from("meet_events")
      .insert({ meet_id: meetId, event_name: eventName })
      .select("id,meet_id,event_name,event_id,events(name)")
      .single();

    if (createErr) throw createErr;

    const row = created as MeetEventRow;
    setMeetEvents((prev) => [row, ...prev]);
    return row;
  }

  async function saveAssignment() {
    if (!canWrite) return;

    setError("");
    setNotice("");

    try {
      if (!selectedMeetId) return;
      if (!selectedEventName) return;
      if (!selectedAthleteId) return;
      if (!status) return;

      const me = await ensureMeetEvent(selectedMeetId, selectedEventName);

      // REQUIRED: pre-check existing assignment for this athlete + meet_event
      const { data: existingRow, error: existingErr } = await supabase
        .from("assignments")
        .select("id,status")
        .eq("meet_event_id", me.id)
        .eq("athlete_id", selectedAthleteId)
        .maybeSingle();

      if (existingErr) throw existingErr;

      const prevStatus = String(existingRow?.status ?? "").toLowerCase().trim();
      const nextStatus = String(status ?? "").toLowerCase().trim();

      const { data: up, error: upErr } = await supabase
        .from("assignments")
        .upsert(
          { meet_event_id: me.id, athlete_id: selectedAthleteId, status },
          { onConflict: "meet_event_id,athlete_id" }
        )
        .select("id, meet_event_id, athlete_id, status, created_at")
        .single();

      if (upErr) throw upErr;

      const inserted = up as AssignmentRow;

      // REQUIRED NOTIFICATIONS:
      // 1) Same-status duplicate
      // 2) Status update (assigned <-> alternate)
      if (existingRow) {
        if (prevStatus === nextStatus) {
          setNotice(`No changes made. This athlete is already ${nextStatus} for this event.`);
        } else {
          setNotice(`Assignment updated: status changed from "${prevStatus}" to "${nextStatus}".`);
        }
      }

      // Optimistic UI update
      const athleteName =
        athletes.find((a) => a.user_id === inserted.athlete_id)?.full_name ?? inserted.athlete_id;

      const newView: AssignmentView = {
        id: inserted.id,
        meet_label: selectedMeetLabel,
        event_name: selectedEventName,
        athlete_name: (athleteName ?? inserted.athlete_id) as string,
        status: inserted.status ?? "assigned",
      };

      setAssignments((prev) => {
        const withoutDup = prev.filter(
          (x) =>
            !(
              x.meet_event_id === inserted.meet_event_id && x.athlete_id === inserted.athlete_id
            )
        );
        return [inserted, ...withoutDup];
      });

      setViews((prev) => {
        const withoutDup = prev.filter((x) => x.id !== inserted.id);
        return [newView, ...withoutDup];
      });

      // Keep consistent (safe reload)
      await loadMeetContext(selectedMeetId);
    } catch (e: any) {
      // IMPORTANT: never reference removed variables; show only real errors.
      setError(String(e?.message ?? "Unable to save assignment."));
    }
  }

  async function deleteAssignment(id: string) {
    if (!canWrite) return;

    setError("");
    setNotice("");

    // optimistic remove immediately
    setAssignments((prev) => prev.filter((r) => r.id !== id));
    setViews((prev) => prev.filter((r) => r.id !== id));

    const { error: delErr } = await supabase.from("assignments").delete().eq("id", id);
    if (delErr) {
      setError(delErr.message);
      // recover
      await loadMeetContext(selectedMeetId);
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedMeetId) return;
    loadMeetContext(selectedMeetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMeetId, userId]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className={card}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      {/* Header card (MATCH Results) */}
      <div className={card}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-3xl font-bold">Assignments</div>
            <div className="mt-1 text-white/70">
              Coaches assign athletes to events for a selected meet. Athletes can view only.
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={pill}>{canWrite ? "Coach access" : "Athlete view"}</div>
            <button className={buttonOutline} onClick={refreshAll}>
              Refresh
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="mt-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {notice}
          </div>
        ) : null}
      </div>

      {/* Meet selector card (MATCH Results) */}
      <div className={card}>
        <label className="text-xs text-white/60">Meet</label>
        <select
          className={selectCls}
          value={selectedMeetId}
          onChange={(e) => setSelectedMeetId(e.target.value)}
        >
          <option value="">Select meet…</option>
          {meets.map((m) => (
            <option key={m.id} value={m.id}>
              {fmtMeetLabel(m)}
            </option>
          ))}
        </select>
      </div>

      {/* Coach assignment builder card (MATCH Results) */}
      {canWrite ? (
        <div className={card}>
          {/* FIX: prevent select overflow + ensure button is clickable */}
          <div className="grid gap-4 md:grid-cols-4 items-end">
            <div className="min-w-0">
              <label className="text-xs text-white/60">Event</label>
              <select
                className={selectCls}
                value={selectedEventName}
                onChange={(e) => setSelectedEventName(e.target.value)}
              >
                <option value="">Select event…</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.name}>
                    {ev.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-0">
              <label className="text-xs text-white/60">Athlete</label>
              <select
                className={selectCls}
                value={selectedAthleteId}
                onChange={(e) => setSelectedAthleteId(e.target.value)}
              >
                <option value="">Select athlete…</option>
                {athletes.map((a) => (
                  <option key={a.user_id} value={a.user_id}>
                    {a.full_name ?? a.user_id}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-0">
              <label className="text-xs text-white/60">Status</label>
              <select
                className={selectCls}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="assigned">assigned</option>
                <option value="alternate">alternate</option>
              </select>
            </div>

            {/* IMPORTANT: keep the button above any native <select> hitboxes so clicks are never blocked */}
            <div className="min-w-0 flex md:justify-end relative z-20 pointer-events-auto">
              <button
                type="button"
                className={`mt-2 w-full rounded-2xl px-4 py-3 font-semibold ${
                  selectedMeetId && selectedEventName && selectedAthleteId && status
                    ? "bg-white text-black"
                    : "bg-white/10 text-white/40 border border-white/10 cursor-not-allowed"
                }`}
                onClick={saveAssignment}
                disabled={!selectedMeetId || !selectedEventName || !selectedAthleteId || !status}
              >
                Save assignment
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Table card (MATCH Results) */}
      <div className={card}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-semibold">Assignments for this meet</div>
            <div className="text-xs text-white/60 mt-1">Meet: {selectedMeetLabel}</div>
          </div>
          <div className="text-xs text-white/60">{views.length} records</div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-white/60 border-b border-white/10">
              <tr>
                <th className="py-3 text-left">Meet</th>
                <th className="py-3 text-left">Event</th>
                <th className="py-3 text-left">Athlete</th>
                <th className="py-3 text-left">Status</th>
                {canWrite ? <th className="py-3 text-left">Action</th> : null}
              </tr>
            </thead>

            <tbody>
              {views.length === 0 ? (
                <tr>
                  <td colSpan={canWrite ? 5 : 4} className="py-6 text-white/60">
                    No assignments found.
                  </td>
                </tr>
              ) : (
                views.map((r) => (
                  <tr key={r.id} className="border-b border-white/5">
                    <td className="py-3">{r.meet_label}</td>
                    <td className="py-3">{r.event_name}</td>
                    <td className="py-3">{r.athlete_name}</td>
                    <td className="py-3">
                      <span className="text-xs px-3 py-1 rounded-full border border-white/10 text-white/80">
                        {r.status}
                      </span>
                    </td>
                    {canWrite ? (
                      <td className="py-3">
                        <button
                          className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-white hover:bg-white/10"
                          onClick={() => deleteAssignment(r.id)}
                        >
                          Delete
                        </button>
                      </td>
                    ) : null}
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
