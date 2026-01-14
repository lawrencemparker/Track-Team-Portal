import { NextResponse } from "next/server";
import OpenAI from "openai";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

type Role = "coach" | "assistant" | "assistant_coach" | "athlete" | string;
type ChatMsg = { role: "user" | "assistant"; content: string };

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

function parseSeconds(markRaw: unknown): number | null {
  if (markRaw == null) return null;
  const s = String(markRaw).trim();
  if (!s) return null;

  const bad = ["DNF", "DQ", "DNS", "NT", "—", "--"];
  if (bad.includes(s.toUpperCase())) return null;

  if (s.includes(":")) {
    const parts = s.split(":").map((p) => p.trim());
    if (parts.length !== 2) return null;
    const min = Number(parts[0]);
    const sec = Number(parts[1]);
    if (!Number.isFinite(min) || !Number.isFinite(sec)) return null;
    return min * 60 + sec;
  }

  const v = Number(s);
  if (!Number.isFinite(v)) return null;
  return v;
}

function normalizeEventQuery(q: string) {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

async function getUserRoleAndName(
  supabase: any,
  userId: string
): Promise<{ role: Role; fullName: string }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return {
    role: (data?.role ?? "athlete") as Role,
    fullName: (data?.full_name ?? "User") as string,
  };
}

/**
 * Standard success response for the chat UI.
 * Return BOTH `text` and `reply` so older/newer UIs can read either.
 */
function okText(text: string) {
  const clean =
    (text || "").trim() || "I’m not sure. Can you rephrase the question?";
  return NextResponse.json({ text: clean, reply: clean }, { status: 200 });
}

/**
 * Standard error response.
 * IMPORTANT: also return `text` and `reply` so the client always has a message string
 * even when `error` exists (prevents “server did not return a response string”).
 */
function errJson(message: string, status = 500) {
  const fallback =
    "Bran-DEE couldn’t generate a response right now. Please try again.";
  return NextResponse.json(
    { error: message, text: fallback, reply: fallback },
    { status }
  );
}

export async function POST(req: Request) {
  try {
    requireEnv("OPENAI_API_KEY");
    requireEnv("NEXT_PUBLIC_SUPABASE_URL");
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

    // Next.js 16 types: cookies() is async-typed in your setup.
    // @supabase/ssr expects getAll/setAll.
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options);
              });
            } catch {
              // In some runtimes cookies may be read-only.
            }
          },
        },
      }
    );

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return errJson(authErr.message, 401);

    const user = auth?.user;
    if (!user) return errJson("Not authenticated.", 401);

    const body = await req.json().catch(() => ({}));
    const message = String(body?.message ?? "").trim();
    const history = Array.isArray(body?.history)
      ? (body.history as ChatMsg[])
      : [];

    if (!message) return errJson("Missing message.", 400);

    const { role, fullName } = await getUserRoleAndName(supabase, user.id);
    const isCoach =
      role === "coach" || role === "assistant" || role === "assistant_coach";

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "get_pinned_announcements",
          description: "Get pinned announcements (newest first).",
          parameters: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_recent_announcements",
          description: "Get recent announcements (newest first).",
          parameters: {
            type: "object",
            properties: { limit: { type: "number", default: 5 } },
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_next_meet",
          description: "Get the next upcoming meet (soonest future date).",
          parameters: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_meet_locations",
          description: "List meet names, dates, and locations if available.",
          parameters: {
            type: "object",
            properties: { limit: { type: "number", default: 10 } },
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_assignments_for_meet",
          description:
            "Get assignments for a meet. Coaches get all; athletes only get their own via RLS. Provide a meetId.",
          parameters: {
            type: "object",
            properties: { meetId: { type: "string" } },
            required: ["meetId"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_my_assignments_for_meet",
          description:
            "Get the authenticated athlete's assignments for a meet (meetId).",
          parameters: {
            type: "object",
            properties: { meetId: { type: "string" } },
            required: ["meetId"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_fastest_result",
          description:
            "Return the single fastest time for an event across results (e.g., '100m').",
          parameters: {
            type: "object",
            properties: {
              event: { type: "string" },
              limitToMeetId: { type: "string" },
            },
            required: ["event"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_top_results",
          description: "Return top N best times for an event across results.",
          parameters: {
            type: "object",
            properties: {
              event: { type: "string" },
              limit: { type: "number", default: 5 },
              limitToMeetId: { type: "string" },
            },
            required: ["event"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "lookup_profile_by_name",
          description:
            "Find profile(s) by full name search. Returns user_id and full_name (and role).",
          parameters: {
            type: "object",
            properties: { name: { type: "string" }, limit: { type: "number", default: 5 } },
            required: ["name"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_profile_contact",
          description:
            "Coach-only: return phone/email for a given user_id from profiles.",
          parameters: {
            type: "object",
            properties: { userId: { type: "string" } },
            required: ["userId"],
            additionalProperties: false,
          },
        },
      },
    ];

    async function runTool(name: string, args: any) {
      if (name === "get_pinned_announcements") {
        const { data, error } = await supabase
          .from("announcements")
          .select("id,title,body,created_at,pinned")
          .eq("pinned", true)
          .order("created_at", { ascending: false })
          .limit(10);
        if (error) return { error: error.message };
        return { announcements: data ?? [] };
      }

      if (name === "get_recent_announcements") {
        const limit = Math.max(1, Math.min(20, Number(args?.limit ?? 5)));
        const { data, error } = await supabase
          .from("announcements")
          .select("id,title,body,created_at,pinned")
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) return { error: error.message };
        return { announcements: data ?? [] };
      }

      if (name === "get_next_meet") {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const dd = String(today.getDate()).padStart(2, "0");
        const todayStr = `${yyyy}-${mm}-${dd}`;

        const { data, error } = await supabase
          .from("meets")
          .select("id,name,meet_date,location")
          .gte("meet_date", todayStr)
          .order("meet_date", { ascending: true })
          .limit(1);

        if (error) return { error: error.message };
        return { meet: (data ?? [])[0] ?? null };
      }

      if (name === "get_meet_locations") {
        const limit = Math.max(1, Math.min(50, Number(args?.limit ?? 10)));
        const { data, error } = await supabase
          .from("meets")
          .select("id,name,meet_date,location")
          .order("meet_date", { ascending: true })
          .limit(limit);
        if (error) return { error: error.message };
        return { meets: data ?? [] };
      }

      if (name === "get_assignments_for_meet") {
        const meetId = String(args?.meetId ?? "");
        if (!meetId) return { error: "meetId is required." };

        const { data, error } = await supabase
          .from("assignments")
          .select(
            `
            id,
            status,
            athlete_id,
            meet_event:meet_events(
              id,
              meet_id,
              event_name,
              events(name),
              meets(id,name,meet_date)
            ),
            athlete:profiles!assignments_athlete_id_fkey(user_id,full_name)
          `
          )
          .eq("meet_event.meet_id", meetId)
          .order("created_at", { ascending: false })
          .limit(500);

        if (error) return { error: error.message };
        return { assignments: data ?? [] };
      }

      if (name === "get_my_assignments_for_meet") {
        const meetId = String(args?.meetId ?? "");
        if (!meetId) return { error: "meetId is required." };

        const { data, error } = await supabase
          .from("assignments")
          .select(
            `
            id,
            status,
            athlete_id,
            meet_event:meet_events(
              id,
              meet_id,
              event_name,
              events(name),
              meets(id,name,meet_date)
            )
          `
          )
          .eq("meet_event.meet_id", meetId)
          .eq("athlete_id", user.id)
          .order("created_at", { ascending: false })
          .limit(300);

        if (error) return { error: error.message };
        return { assignments: data ?? [] };
      }

      if (name === "get_fastest_result" || name === "get_top_results") {
        const eventQ = normalizeEventQuery(String(args?.event ?? ""));
        if (!eventQ) return { error: "event is required (e.g., '100m')." };

        const limitToMeetId = args?.limitToMeetId
          ? String(args.limitToMeetId)
          : "";
        const limit =
          name === "get_top_results"
            ? Math.max(1, Math.min(20, Number(args?.limit ?? 5)))
            : 1;

        let q = supabase
          .from("results")
          .select(
            `
            id,
            athlete_id,
            meet_event_id,
            mark,
            created_at,
            meet_event:meet_events(
              id,
              meet_id,
              event_name,
              events(name),
              meets(id,name,meet_date)
            ),
            athlete:profiles!results_athlete_id_fkey(user_id,full_name)
          `
          )
          .order("created_at", { ascending: false })
          .limit(1500);

        if (limitToMeetId) q = q.eq("meet_event.meet_id", limitToMeetId);

        const { data, error } = await q;
        if (error) return { error: error.message };

        const rows = (data ?? []) as any[];

        const filtered = rows.filter((r) => {
          const n1 = String(r?.meet_event?.events?.name ?? "")
            .toLowerCase()
            .trim();
          const n2 = String(r?.meet_event?.event_name ?? "")
            .toLowerCase()
            .trim();
          const n = (n1 || n2).replace(/\s+/g, " ");
          if (!n) return false;

          const normalized = n
            .replace(/meter(s)?/g, "m")
            .replace(/\s+/g, " ");
          const queryNorm = eventQ
            .replace(/meter(s)?/g, "m")
            .replace(/\s+/g, " ");
          return normalized.includes(queryNorm);
        });

        const scored = filtered
          .map((r) => {
            const secs = parseSeconds(r?.mark);
            return secs == null ? null : { r, secs };
          })
          .filter(Boolean) as { r: any; secs: number }[];

        if (scored.length === 0) {
          return {
            results: [],
            note:
              "No comparable times found for that event. Marks may be missing, non-time (DNF/DQ), or stored in a different format.",
          };
        }

        scored.sort((a, b) => a.secs - b.secs);

        const best = scored.slice(0, limit).map((x) => {
          const r = x.r;
          return {
            athlete_name: r?.athlete?.full_name ?? r?.athlete_id,
            athlete_id: r?.athlete_id,
            time: r?.mark,
            time_seconds: x.secs,
            meet: r?.meet_event?.meets?.name ?? null,
            meet_date: r?.meet_event?.meets?.meet_date ?? null,
            event:
              r?.meet_event?.events?.name ??
              r?.meet_event?.event_name ??
              args?.event ??
              null,
          };
        });

        return { results: best };
      }

      if (name === "lookup_profile_by_name") {
        const q = String(args?.name ?? "").trim();
        if (!q) return { error: "name is required." };
        const limit = Math.max(1, Math.min(10, Number(args?.limit ?? 5)));

        const { data, error } = await supabase
          .from("profiles")
          .select("user_id, full_name, role")
          .ilike("full_name", `%${q}%`)
          .order("full_name", { ascending: true })
          .limit(limit);

        if (error) return { error: error.message };
        return { matches: data ?? [] };
      }

      if (name === "get_profile_contact") {
        const targetId = String(args?.userId ?? "");
        if (!targetId) return { error: "userId is required." };

        if (!isCoach) {
          return {
            error: "Athletes are not allowed to access phone/email information.",
          };
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("user_id, full_name, email, phone, role")
          .eq("user_id", targetId)
          .maybeSingle();

        if (error) return { error: error.message };
        if (!data) return { error: "No profile found." };

        return {
          profile: {
            user_id: data.user_id,
            full_name: data.full_name,
            email: data.email ?? null,
            phone: data.phone ?? null,
            role: data.role ?? null,
          },
        };
      }

      return { error: `Unknown tool: ${name}` };
    }

    const system = `
You are the Track Team Portal assistant.

Rules:
- Use tools to retrieve facts from the database. Do not guess.
- For “fastest”, “best”, “top”, “PR”, or ranking questions, use get_fastest_result or get_top_results.
- Role rules:
  - Coaches can access team-wide assignments/results and athlete profile contact (phone/email).
  - Athletes can access their own assignments/results only (enforced by RLS).
  - Athletes may ask about meets, locations, and announcements.
- If a tool returns an error or no results, explain what is missing and suggest a narrower query.
Never say “I ran out of tool steps”.
User role: ${role}. User name: ${fullName}.
`.trim();

    const msgs: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: system },
      ...history
        .filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string"
        )
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: message },
    ];

    const MAX_TOOL_ROUNDS = 8;
    let rounds = 0;

    while (rounds < MAX_TOOL_ROUNDS) {
      rounds++;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 900,
        messages: msgs,
        tools,
        tool_choice: "auto",
      });

      const assistant = completion.choices?.[0]?.message;
      if (!assistant) {
        return okText("I couldn’t generate a response. Please try again.");
      }

      if (!assistant.tool_calls || assistant.tool_calls.length === 0) {
        const text =
          assistant.content?.trim() || "I’m not sure. Can you rephrase the question?";
        return okText(text);
      }

      msgs.push({
        role: "assistant",
        content: assistant.content ?? "",
        tool_calls: assistant.tool_calls,
      });

      for (const tc of assistant.tool_calls) {
        const name = tc.function.name;
        let args: any = {};
        try {
          args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          args = {};
        }

        const result = await runTool(name, args);

        msgs.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
    }

    return okText(
      "I wasn’t able to pull everything needed to answer that in one pass. Try specifying the event (e.g., “100m”), and optionally a meet name/date or a specific athlete name."
    );
  } catch (e: any) {
    return errJson(e?.message ?? "Chat route error.", 500);
  }
}
