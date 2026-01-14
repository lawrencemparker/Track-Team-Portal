"use client";

import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export type AnnouncementRow = {
  id: string;
  title: string | null;
  body: string | null;
  pinned?: boolean | null;
  created_at: string;
  updated_at?: string | null;
};

function formatPosted(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AnnouncementsClient({
  initialAnnouncements,
  canManage,
  roleLabel,
}: {
  initialAnnouncements: AnnouncementRow[];
  canManage: boolean;
  roleLabel?: string;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [rows, setRows] = useState<AnnouncementRow[]>(sortRows(initialAnnouncements ?? []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);

  function sortRows(list: AnnouncementRow[]) {
    return [...list].sort((a, b) => {
      const at = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bt - at; // newest first
    });
  }

  async function refresh() {
    setError(null);
    setBusy(true);

    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false });

    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }

    setRows(sortRows((data ?? []) as AnnouncementRow[]));
  }

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setBody("");
    setPinned(false);
  }

  function startEdit(row: AnnouncementRow) {
    if (!canManage) return;
    setEditingId(row.id);
    setTitle(row.title ?? "");
    setBody(row.body ?? "");
    setPinned(Boolean(row.pinned));
  }

  async function save() {
    if (!canManage) return;
    const isEditing = Boolean(editingId);

    const t = title.trim();
    if (!t) {
      setError("Title is required.");
      return;
    }

    setError(null);
    setBusy(true);

    const payload = {
      title: t,
      body: body.trim() ? body.trim() : null,
      pinned: Boolean(pinned),
    };

    const res = isEditing
      ? await supabase.from("announcements").update(payload).eq("id", editingId!)
      : await supabase.from("announcements").insert(payload);

    setBusy(false);

    if (res.error) {
      setError(res.error.message);
      return;
    }

    resetForm();
    await refresh();
  }

  async function remove(id: string) {
    if (!canManage) return;

    setError(null);
    setBusy(true);

    const res = await supabase.from("announcements").delete().eq("id", id);

    setBusy(false);

    if (res.error) {
      setError(res.error.message);
      return;
    }

    if (editingId === id) resetForm();
    await refresh();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold">Announcements</div>
          <div className="mt-1 text-sm text-white/60">
            {roleLabel ? `${roleLabel} view` : "Team view"}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
            disabled={busy}
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {/* Create / Edit */}
      {canManage ? (
        <div className="glass rounded-3xl p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">
                {editingId ? "Edit announcement" : "Create announcement"}
              </div>
              <div className="mt-1 text-xs text-white/60">
                Announcements are visible to all users.
              </div>
            </div>

            <div className="flex items-center gap-2">
              {editingId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
                  disabled={busy}
                >
                  Cancel
                </button>
              ) : null}
              <button
                type="button"
                onClick={save}
                className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-60"
                disabled={busy}
              >
                {editingId ? "Save" : "Post"}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-4">
            <div>
              <div className="text-xs font-semibold text-white/60">Title</div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-white/20"
                placeholder="Announcement title"
                disabled={busy}
              />
            </div>

            <div>
              <div className="text-xs font-semibold text-white/60">Body</div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="mt-2 min-h-[120px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-white/20"
                placeholder="Details (optional)"
                disabled={busy}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
                className="h-4 w-4"
                disabled={busy}
              />
              Pin this announcement
            </label>
          </div>
        </div>
      ) : null}

      {/* Recent announcements */}
      <div className="glass rounded-3xl p-6">
        <div className="flex items-end justify-between">
          <div className="text-sm font-semibold">Recent announcements</div>
          <div className="text-xs text-white/60">{rows.length} records</div>
        </div>

        <div className="mt-4 space-y-3">
          {rows.length === 0 ? (
            <div className="text-sm text-white/60">No announcements yet.</div>
          ) : (
            rows.map((a) => (
              <div key={a.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-white/90">
                        {a.title ?? "Untitled"}
                      </div>
                      {a.pinned ? (
                        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[11px] text-white/70">
                          pinned
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 text-xs text-white/55">{formatPosted(a.created_at)}</div>
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(a)}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
                        disabled={busy}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(a.id)}
                        className="rounded-xl border border-red-400/20 bg-white/5 px-3 py-1.5 text-xs text-red-200 hover:bg-white/10"
                        disabled={busy}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                {a.body ? (
                  <div className="mt-3 whitespace-pre-wrap text-sm text-white/80">{a.body}</div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
