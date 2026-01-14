"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export type ProfileRow = {
  user_id: string;
  full_name: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
};

type EmergencyContactRow = {
  id: string;
  athlete_user_id: string;
  contact_name: string;
  relationship: string | null;
  phone: string;
  email: string | null;
  created_at: string;
  updated_at: string;
};

type MedicationRow = {
  id: string;
  athlete_user_id: string;
  medication_name: string;
  dosage: string | null;
  instructions: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function Spinner() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function RosterClient({
  meUserId,
  canManage,
  athletes,
}: {
  meUserId: string;
  canManage: boolean;
  athletes: ProfileRow[];
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);

  // If coach/trainer: default to first athlete; if athlete: always self
  const [selectedUserId, setSelectedUserId] = useState<string>(() => {
    if (canManage) return athletes[0]?.user_id ?? meUserId;
    return meUserId;
  });

  const selectedAthlete = useMemo(
    () => athletes.find((a) => a.user_id === selectedUserId) ?? null,
    [athletes, selectedUserId]
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ================
  // Emergency contacts
  // ================
  const [contacts, setContacts] = useState<EmergencyContactRow[]>([]);
  const [contactsLoadedFor, setContactsLoadedFor] = useState<string | null>(null);

  const [ecName, setEcName] = useState("");
  const [ecRel, setEcRel] = useState("");
  const [ecPhone, setEcPhone] = useState("");
  const [ecEmail, setEcEmail] = useState("");

  async function loadEmergencyContacts(userId: string) {
    setError(null);
    setBusy(true);

    const { data, error } = await supabase
      .from("emergency_contacts")
      .select("*")
      .eq("athlete_user_id", userId)
      .order("created_at", { ascending: false });

    setBusy(false);

    if (error) {
      setError(error.message);
      setContacts([]);
      setContactsLoadedFor(userId);
      return;
    }

    setContacts((data as EmergencyContactRow[]) ?? []);
    setContactsLoadedFor(userId);

    setEcName("");
    setEcRel("");
    setEcPhone("");
    setEcEmail("");
  }

  async function addEmergencyContact() {
    if (!canManage) return;
    if (!selectedUserId) return;

    setError(null);
    setBusy(true);

    const payload = {
      athlete_user_id: selectedUserId,
      contact_name: ecName.trim(),
      relationship: ecRel.trim() || null,
      phone: ecPhone.trim(),
      email: ecEmail.trim() || null,
    };

    const { data, error } = await supabase
      .from("emergency_contacts")
      .insert(payload)
      .select("*")
      .single();

    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }

    setContacts((prev) => [data as EmergencyContactRow, ...prev]);
    setEcName("");
    setEcRel("");
    setEcPhone("");
    setEcEmail("");
  }

  async function deleteEmergencyContact(id: string) {
    if (!canManage) return;

    const ok = confirm("Delete this emergency contact?");
    if (!ok) return;

    setError(null);
    setBusy(true);

    const { error } = await supabase
      .from("emergency_contacts")
      .delete()
      .eq("id", id);

    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }

    setContacts((prev) => prev.filter((x) => x.id !== id));
  }

  // ============
  // Medications
  // ============
  const [meds, setMeds] = useState<MedicationRow[]>([]);
  const [medsLoadedFor, setMedsLoadedFor] = useState<string | null>(null);

  const [mName, setMName] = useState("");
  const [mDosage, setMDosage] = useState("");
  const [mInstructions, setMInstructions] = useState("");
  const [mNotes, setMNotes] = useState("");

  async function loadMedications(userId: string) {
    setError(null);
    setBusy(true);

    const { data, error } = await supabase
      .from("athlete_medications")
      .select("*")
      .eq("athlete_user_id", userId)
      .order("created_at", { ascending: false });

    setBusy(false);

    if (error) {
      setError(error.message);
      setMeds([]);
      setMedsLoadedFor(userId);
      return;
    }

    setMeds((data as MedicationRow[]) ?? []);
    setMedsLoadedFor(userId);

    setMName("");
    setMDosage("");
    setMInstructions("");
    setMNotes("");
  }

  async function addMedication() {
    if (!canManage) return;
    if (!selectedUserId) return;

    setError(null);
    setBusy(true);

    const payload = {
      athlete_user_id: selectedUserId,
      medication_name: mName.trim(),
      dosage: mDosage.trim() || null,
      instructions: mInstructions.trim() || null,
      notes: mNotes.trim() || null,
    };

    const { data, error } = await supabase
      .from("athlete_medications")
      .insert(payload)
      .select("*")
      .single();

    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }

    setMeds((prev) => [data as MedicationRow, ...prev]);
    setMName("");
    setMDosage("");
    setMInstructions("");
    setMNotes("");
  }

  async function deleteMedication(id: string) {
    if (!canManage) return;

    const ok = confirm("Delete this medication record?");
    if (!ok) return;

    setError(null);
    setBusy(true);

    const { error } = await supabase
      .from("athlete_medications")
      .delete()
      .eq("id", id);

    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }

    setMeds((prev) => prev.filter((x) => x.id !== id));
  }

  // Load when selection changes (both modules)
  useEffect(() => {
    if (!selectedUserId) return;

    if (contactsLoadedFor !== selectedUserId) void loadEmergencyContacts(selectedUserId);
    if (medsLoadedFor !== selectedUserId) void loadMedications(selectedUserId);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId]);

  const isAthleteView = !canManage;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Roster</h1>
            <p className="mt-2 text-sm text-white/60">
              Emergency contacts and medications are restricted by role.
            </p>
          </div>
          <div className="rounded-2xl bg-black/25 ring-1 ring-white/10 px-3 py-2 text-xs text-white/70">
            {canManage ? "Coach / Trainer access" : "My profile"}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-red-500/10 ring-1 ring-red-400/20 p-4 text-sm text-red-200">
            {error}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Athlete list (coach only) */}
        <section
          className={`rounded-3xl bg-white/5 ring-1 ring-white/10 p-4 lg:col-span-4 ${
            isAthleteView ? "hidden" : ""
          }`}
        >
          <div className="text-sm font-semibold text-white/85 px-2">
            Athletes
          </div>
          <div className="mt-3 space-y-2">
            {athletes.length === 0 ? (
              <div className="rounded-2xl bg-black/25 ring-1 ring-white/10 p-4 text-sm text-white/60">
                No athletes found.
              </div>
            ) : (
              athletes.map((a) => {
                const active = a.user_id === selectedUserId;
                return (
                  <button
                    key={a.user_id}
                    onClick={() => setSelectedUserId(a.user_id)}
                    className={[
                      "w-full text-left rounded-2xl px-4 py-3 ring-1 transition",
                      active
                        ? "bg-white text-black ring-white/15"
                        : "bg-black/20 text-white/80 ring-white/10 hover:bg-white/10",
                    ].join(" ")}
                    type="button"
                  >
                    <div className="text-sm font-semibold">
                      {a.full_name || "Unnamed athlete"}
                    </div>
                    <div className="mt-1 text-xs opacity-70">
                      {a.email || "No email"} • {a.phone || "No phone"}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* Details */}
        <section
          className={`rounded-3xl bg-white/5 ring-1 ring-white/10 p-6 lg:col-span-8 ${
            isAthleteView ? "lg:col-span-12" : ""
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm text-white/60">Selected athlete</div>
              <div className="mt-1 text-xl font-semibold">
                {selectedAthlete?.full_name || "My profile"}
              </div>
            </div>

            {busy && (
              <div className="rounded-2xl bg-black/25 ring-1 ring-white/10 px-3 py-2 text-xs text-white/70 flex items-center gap-2">
                <Spinner />
                Loading…
              </div>
            )}
          </div>

          {/* Emergency contacts card */}
          <div className="mt-6 rounded-3xl bg-black/20 ring-1 ring-white/10 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white/85">
                  Emergency contacts
                </div>
                <div className="mt-1 text-xs text-white/60">
                  {canManage
                    ? "Add, view, and remove emergency contacts for the selected athlete."
                    : "Read-only view of your emergency contacts."}
                </div>
              </div>
              {!canManage && (
                <div className="text-xs text-white/55 rounded-xl bg-white/5 ring-1 ring-white/10 px-3 py-2">
                  Read-only
                </div>
              )}
            </div>

            {canManage && (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <input
                  className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none placeholder:text-white/35 focus:border-white/20 focus:ring-2 focus:ring-white/10"
                  placeholder="Contact name"
                  value={ecName}
                  onChange={(e) => setEcName(e.target.value)}
                />
                <input
                  className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none placeholder:text-white/35 focus:border-white/20 focus:ring-2 focus:ring-white/10"
                  placeholder="Relationship (optional)"
                  value={ecRel}
                  onChange={(e) => setEcRel(e.target.value)}
                />
                <input
                  className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none placeholder:text-white/35 focus:border-white/20 focus:ring-2 focus:ring-white/10"
                  placeholder="Phone"
                  value={ecPhone}
                  onChange={(e) => setEcPhone(e.target.value)}
                />
                <input
                  className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none placeholder:text-white/35 focus:border-white/20 focus:ring-2 focus:ring-white/10"
                  placeholder="Email (optional)"
                  value={ecEmail}
                  onChange={(e) => setEcEmail(e.target.value)}
                />
                <div className="md:col-span-2">
                  <button
                    onClick={addEmergencyContact}
                    disabled={busy || !ecName.trim() || !ecPhone.trim()}
                    className={[
                      "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold ring-1 transition",
                      busy || !ecName.trim() || !ecPhone.trim()
                        ? "bg-white/20 text-white/55 ring-white/10 cursor-not-allowed"
                        : "bg-white text-black ring-white/15 hover:bg-white/90",
                    ].join(" ")}
                    type="button"
                  >
                    {busy ? <Spinner /> : null}
                    Add emergency contact
                  </button>
                </div>
              </div>
            )}

            <div className="mt-5 space-y-3">
              {contacts.length === 0 ? (
                <div className="rounded-2xl bg-black/25 ring-1 ring-white/10 p-4 text-sm text-white/60">
                  No emergency contacts on file.
                </div>
              ) : (
                contacts.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-2xl bg-black/25 ring-1 ring-white/10 p-4 flex items-start justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white/85">
                        {c.contact_name}
                        {c.relationship ? (
                          <span className="text-white/50">
                            {" "}
                            • {c.relationship}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 text-xs text-white/60">
                        {c.phone}
                        {c.email ? ` • ${c.email}` : ""}
                      </div>
                    </div>

                    {canManage && (
                      <button
                        onClick={() => deleteEmergencyContact(c.id)}
                        disabled={busy}
                        className={[
                          "rounded-xl ring-1 px-3 py-2 text-xs transition",
                          busy
                            ? "bg-white/5 text-white/45 ring-white/10 cursor-not-allowed"
                            : "bg-white/5 text-white/75 ring-white/10 hover:bg-white/10",
                        ].join(" ")}
                        type="button"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="mt-5">
              <button
                onClick={() => loadEmergencyContacts(selectedUserId)}
                disabled={busy || !selectedUserId}
                className={[
                  "rounded-2xl px-4 py-2 text-sm font-semibold ring-1 transition",
                  busy || !selectedUserId
                    ? "bg-white/10 text-white/45 ring-white/10 cursor-not-allowed"
                    : "bg-white/5 text-white/75 ring-white/10 hover:bg-white/10",
                ].join(" ")}
                type="button"
              >
                Refresh
              </button>
            </div>
          </div>

          {/* Medications card (same pattern) */}
          <div className="mt-6 rounded-3xl bg-black/20 ring-1 ring-white/10 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white/85">
                  Medications
                </div>
                <div className="mt-1 text-xs text-white/60">
                  {canManage
                    ? "Add, view, and remove medication records for the selected athlete."
                    : "Read-only view of your medication records."}
                </div>
              </div>
              {!canManage && (
                <div className="text-xs text-white/55 rounded-xl bg-white/5 ring-1 ring-white/10 px-3 py-2">
                  Read-only
                </div>
              )}
            </div>

            {canManage && (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <input
                  className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none placeholder:text-white/35 focus:border-white/20 focus:ring-2 focus:ring-white/10"
                  placeholder="Medication name"
                  value={mName}
                  onChange={(e) => setMName(e.target.value)}
                />
                <input
                  className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none placeholder:text-white/35 focus:border-white/20 focus:ring-2 focus:ring-white/10"
                  placeholder="Dosage (optional)"
                  value={mDosage}
                  onChange={(e) => setMDosage(e.target.value)}
                />
                <input
                  className="md:col-span-2 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none placeholder:text-white/35 focus:border-white/20 focus:ring-2 focus:ring-white/10"
                  placeholder="Instructions (optional)"
                  value={mInstructions}
                  onChange={(e) => setMInstructions(e.target.value)}
                />
                <input
                  className="md:col-span-2 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none placeholder:text-white/35 focus:border-white/20 focus:ring-2 focus:ring-white/10"
                  placeholder="Notes (optional)"
                  value={mNotes}
                  onChange={(e) => setMNotes(e.target.value)}
                />
                <div className="md:col-span-2">
                  <button
                    onClick={addMedication}
                    disabled={busy || !mName.trim()}
                    className={[
                      "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold ring-1 transition",
                      busy || !mName.trim()
                        ? "bg-white/20 text-white/55 ring-white/10 cursor-not-allowed"
                        : "bg-white text-black ring-white/15 hover:bg-white/90",
                    ].join(" ")}
                    type="button"
                  >
                    {busy ? <Spinner /> : null}
                    Add medication
                  </button>
                </div>
              </div>
            )}

            <div className="mt-5 space-y-3">
              {meds.length === 0 ? (
                <div className="rounded-2xl bg-black/25 ring-1 ring-white/10 p-4 text-sm text-white/60">
                  No medication records on file.
                </div>
              ) : (
                meds.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-2xl bg-black/25 ring-1 ring-white/10 p-4 flex items-start justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white/85">
                        {m.medication_name}
                        {m.dosage ? (
                          <span className="text-white/50"> • {m.dosage}</span>
                        ) : null}
                      </div>

                      {m.instructions ? (
                        <div className="mt-2 text-xs text-white/60">
                          Instructions: {m.instructions}
                        </div>
                      ) : null}

                      {m.notes ? (
                        <div className="mt-2 text-xs text-white/60">
                          Notes: {m.notes}
                        </div>
                      ) : null}
                    </div>

                    {canManage && (
                      <button
                        onClick={() => deleteMedication(m.id)}
                        disabled={busy}
                        className={[
                          "rounded-xl ring-1 px-3 py-2 text-xs transition",
                          busy
                            ? "bg-white/5 text-white/45 ring-white/10 cursor-not-allowed"
                            : "bg-white/5 text-white/75 ring-white/10 hover:bg-white/10",
                        ].join(" ")}
                        type="button"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="mt-5">
              <button
                onClick={() => loadMedications(selectedUserId)}
                disabled={busy || !selectedUserId}
                className={[
                  "rounded-2xl px-4 py-2 text-sm font-semibold ring-1 transition",
                  busy || !selectedUserId
                    ? "bg-white/10 text-white/45 ring-white/10 cursor-not-allowed"
                    : "bg-white/5 text-white/75 ring-white/10 hover:bg-white/10",
                ].join(" ")}
                type="button"
              >
                Refresh
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
