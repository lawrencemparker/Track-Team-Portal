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

function normalizeGenderReply(raw: string): "male" | "female" | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;

  if (["male", "m", "man", "men", "boy", "boys"].includes(s)) return "male";
  if (["female", "f", "woman", "women", "girl", "girls"].includes(s))
    return "female";

  return null;
}

function assistantAskedGender(raw: string): boolean {
  const s = String(raw ?? "").toLowerCase();
  return (
    s.includes("do you want male or female") ||
    s.includes("male or female") ||
    s.includes("which gender")
  );
}

function normalizeEventQuery(q: string) {
  const s = String(q ?? "").trim().toLowerCase();
  if (!s) return "";

  // Normalize common variants
  const map: Record<string, string> = {
    "100": "100m",
    "100 meters": "100m",
    "100 metre": "100m",
    "100 meter": "100m",
    "100m": "100m",

    "200": "200m",
    "200 meters": "200m",
    "200 metre": "200m",
    "200 meter": "200m",
    "200m": "200m",

    "400": "400m",
    "400 meters": "400m",
    "400 metre": "400m",
    "400 meter": "400m",
    "400m": "400m",

    "800": "800m",
    "800 meters": "800m",
    "800 metre": "800m",
    "800 meter": "800m",
    "800m": "800m",

    "1600": "1600m",
    "1600 meters": "1600m",
    "1600m": "1600m",
    mile: "mile",

    "110h": "110h",
    "110 hurdles": "110h",
    "110m hurdles": "110h",
    "100h": "100h",
    "100 hurdles": "100h",

    "4x100": "4x100",
    "4 x 100": "4x100",
    "4x100 relay": "4x100",

    "4x400": "4x400",
    "4 x 400": "4x400",
    "4x400 relay": "4x400",
  };

  return map[s] ?? s;
}

function errJson(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Standard success response for the chat UI.
 * Return BOTH `text` and `reply` so older/newer UIs can read either.
 */
function okText(text: string) {
  const clean =
    (text || "").trim() || "I'm not sure. Can you rephrase the question?";
  return NextResponse.json({ text: clean, reply: clean });
}

async function getUserRoleAndName(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { role: "athlete" as Role, fullName: "User" };
  }

  return {
    role: (data?.role ?? "athlete") as Role,
    fullName: (data?.full_name ?? "User") as string,
  };
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

    const body = await req.json().catch(() => ({} as any));
    const message = String((body as any)?.message ?? "").trim();
    const history = Array.isArray((body as any)?.history)
      ? ((body as any).history as ChatMsg[])
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
          name: "get_meets",
          description:
            "List meets (id, name, meet_date). Optionally filter by year.",
          parameters: {
            type: "object",
            properties: { year: { type: "number" } },
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_roster",
          description:
            "List athletes on the roster. Coaches only. Returns full_name and user_id.",
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
          name: "get_assignments_for_user",
          description:
            "Get assignments for the authenticated user (athlete). Returns newest first.",
          parameters: {
            type: "object",
            properties: { meetId: { type: "string" } },
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_assignments_for_athlete",
          description:
            "Get assignments for a specific athlete by user_id. Coaches only.",
          parameters: {
            type: "object",
            properties: {
              athleteUserId: { type: "string" },
              meetId: { type: "string" },
            },
            required: ["athleteUserId"],
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
              gender: {
                type: "string",
                enum: ["male", "female"],
                description:
                  'Optional gender filter for athlete results. Use "male" or "female".',
              },
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
              gender: {
                type: "string",
                enum: ["male", "female"],
                description:
                  'Optional gender filter for athlete results. Use "male" or "female".',
              },
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
          name: "get_announcements",
          description: "Get announcements (newest first).",
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
          name: "get_profile_contact",
          description:
            "Get email/phone/contact info for an athlete profile. Coaches only.",
          parameters: {
            type: "object",
            properties: { athleteUserId: { type: "string" } },
            required: ["athleteUserId"],
            additionalProperties: false,
          },
        },
      },
    ];

    async function runTool(
      name: string,
      args: Record<string, any> | null | undefined
    ) {
      if (name === "get_meets") {
        const year = args?.year ? Number(args.year) : null;

        let q = supabase
          .from("meets")
          .select("id,name,meet_date")
          .order("meet_date", { ascending: true })
          .limit(200);

        if (Number.isFinite(year) && year) {
          const start = `${year}-01-01`;
          const end = `${year}-12-31`;
          q = q.gte("meet_date", start).lte("meet_date", end);
        }

        const { data, error } = await q;
        if (error) return { error: error.message };
        return { meets: data ?? [] };
      }

      if (name === "get_roster") {
        if (!isCoach) return { error: "Coaches only." };

        const { data, error } = await supabase
          .from("profiles")
          .select("user_id,full_name,role")
          .neq("role", "coach")
          .order("full_name", { ascending: true })
          .limit(400);

        if (error) return { error: error.message };
        return {
          roster:
            (data ?? [])
              .filter((r: any) => (r?.role ?? "") === "athlete")
              .map((r: any) => ({ user_id: r.user_id, full_name: r.full_name })) ??
            [],
        };
      }

      if (name === "get_assignments_for_user") {
        const meetId = args?.meetId ? String(args.meetId) : "";

        let q = supabase
          .from("assignments")
          .select(
            `
            id,
            athlete_id,
            meet_event_id,
            reps,
            notes,
            created_at,
            meet_event:meet_events(
              id,
              meet_id,
              event_name,
              events(name),
              meets(id,name,meet_date)
            )
          `
          )
          .eq("athlete_id", user.id)
          .order("created_at", { ascending: false })
          .limit(300);

        if (meetId) q = q.eq("meet_event.meet_id", meetId);

        const { data, error } = await q;
        if (error) return { error: error.message };
        return { assignments: data ?? [] };
      }

      if (name === "get_assignments_for_athlete") {
        if (!isCoach) return { error: "Coaches only." };

        const athleteUserId = String(args?.athleteUserId ?? "");
        if (!athleteUserId) return { error: "athleteUserId is required." };

        const meetId = args?.meetId ? String(args.meetId) : "";

        let q = supabase
          .from("assignments")
          .select(
            `
            id,
            athlete_id,
            meet_event_id,
            reps,
            notes,
            created_at,
            meet_event:meet_events(
              id,
              meet_id,
              event_name,
              events(name),
              meets(id,name,meet_date)
            )
          `
          )
          .eq("athlete_id", athleteUserId)
          .order("created_at", { ascending: false })
          .limit(300);

        if (meetId) q = q.eq("meet_event.meet_id", meetId);

        const { data, error } = await q;
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

        const genderRaw = String(args?.gender ?? "").trim().toLowerCase();
        const genderFilter =
          genderRaw === "male" || genderRaw === "female" ? genderRaw : "";

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
            athlete:profiles!results_athlete_id_fkey(user_id,full_name,gender)
          `
          )
          .order("created_at", { ascending: false })
          .limit(1500);

        if (limitToMeetId) q = q.eq("meet_event.meet_id", limitToMeetId);

        const { data, error } = await q;
        if (error) return { error: error.message };

        const rows = (data ?? []) as any[];

        const filtered = rows.filter((r) => {
          if (genderFilter) {
            const g = String(r?.athlete?.gender ?? "").toLowerCase().trim();
            if (g !== genderFilter) return false;
          }

          const n1 = String(r?.meet_event?.events?.name ?? "")
            .toLowerCase()
            .trim();
          const n2 = String(r?.meet_event?.event_name ?? "")
            .toLowerCase()
            .trim();

          // Match by normalized event query appearing in either name field
          return (
            n1 === eventQ ||
            n2 === eventQ ||
            n1.includes(eventQ) ||
            n2.includes(eventQ)
          );
        });

        const scored = filtered
          .map((r) => {
            const secs = parseSeconds(r?.mark);
            if (secs == null) return null;
            return { r, secs };
          })
          .filter(Boolean) as { r: any; secs: number }[];

        if (!scored.length) return { results: [] };

        // Lower time is better
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

        if (name === "get_fastest_result") return { fastest: best[0] };
        return { results: best };
      }

      if (name === "get_announcements") {
        const limit = Math.max(1, Math.min(50, Number(args?.limit ?? 10)));
        const { data, error } = await supabase
          .from("announcements")
          .select("id,title,body,created_at")
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) return { error: error.message };
        return { announcements: data ?? [] };
      }

      if (name === "get_recent_announcements") {
        const limit = Math.max(1, Math.min(20, Number(args?.limit ?? 5)));
        const { data, error } = await supabase
          .from("announcements")
          .select("id,title,body,created_at")
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) return { error: error.message };
        return { announcements: data ?? [] };
      }

      if (name === "get_profile_contact") {
        if (!isCoach) return { error: "Coaches only." };

        const athleteUserId = String(args?.athleteUserId ?? "");
        if (!athleteUserId) return { error: "athleteUserId is required." };

        const { data, error } = await supabase
          .from("profiles")
          .select("user_id,full_name,email,phone,role")
          .eq("user_id", athleteUserId)
          .maybeSingle();

        if (error) return { error: error.message };
        if (!data) return { error: "Profile not found." };

        return {
          profile: {
            user_id: data.user_id,
            full_name: data.full_name ?? null,
            email: data.email ?? null,
            phone: data.phone ?? null,
            role: data.role ?? null,
          },
        };
      }

      return { error: `Unknown tool: ${name}` };
    }

    const system = `You are the Track Team Portal assistant.

Rules:
- Use tools to retrieve facts from the database. Do not guess.
- For “fastest”, “best”, “top”, “PR”, or ranking questions, use get_fastest_result or get_top_results.
- Time interpretation (track & field):
  - Lower time = faster = better performance.
  - Higher time = slower = worse performance.
  - If a newer time is lower than an older time, that is improvement.
  - If a newer time is higher than an older time, that is decline.
  - If times are equal, performance is unchanged.
- Gender filtering for results rankings:
  - If the user specifies a gender (male/men/boys or female/women/girls), pass gender: "male" or gender: "female" into get_fastest_result/get_top_results.
  - If the user asks for rankings/“top times”/“fastest” for an event and does NOT specify gender, ask: “Do you want male or female?” BEFORE calling get_fastest_result/get_top_results.
  - If the user explicitly says “overall”, “all athletes”, “everyone”, or “regardless of gender”, do NOT ask; run the tool without a gender filter.
  - If you asked “Do you want male or female?” and the user replies with just “male” or “female” (or men/women/boys/girls), treat it as the answer and immediately continue the prior rankings request using the corresponding gender filter. Do NOT ask for more context.
- Role rules:
  - Coaches can access team-wide assignments/results and athlete profile contact (phone/email).
  - Athletes can access their own assignments/results only (enforced by RLS).
  - Athletes may ask about meets, locations, and announcements.
- If a tool returns an error or no results, explain what is missing and suggest a narrower query.
Never say “I ran out of tool steps”.
User role: ${role}. User name: ${fullName}.`.trim();

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

    // Defensive carry-forward: if the assistant asked "male or female?" and the user replied with only a gender,
    // instruct the model to continue the prior request with that gender (instead of asking for more context).
    try {
      const last = msgs[msgs.length - 1] as any;
      const prev = msgs[msgs.length - 2] as any;

      if (last?.role === "user" && prev?.role === "assistant") {
        const g = normalizeGenderReply((last as any).content);
        if (g && assistantAskedGender((prev as any).content)) {
          msgs.push({
            role: "user",
            content: `Use gender="${g}" as the answer to your last question and continue the previous rankings request now (do not ask for more context).`,
          });
        }
      }
    } catch {
      // no-op
    }

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
        return okText("I couldn't generate a response. Please try again.");
      }

      // If there are tool calls, execute them and continue the loop
      if (assistant.tool_calls && assistant.tool_calls.length > 0) {
        msgs.push(assistant);

        for (const tc of assistant.tool_calls) {
          const name = (tc as any)?.function?.name as string;
          const argsStr = (tc as any)?.function?.arguments as string;

          let parsedArgs: any = {};
          try {
            parsedArgs = argsStr ? JSON.parse(argsStr) : {};
          } catch {
            parsedArgs = {};
          }

          const result = await runTool(name, parsedArgs);

          msgs.push({
            role: "tool",
            tool_call_id: (tc as any).id,
            content: JSON.stringify(result),
          });
        }

        continue;
      }

      // No tool calls: return assistant content
      const text = assistant.content ?? "";
      return okText(text);
    }

    return okText(
      `I wasn't able to pull everything needed to answer that in a few steps. Try asking with a specific event (e.g., "100m" or "400m"), and optionally a meet name/date or a specific athlete name.`
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Chat route error.";
    return errJson(msg, 500);
  }
}
