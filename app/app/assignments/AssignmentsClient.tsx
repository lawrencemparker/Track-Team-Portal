"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type MeetRow = {
  id: string;
  name: string;
  meet_date: string;
};

type ProfileRow = {
  user_id: string;
  full_name: string;
  role: string;
};

type AssignmentView = {
  id: string;
  meet_label: string;
  event_name: string;
  athlete_name: string;
  status: string;
};

type EventChoice = {
  // We support choices from:
  // - meet_events (has meet_event_id already)
  // - events (global event list -> we will create meet_events on save)
  source: "meet_events" | "events";
  id: string; // meet_events.id OR events.id
  name: string; // event name displayed
};

function formatMeetLabel(name: string, meet_date: string) {
  const d = new Date(meet_date + "T00:00:00");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${name} - ${mm}/${dd}/${yyyy}`;
}

function safeFilename(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
}

export default function AssignmentsClient() {
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [role, setRole] = useState<string>("athlete");
  const canWrite = role === "coach" || role === "assistant_coach" || role === "assistant";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const [meets, setMeets] = useState<MeetRow[]>([]);
  const [athletes, setAthletes] = useState<ProfileRow[]>([]);
  const [myProfile, setMyProfile] = useState<ProfileRow | null>(null);

  const [selectedMeetId, setSelectedMeetId] = useState<string>("");
  const [selectedMeetLabel, setSelectedMeetLabel] = useState<string>("");

  const [eventChoices, setEventChoices] = useState<EventChoice[]>([]);
  const [selectedEventKey, setSelectedEventKey] = useState<string>(""); // "source:id"
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>("");
  const [status, setStatus] = useState<string>("assigned");

  const [rows, setRows] = useState<AssignmentView[]>([]);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const card = "rounded-3xl bg-white/5 ring-1 ring-white/10 p-6";
  const title = "text-3xl font-semibold text-white";
  const subtitle = "text-white/60 mt-1";
  const label = "text-xs text-white/60";
  const control =
    "mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-white/20 focus:ring-2 focus:ring-white/10";

  async function loadBase() {
    setError("");
    setLoading(true);

    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;

      if (uid) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("user_id, full_name, role")
          .eq("user_id", uid)
          .maybeSingle();

        if (profile) {
          setRole(profile.role ?? "athlete");
          setMyProfile(profile as ProfileRow);
        }
      }

      const { data: meetsData, error: meetsErr } = await supabase
        .from("meets")
        .select("id, name, meet_date")
        .order("meet_date", { ascending: false });

      if (meetsErr) throw meetsErr;

      const m = (meetsData ?? []) as MeetRow[];
      setMeets(m);

      const first = m[0];
      if (first) {
        setSelectedMeetId(first.id);
        setSelectedMeetLabel(formatMeetLabel(first.name, first.meet_date));
      } else {
        setSelectedMeetId("");
        setSelectedMeetLabel("");
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
      setError(e?.message ?? "Failed to load.");
    } finally {
      setLoading(false);
    }
  }

  async function loadEventsForMeet(meetId: string) {
    setError("");

    // 1) meet_events for this meet (ideal)
    const me = await supabase
      .from("meet_events")
      .select("id, meet_id, event_name")
      .eq("meet_id", meetId)
      .order("event_name", { ascending: true });

    if (!me.error) {
      const meRows = (me.data ?? []) as any[];
      if (meRows.length > 0) {
        const choices: EventChoice[] = meRows.map((r) => ({
          source: "meet_events",
          id: r.id,
          name: r.event_name,
        }));
        setEventChoices(choices);
        setSelectedEventKey(choices[0] ? `${choices[0].source}:${choices[0].id}` : "");
        return;
      }
    }

    // 2) fallback: global events table (works for brand new meets)
    // Support either events(name) or events(event_name)
    const evTry1 = await supabase.from("events").select("id, name").order("name", { ascending: true });
    if (!evTry1.error && (evTry1.data ?? []).length > 0) {
      const choices: EventChoice[] = (evTry1.data ?? []).map((r: any) => ({
        source: "events",
        id: r.id,
        name: r.name,
      }));
      setEventChoices(choices);
      setSelectedEventKey(choices[0] ? `${choices[0].source}:${choices[0].id}` : "");
      return;
    }

    const evTry2 = await supabase.from("events").select("id, event_name").order("event_name", { ascending: true });
    if (!evTry2.error && (evTry2.data ?? []).length > 0) {
      const choices: EventChoice[] = (evTry2.data ?? []).map((r: any) => ({
        source: "events",
        id: r.id,
        name: r.event_name,
      }));
      setEventChoices(choices);
      setSelectedEventKey(choices[0] ? `${choices[0].source}:${choices[0].id}` : "");
      return;
    }

    // If nothing worked, keep dropdown enabled but empty + clear selection
    setEventChoices([]);
    setSelectedEventKey("");
  }

  async function loadAssignments(meetId: string) {
    setError("");

    // Always load meet_events first; assignments are tied to meet_event_id
    const me = await supabase
      .from("meet_events")
      .select("id, meet_id, event_name")
      .eq("meet_id", meetId);

    if (me.error) {
      setError(me.error.message);
      setRows([]);
      return;
    }

    const meetEvents = (me.data ?? []) as any[];
    const meetEventIds = meetEvents.map((x) => x.id);
    const eventNameById = new Map<string, string>(meetEvents.map((x: any) => [x.id, x.event_name]));

    if (meetEventIds.length === 0) {
      setRows([]);
      return;
    }

    let q = supabase
      .from("assignments")
      .select("id, meet_event_id, athlete_id, status, created_at")
      .in("meet_event_id", meetEventIds)
      .order("created_at", { ascending: false });

    // Athlete view: filter to self
    if (!canWrite) {
      const uid = myProfile?.user_id;
      if (uid) q = q.eq("athlete_id", uid);
    }

    const { data: asn, error: asnErr } = await q;
    if (asnErr) {
      setError(asnErr.message);
      setRows([]);
      return;
    }

    const assignments = (asn ?? []) as any[];
    const athleteIds = Array.from(new Set(assignments.map((a) => a.athlete_id)));

    const nameByUserId = new Map<string, string>();
    if (canWrite) {
      athletes.forEach((a) => nameByUserId.set(a.user_id, a.full_name));
    } else if (myProfile) {
      nameByUserId.set(myProfile.user_id, myProfile.full_name);
    }

    const missing = athleteIds.filter((id) => !nameByUserId.has(id));
    if (missing.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", missing);
      (profs ?? []).forEach((p: any) => nameByUserId.set(p.user_id, p.full_name));
    }

    const meetLabel = selectedMeetLabel || "—";

    const views: AssignmentView[] = assignments.map((a) => ({
      id: a.id,
      meet_label: meetLabel,
      event_name: eventNameById.get(a.meet_event_id) ?? "—",
      athlete_name: nameByUserId.get(a.athlete_id) ?? "—",
      status: a.status ?? "",
    }));

    setRows(views);
  }

  async function ensureMeetEventId(meetId: string, choice: EventChoice): Promise<string> {
    // If already a meet_events row, use it
    if (choice.source === "meet_events") return choice.id;

    // Otherwise create (or fetch) meet_events row for this meet using the event name
    const eventName = choice.name;

    const { data, error } = await supabase
      .from("meet_events")
      .upsert(
        { meet_id: meetId, event_name: eventName },
        { onConflict: "meet_id,event_name" }
      )
      .select("id")
      .maybeSingle();

    if (error || !data?.id) {
      throw new Error(error?.message ?? "Failed to create meet event.");
    }
    return data.id as string;
  }

  async function saveAssignment() {
    setError("");
    try {
      if (!canWrite) return;
      if (!selectedMeetId) return;
      if (!selectedEventKey || !selectedAthleteId) return;

      const [src, id] = selectedEventKey.split(":");
      const choice = eventChoices.find((c) => c.source === src && c.id === id);
      if (!choice) throw new Error("Invalid event selection.");

      const meetEventId = await ensureMeetEventId(selectedMeetId, choice);

      const { error: upsertErr } = await supabase
        .from("assignments")
        .upsert(
          { meet_event_id: meetEventId, athlete_id: selectedAthleteId, status },
          { onConflict: "meet_event_id,athlete_id" }
        );

      if (upsertErr) throw upsertErr;

      // refresh meet events list so the meet now has meet_events (important for future)
      await loadEventsForMeet(selectedMeetId);
      await loadAssignments(selectedMeetId);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save assignment.");
    }
  }

  async function deleteAssignment(id: string) {
    setError("");
    try {
      if (!canWrite) return;
      const { error: delErr } = await supabase.from("assignments").delete().eq("id", id);
      if (delErr) throw delErr;
      await loadAssignments(selectedMeetId);
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete assignment.");
    }
  }

  async function downloadPdfAssignments() {
    setError("");
    if (!selectedMeetId) return;

    setDownloadingPdf(true);
    try {
      const res = await fetch(`/api/assignments/pdf?meetId=${encodeURIComponent(selectedMeetId)}`);
      if (!res.ok) {
        let msg = "";
        try {
          const j = await res.json();
          msg = j?.error ? String(j.error) : JSON.stringify(j);
        } catch {
          msg = await res.text();
        }
        throw new Error(msg || `PDF generation failed (HTTP ${res.status}).`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const filename = safeFilename(`Assignments - ${selectedMeetLabel || "Meet"}.pdf`);

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message ?? "Failed to generate PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  useEffect(() => {
    loadBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedMeetId) return;
    const m = meets.find((x) => x.id === selectedMeetId);
    if (m) setSelectedMeetLabel(formatMeetLabel(m.name, m.meet_date));
    loadEventsForMeet(selectedMeetId);
    loadAssignments(selectedMeetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMeetId]);

  const headerButton =
    "rounded-2xl bg-black/25 ring-1 ring-white/10 px-4 py-2 text-sm text-white/80 hover:bg-black/35 disabled:opacity-60";

  const primaryButton =
    "rounded-2xl py-3 px-4 text-sm font-semibold ring-1 transition w-full md:w-auto bg-white text-black ring-white/15 hover:bg-white/90 disabled:bg-white/20 disabled:text-white/55 disabled:ring-white/10 disabled:cursor-not-allowed";

  return (
    <div className="space-y-6">
      <div className={card}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className={title}>Assignments</div>
            <div className={subtitle}>Coaches assign athletes to events for a selected meet. Athletes can view only.</div>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-black/25 ring-1 ring-white/10 px-3 py-2 text-xs text-white/70">
              {canWrite ? "Coach access" : "Athlete view"}
            </div>

            <button className={headerButton} onClick={downloadPdfAssignments} disabled={loading || downloadingPdf}>
              {downloadingPdf ? "Generating…" : "Download Assignments"}
            </button>

            <button className={headerButton} onClick={loadBase} disabled={loading}>
              Refresh
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl bg-red-500/10 ring-1 ring-red-400/20 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}
      </div>

      <div className={card}>
        <div className={label}>Meet</div>
        <select className={control} value={selectedMeetId} onChange={(e) => setSelectedMeetId(e.target.value)} disabled={loading}>
          {meets.map((m) => (
            <option key={m.id} value={m.id}>
              {formatMeetLabel(m.name, m.meet_date)}
            </option>
          ))}
        </select>
      </div>

      {canWrite ? (
        <div className={card}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <div className={label}>Event</div>
              <select
                className={control}
                value={selectedEventKey}
                onChange={(e) => setSelectedEventKey(e.target.value)}
                disabled={loading}
              >
                <option value="">Select event...</option>
                {eventChoices.map((ev) => (
                  <option key={`${ev.source}:${ev.id}`} value={`${ev.source}:${ev.id}`}>
                    {ev.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className={label}>Athlete</div>
              <select
                className={control}
                value={selectedAthleteId}
                onChange={(e) => setSelectedAthleteId(e.target.value)}
                disabled={loading || athletes.length === 0}
              >
                <option value="">Select athlete...</option>
                {athletes.map((a) => (
                  <option key={a.user_id} value={a.user_id}>
                    {a.full_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className={label}>Status</div>
              <select className={control} value={status} onChange={(e) => setStatus(e.target.value)} disabled={loading}>
                <option value="assigned">assigned</option>
                <option value="alternate">alternate</option>
              </select>
            </div>

            <div className="flex md:justify-end">
              <button
                className={primaryButton}
                onClick={saveAssignment}
                disabled={!selectedEventKey || !selectedAthleteId || loading}
              >
                Save assignment
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className={card}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold text-white/90">Assignments for this meet</div>
            <div className="text-sm text-white/60 mt-1">
              Meet: <span className="text-white/80">{selectedMeetLabel || "—"}</span>
              {!canWrite && myProfile?.full_name ? (
                <>
                  {" "}
                  • Athlete: <span className="text-white/80">{myProfile.full_name}</span>
                </>
              ) : null}
            </div>
          </div>

          <div className="text-white/60 text-sm">{rows.length} records</div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-white/60">
              <tr className="border-b border-white/10">
                <th className="text-left py-3 pr-4 font-medium">Meet</th>
                <th className="text-left py-3 pr-4 font-medium">Event</th>
                <th className="text-left py-3 pr-4 font-medium">Athlete</th>
                <th className="text-left py-3 pr-4 font-medium">Status</th>
                {canWrite ? <th className="text-right py-3 font-medium">Action</th> : null}
              </tr>
            </thead>
            <tbody className="text-white/80">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={canWrite ? 5 : 4} className="py-6 text-white/50">
                    No assignments found.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b border-white/10 last:border-b-0">
                    <td className="py-4 pr-4 text-white/60">{r.meet_label}</td>
                    <td className="py-4 pr-4">{r.event_name}</td>
                    <td className="py-4 pr-4">{r.athlete_name}</td>
                    <td className="py-4 pr-4">
                      <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">
                        {r.status}
                      </span>
                    </td>
                    {canWrite ? (
                      <td className="py-4 text-right">
                        <button
                          className="rounded-full bg-white/10 px-4 py-1.5 text-xs text-white/80 hover:bg-white/20 disabled:opacity-60"
                          onClick={() => deleteAssignment(r.id)}
                          disabled={loading}
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
