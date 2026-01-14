"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export type MeetRow = {
  id: string;
  name: string;
  location: string;
  meet_date: string; // yyyy-mm-dd
  start_time: string | null; // HH:MM:SS or null
  bus_time: string | null;   // HH:MM:SS or null
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function formatTime(t: string | null) {
  if (!t) return "—";
  // Supabase may return HH:MM:SS. We’ll display HH:MM.
  return t.slice(0, 5);
}

function formatDate(d: string) {
  // Input is yyyy-mm-dd. Display as “Mon, Jan 10”.
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function MeetsClient({
  initialMeets,
  canManage,
}: {
  initialMeets: MeetRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [meets, setMeets] = useState<MeetRow[]>(initialMeets);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [meetDate, setMeetDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [busTime, setBusTime] = useState("");
  const [notes, setNotes] = useState("");

  // Edit state (simple inline editor)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Partial<MeetRow>>({});

  function resetCreateForm() {
    setName("");
    setLocation("");
    setMeetDate("");
    setStartTime("");
    setBusTime("");
    setNotes("");
  }

  async function reloadFromServer() {
    // Refresh the server components (layout + page data) and also keep local meets in sync
    router.refresh();
    // We still keep local state for immediate UX; after refresh, user navigation keeps it fresh.
  }

  async function createMeet(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;

    setError(null);
    setBusy(true);

    const payload = {
      name: name.trim(),
      location: location.trim(),
      meet_date: meetDate, // yyyy-mm-dd
      start_time: startTime ? `${startTime}:00` : null, // HH:MM:00
      bus_time: busTime ? `${busTime}:00` : null,
      notes: notes.trim() ? notes.trim() : null,
    };

    const { data, error } = await supabase
      .from("meets")
      .insert(payload)
      .select("*")
      .single();

    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }

    setMeets((prev) => [data as MeetRow, ...prev].sort((a, b) => b.meet_date.localeCompare(a.meet_date)));
    resetCreateForm();
    await reloadFromServer();
  }

  async function startEdit(m: MeetRow) {
    setEditingId(m.id);
    setEdit({
      name: m.name,
      location: m.location,
      meet_date: m.meet_date,
      start_time: m.start_time ? m.start_time.slice(0, 5) : "",
      bus_time: m.bus_time ? m.bus_time.slice(0, 5) : "",
      notes: m.notes ?? "",
    });
  }

  async function cancelEdit() {
    setEditingId(null);
    setEdit({});
  }

  async function saveEdit(id: string) {
    if (!canManage) return;
    setError(null);
    setBusy(true);

    const updatePayload = {
      name: (edit.name ?? "").toString().trim(),
      location: (edit.location ?? "").toString().trim(),
      meet_date: (edit.meet_date ?? "").toString(),
      start_time: (edit.start_time ?? "").toString()
        ? `${String(edit.start_time).slice(0, 5)}:00`
        : null,
      bus_time: (edit.bus_time ?? "").toString()
        ? `${String(edit.bus_time).slice(0, 5)}:00`
        : null,
      notes: (edit.notes ?? "").toString().trim() ? String(edit.notes).trim() : null,
    };

    const { data, error } = await supabase
      .from("meets")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();

    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }

    setMeets((prev) =>
      prev
        .map((m) => (m.id === id ? (data as MeetRow) : m))
        .sort((a, b) => b.meet_date.localeCompare(a.meet_date))
    );

    setEditingId(null);
    setEdit({});
    await reloadFromServer();
  }

  async function deleteMeet(id: string) {
    if (!canManage) return;
    const ok = confirm("Delete this meet? This cannot be undone.");
    if (!ok) return;

    setError(null);
    setBusy(true);

    const { error } = await supabase.from("meets").delete().eq("id", id);

    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }

    setMeets((prev) => prev.filter((m) => m.id !== id));
    await reloadFromServer();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Meets</h1>
            <p className="mt-2 text-sm text-white/60">
              Schedule, locations, times, and meet notes.
            </p>
          </div>

          <div className="rounded-2xl bg-black/25 ring-1 ring-white/10 px-3 py-2 text-xs text-white/70">
            {canManage ? "Coach access" : "Read-only"}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-red-500/10 ring-1 ring-red-400/20 p-4 text-sm text-red-200">
            {error}
          </div>
        )}
      </div>

      {canManage && (
        <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-6">
          <h2 className="text-sm font-semibold text-white/85">Add meet</h2>

          <form onSubmit={createMeet} className="mt-4 grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-xs text-white/60">Meet name</span>
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none placeholder:text-white/35 focus:border-white/20 focus:ring-2 focus:ring-white/10"
                  placeholder="County Invitational"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>

              <label className="block">
                <span className="text-xs text-white/60">Location</span>
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none placeholder:text-white/35 focus:border-white/20 focus:ring-2 focus:ring-white/10"
                  placeholder="Central Stadium"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  required
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="block">
                <span className="text-xs text-white/60">Meet date</span>
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-white/20 focus:ring-2 focus:ring-white/10"
                  type="date"
                  value={meetDate}
                  onChange={(e) => setMeetDate(e.target.value)}
                  required
                />
              </label>

              <label className="block">
                <span className="text-xs text-white/60">Start time (optional)</span>
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-white/20 focus:ring-2 focus:ring-white/10"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </label>

              <label className="block">
                <span className="text-xs text-white/60">Bus time (optional)</span>
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-white/20 focus:ring-2 focus:ring-white/10"
                  type="time"
                  value={busTime}
                  onChange={(e) => setBusTime(e.target.value)}
                />
              </label>
            </div>

            <label className="block">
              <span className="text-xs text-white/60">Notes (optional)</span>
              <textarea
                className="mt-2 w-full min-h-[96px] rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none placeholder:text-white/35 focus:border-white/20 focus:ring-2 focus:ring-white/10"
                placeholder="Bus departs 2:15 PM. Bring uniform and spikes."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>

            <button
              disabled={busy}
              className={[
                "rounded-2xl py-3 px-4 text-sm font-semibold ring-1 transition w-full md:w-auto",
                busy
                  ? "bg-white/20 text-white/55 ring-white/10 cursor-not-allowed"
                  : "bg-white text-black ring-white/15 hover:bg-white/90",
              ].join(" ")}
              type="submit"
            >
              {busy ? "Saving…" : "Add meet"}
            </button>
          </form>
        </div>
      )}

      <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-6">
        <h2 className="text-sm font-semibold text-white/85">All meets</h2>

        <div className="mt-4 space-y-3">
          {meets.length === 0 ? (
            <div className="rounded-2xl bg-black/25 ring-1 ring-white/10 p-4 text-sm text-white/60">
              No meets yet.
            </div>
          ) : (
            meets.map((m) => {
              const isEditing = editingId === m.id;

              return (
                <div
                  key={m.id}
                  className="rounded-2xl bg-black/25 ring-1 ring-white/10 p-4"
                >
                  {!isEditing ? (
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white/85">
                          {m.name}
                        </div>
                        <div className="mt-1 text-xs text-white/55">
                          {formatDate(m.meet_date)} • {m.location}
                        </div>
                        <div className="mt-3 text-xs text-white/60">
                          Start: {formatTime(m.start_time)} • Bus: {formatTime(m.bus_time)}
                        </div>
                        {m.notes && (
                          <div className="mt-3 text-xs text-white/60">
                            Notes: {m.notes}
                          </div>
                        )}
                      </div>

                      {canManage && (
                        <div className="flex shrink-0 gap-2">
                          <button
                            disabled={busy}
                            onClick={() => startEdit(m)}
                            className="rounded-xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-xs text-white/75 hover:bg-white/10 disabled:opacity-60"
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => deleteMeet(m.id)}
                            className="rounded-xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-xs text-white/75 hover:bg-white/10 disabled:opacity-60"
                            type="button"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="block">
                          <span className="text-xs text-white/60">Meet name</span>
                          <input
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-white/20 focus:ring-2 focus:ring-white/10"
                            value={(edit.name as string) ?? ""}
                            onChange={(e) => setEdit((p) => ({ ...p, name: e.target.value }))}
                            required
                          />
                        </label>

                        <label className="block">
                          <span className="text-xs text-white/60">Location</span>
                          <input
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-white/20 focus:ring-2 focus:ring-white/10"
                            value={(edit.location as string) ?? ""}
                            onChange={(e) => setEdit((p) => ({ ...p, location: e.target.value }))}
                            required
                          />
                        </label>
                      </div>

                      <div className="grid gap-3 md:grid-cols-3">
                        <label className="block">
                          <span className="text-xs text-white/60">Meet date</span>
                          <input
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-white/20 focus:ring-2 focus:ring-white/10"
                            type="date"
                            value={(edit.meet_date as string) ?? ""}
                            onChange={(e) => setEdit((p) => ({ ...p, meet_date: e.target.value }))}
                            required
                          />
                        </label>

                        <label className="block">
                          <span className="text-xs text-white/60">Start time</span>
                          <input
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-white/20 focus:ring-2 focus:ring-white/10"
                            type="time"
                            value={(edit.start_time as string) ?? ""}
                            onChange={(e) => setEdit((p) => ({ ...p, start_time: e.target.value }))}
                          />
                        </label>

                        <label className="block">
                          <span className="text-xs text-white/60">Bus time</span>
                          <input
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-white/20 focus:ring-2 focus:ring-white/10"
                            type="time"
                            value={(edit.bus_time as string) ?? ""}
                            onChange={(e) => setEdit((p) => ({ ...p, bus_time: e.target.value }))}
                          />
                        </label>
                      </div>

                      <label className="block">
                        <span className="text-xs text-white/60">Notes</span>
                        <textarea
                          className="mt-2 w-full min-h-[96px] rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-white/20 focus:ring-2 focus:ring-white/10"
                          value={(edit.notes as string) ?? ""}
                          onChange={(e) => setEdit((p) => ({ ...p, notes: e.target.value }))}
                        />
                      </label>

                      <div className="flex gap-2">
                        <button
                          disabled={busy}
                          onClick={() => saveEdit(m.id)}
                          className={[
                            "rounded-2xl px-4 py-2 text-sm font-semibold ring-1 transition",
                            busy
                              ? "bg-white/20 text-white/55 ring-white/10 cursor-not-allowed"
                              : "bg-white text-black ring-white/15 hover:bg-white/90",
                          ].join(" ")}
                          type="button"
                        >
                          {busy ? "Saving…" : "Save"}
                        </button>
                        <button
                          disabled={busy}
                          onClick={cancelEdit}
                          className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-2 text-sm text-white/75 hover:bg-white/10 disabled:opacity-60"
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
