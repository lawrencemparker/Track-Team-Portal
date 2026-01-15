"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Role = "athlete" | "coach" | "assistant_coach";
type Gender = "male" | "female";

type AccountRow = {
  user_id: string;
  full_name: string | null;
  role: Role | null;
  gender: Gender | null;
  email: string | null;
  phone: string | null;
  created_at?: string | null;
};

type EditDraft = {
  full_name: string;
  email: string;
  phone: string;
  role: Role;
  gender: Gender | "";
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function AccountsClient() {
  const supabase = supabaseBrowser();

  const [rows, setRows] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Coach-assisted reset helper (copy/paste link workflow)
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [resetTargetEmail, setResetTargetEmail] = useState<string | null>(null);
  const [resetTargetName, setResetTargetName] = useState<string | null>(null);

  // Create form
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [newRole, setNewRole] = useState<Role>("athlete");
  const [gender, setGender] = useState<Gender | "">("");
  const [creating, setCreating] = useState(false);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [rowError, setRowError] = useState<Record<string, string | null>>({});

  // Access gate
  const [canAdmin, setCanAdmin] = useState(false);

  const inputCls =
    "w-full min-w-0 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/35 outline-none focus:border-white/20";
  const labelCls = "text-sm font-semibold text-white/80";
  const helpCls = "mt-2 text-xs text-white/60";
  const pillBtn =
    "rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60";

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    setLoading(true);
    setError(null);
    setToast(null);

    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id ?? null;

      if (!userId) {
        setCanAdmin(false);
      } else {
        const { data: prof } = await supabase
          .from("profiles")
          .select("role")
          .eq("user_id", userId)
          .maybeSingle();

        const role = (prof?.role ?? "athlete") as Role;
        setCanAdmin(role === "coach" || role === "assistant_coach");
      }

      const res = await fetch("/api/admin/accounts/list", { method: "GET" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load accounts.");
      setRows((json?.accounts ?? []) as AccountRow[]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load accounts.");
    } finally {
      setLoading(false);
    }
  }

  function setRowErr(userId: string, msg: string | null) {
    setRowError((prev) => ({ ...prev, [userId]: msg }));
  }

  async function createAccount() {
    if (!canAdmin) return;

    const fn = fullName.trim();
    const em = email.trim();
    const ph = phone.trim();
    const pw = password;

    setError(null);
    setToast(null);

    if (!fn) return setError("Name is required.");
    if (!em) return setError("Email is required.");
    if (!isValidEmail(em)) return setError("Please enter a valid email address.");
    if (!pw || pw.length < 6) return setError("Password must be at least 6 characters.");
    if (newRole === "athlete" && !gender) return setError("Gender is required for athlete accounts.");

    setCreating(true);
    try {
      const res = await fetch("/api/admin/accounts/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          full_name: fn,
          email: em,
          phone: ph || null,
          password: pw,
          role: newRole,
          gender: gender || null,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to create account.");

      setToast(`Created ${newRole} account for ${fn}.`);
      setFullName("");
      setEmail("");
      setPhone("");
      setPassword("");
      setGender("");

      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "Failed to create account.");
    } finally {
      setCreating(false);
    }
  }

  function beginEdit(r: AccountRow) {
    if (!canAdmin) return;

    setError(null);
    setToast(null);
    setRowErr(r.user_id, null);

    setEditingId(r.user_id);
    setDraft({
      full_name: (r.full_name ?? "").trim(),
      email: (r.email ?? "").trim(),
      phone: (r.phone ?? "").trim(),
      gender: (r.gender ?? "") as Gender | "",
      role: (r.role ?? "athlete") as Role,
    });
  }

  function cancelEdit() {
    if (editingId) setRowErr(editingId, null);
    setEditingId(null);
    setDraft(null);
  }

  async function saveEdit(r: AccountRow) {
    if (!canAdmin) return;
    if (!editingId || editingId !== r.user_id) return;
    if (!draft) return;

    const fn = draft.full_name.trim();
    const em = draft.email.trim();
    const ph = draft.phone.trim();
    const rl = draft.role;
    const gd = (draft.gender || null) as Gender | null;

    setError(null);
    setToast(null);
    setRowErr(r.user_id, null);

    if (!fn) return setRowErr(r.user_id, "Name is required.");
    if (!em) return setRowErr(r.user_id, "Email is required.");
    if (!isValidEmail(em)) return setRowErr(r.user_id, "Please enter a valid email address.");
    if (rl === "athlete" && !gd) return setRowErr(r.user_id, "Gender is required for athlete accounts.");

    setBusyId(r.user_id);

    // Optimistic update
    setRows((prev) =>
      prev.map((x) =>
        x.user_id === r.user_id
          ? { ...x, full_name: fn, email: em, phone: ph || null, role: rl, gender: gd }
          : x
      )
    );

    try {
      const res = await fetch("/api/admin/accounts/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user_id: r.user_id,
          full_name: fn,
          email: em,
          phone: ph || null,
          gender: rl === "athlete" ? gd : null,
          role: rl,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to update account.");

      if (json?.account?.user_id) {
        setRows((prev) => prev.map((x) => (x.user_id === r.user_id ? (json.account as AccountRow) : x)));
      }

      setToast("Account updated.");
      setEditingId(null);
      setDraft(null);
    } catch (e: any) {
      setRowErr(r.user_id, e?.message ?? "Failed to update account.");
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  // Delete: MUST confirm before deleting
  async function deleteAccount(r: AccountRow) {
    if (!canAdmin) return;

    const label = r.full_name ?? r.email ?? "this user";
    const ok = window.confirm(`Delete account for ${label}?\n\nThis will permanently remove the user.`);
    if (!ok) return;

    setError(null);
    setToast(null);
    setBusyId(r.user_id);

    try {
      const res = await fetch("/api/admin/accounts/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: r.user_id }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to delete account.");

      setToast("Account deleted.");
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete account.");
    } finally {
      setBusyId(null);
    }
  }

  // Reset password: coach-assisted copy/paste reset link workflow
  async function requestPasswordReset(r: AccountRow) {
    if (!canAdmin) return;

    const em = (r.email ?? "").trim();
    if (!em) return setError("No email found for this account.");
    if (!isValidEmail(em)) return setError("Please enter a valid email address for this account.");

    setError(null);
    setToast(null);
    setBusyId(r.user_id);

    try {
      const res = await fetch("/api/admin/send-password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: em }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to generate reset link.");

      // IMPORTANT: existing backend returns reset_link (coach-assisted workflow)
      const link = (json?.reset_link ?? null) as string | null;
      if (!link) throw new Error("Reset link was not returned.");

      setResetLink(link);
      setResetTargetEmail(em);
      setResetTargetName((r.full_name ?? "").trim() || em);
    } catch (e: any) {
      setError(e?.message ?? "Failed to generate reset link.");
    } finally {
      setBusyId(null);
    }
  }

  function closeResetCard() {
    setResetLink(null);
    setResetTargetEmail(null);
    setResetTargetName(null);
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setToast("Copied.");
    } catch {
      setToast("Copy failed. Please copy manually.");
    }
  }

  const mailtoLink =
    resetLink && resetTargetEmail
      ? `mailto:${resetTargetEmail}?subject=${encodeURIComponent(
          "Track Team Portal password reset link"
        )}&body=${encodeURIComponent(
          `Hi${resetTargetName ? ` ${resetTargetName}` : ""},\n\nHere is your password reset link for the Track Team Portal:\n\n${resetLink}\n\nOpen the link and set a new password.\n\n— Coach`
        )}`
      : null;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-3xl font-bold text-white">Accounts</div>
            <div className="mt-1 text-sm text-white/70">Manage coach, assistant coach, and athlete accounts.</div>
          </div>

          <button type="button" onClick={refresh} className={pillBtn} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      {/* Toast / Error */}
      <div className="mt-6">
        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {toast ? (
          <div className="mt-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-200">
            {toast}
          </div>
        ) : null}
      </div>

      {/* Password reset helper */}
      {resetLink ? (
        <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-base font-semibold text-white">
                Password reset link for {resetTargetName ?? "account"}
              </div>
              <div className="mt-1 text-sm text-white/70">
                Copy the link and send it from your email client. The app will not send emails.
              </div>
            </div>

            <button type="button" onClick={closeResetCard} className={pillBtn}>
              Close
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/80 break-all">
            {resetLink}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className={pillBtn} onClick={() => copyToClipboard(resetLink)}>
              Copy link
            </button>

            {mailtoLink ? (
              <a href={mailtoLink} className={pillBtn}>
                Copy &amp; email
              </a>
            ) : null}

            <a href={resetLink} target="_blank" rel="noreferrer" className={pillBtn}>
              Open link
            </a>
          </div>
        </div>
      ) : null}

      {/* Create account */}
      <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-8">
        <div className="text-lg font-semibold text-white">Create account</div>
        <div className="mt-1 text-sm text-white/70">Create athlete / coach / assistant coach accounts.</div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <div className={labelCls}>Name</div>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g., Marcus Reed"
              className={`mt-2 ${inputCls}`}
              disabled={creating}
            />
          </div>

          <div>
            <div className={labelCls}>Email</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g., marcus@school.edu"
              type="email"
              className={`mt-2 ${inputCls}`}
              disabled={creating}
            />
          </div>

          <div>
            <div className={labelCls}>Phone</div>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(optional)"
              className={`mt-2 ${inputCls}`}
              disabled={creating}
            />
            <div className={helpCls}>Optional.</div>
          </div>

          <div>
            <div className={labelCls}>Password</div>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="min 6 characters"
              type="password"
              className={`mt-2 ${inputCls}`}
              disabled={creating}
            />
            <div className={helpCls}>Minimum 6 characters.</div>
          </div>

          <div>
            <div className={labelCls}>Role</div>
            <select
              value={newRole}
              onChange={(e) => {
                const v = e.target.value as Role;
                setNewRole(v);
                if (v !== "athlete") setGender("");
              }}
              className={`mt-2 ${inputCls}`}
              disabled={creating}
            >
              <option value="athlete">athlete</option>
              <option value="assistant_coach">assistant_coach</option>
              <option value="coach">coach</option>
            </select>
          </div>

          <div>
            <div className={labelCls}>Gender</div>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value as Gender)}
              className={`mt-2 ${inputCls}`}
              disabled={creating || newRole !== "athlete"}
            >
              <option value="">Select…</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
            <div className={helpCls}>
              {newRole === "athlete" ? "Required for athletes." : "Only applicable to athlete accounts."}
            </div>
          </div>

          <div className="flex items-end justify-end">
            <button
              type="button"
              onClick={createAccount}
              disabled={!canAdmin || creating}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? "Creating…" : "Create account"}
            </button>
          </div>
        </div>
      </div>

      {/* Accounts table */}
      <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-white">All accounts</div>
          </div>
          <div className="text-sm text-white/70">{rows.length} records</div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full table-fixed text-left">
            <thead>
              <tr className="text-xs font-semibold tracking-wide text-white/70">
                <th className="pb-3 w-[26%]">Name</th>
                <th className="pb-3 w-[32%]">Email</th>
                <th className="pb-3 w-[14%]">Role</th>
                <th className="pb-3 w-[12%]">Gender</th>
                <th className="pb-3 w-[16%]">Actions</th>
              </tr>
            </thead>

            <tbody className="text-sm text-white/90">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-white/60">
                    {loading ? "Loading…" : "No accounts found."}
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const isEditing = editingId === r.user_id;
                  const rowBusy = busyId === r.user_id;

                  return (
                    <tr key={r.user_id} className="border-t border-white/10 align-top">
                      <td className="py-4 pr-3">
                        {isEditing && draft ? (
                          <div className="space-y-2">
                            <input
                              value={draft.full_name}
                              onChange={(e) => setDraft({ ...draft, full_name: e.target.value })}
                              className={inputCls}
                              disabled={rowBusy}
                            />
                            <input
                              value={draft.phone}
                              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                              className={inputCls}
                              disabled={rowBusy}
                              placeholder="Phone (optional)"
                            />
                          </div>
                        ) : (
                          <>
                            <div className="font-medium text-white break-words">{r.full_name ?? "—"}</div>
                            {r.phone ? <div className="mt-1 text-xs text-white/60 break-words">{r.phone}</div> : null}
                          </>
                        )}

                        {rowError[r.user_id] ? <div className="mt-2 text-xs text-red-200">{rowError[r.user_id]}</div> : null}
                      </td>

                      <td className="py-4 pr-3">
                        {isEditing && draft ? (
                          <input
                            value={draft.email}
                            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                            type="email"
                            className={inputCls}
                            disabled={rowBusy}
                          />
                        ) : (
                          <span className="text-white break-words">{r.email ?? "—"}</span>
                        )}
                      </td>

                      <td className="py-4 pr-3">
                        {isEditing && draft ? (
                          <select
                            value={draft.role}
                            onChange={(e) => {
                              const v = e.target.value as Role;
                              setDraft({ ...draft, role: v, gender: v === "athlete" ? draft.gender : "" });
                            }}
                            className={inputCls}
                            disabled={rowBusy}
                          >
                            <option value="athlete">athlete</option>
                            <option value="assistant_coach">assistant_coach</option>
                            <option value="coach">coach</option>
                          </select>
                        ) : (
                          <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
                            {r.role ?? "athlete"}
                          </span>
                        )}
                      </td>

                      <td className="py-4 pr-3">
                        {isEditing && draft ? (
                          <select
                            value={draft.gender}
                            onChange={(e) => setDraft({ ...draft, gender: e.target.value as Gender | "" })}
                            className={inputCls}
                            disabled={rowBusy || draft.role !== "athlete"}
                          >
                            <option value="">{draft.role === "athlete" ? "Select…" : "—"}</option>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                          </select>
                        ) : (
                          <span className="text-white/80">{r.gender ? (r.gender === "male" ? "Male" : "Female") : "—"}</span>
                        )}
                      </td>

                      <td className="py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          {isEditing ? (
                            <>
                              <button type="button" className={pillBtn} disabled={rowBusy} onClick={() => saveEdit(r)}>
                                Save
                              </button>
                              <button type="button" className={pillBtn} disabled={rowBusy} onClick={cancelEdit}>
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button type="button" className={pillBtn} disabled={!canAdmin || rowBusy} onClick={() => beginEdit(r)}>
                                Edit
                              </button>

                              <button
                                type="button"
                                className={pillBtn}
                                disabled={!canAdmin || rowBusy || !r.email}
                                onClick={() => requestPasswordReset(r)}
                              >
                                Reset password
                              </button>

                              <button type="button" className={pillBtn} disabled={!canAdmin || rowBusy} onClick={() => deleteAccount(r)}>
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
