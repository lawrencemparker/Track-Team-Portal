import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabaseServer } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Meet = { id: string; name: string; meet_date: string | null };
type MeetEvent = { id: string; meet_id: string; event_name?: string | null; name?: string | null };
type Profile = { user_id: string; full_name: string; role: string };
type Assignment = { id: string; meet_event_id: string; athlete_id: string; status: string | null };

function formatMeetLabel(name: string, meet_date: string | null) {
  if (!meet_date) return name;
  const d = new Date(meet_date + "T00:00:00");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${name} - ${mm}/${dd}/${yyyy}`;
}

function safeFilename(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
}

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Client-Info": "track-portal-pdf" } },
  });
}

export async function GET(req: Request) {
  const urlObj = new URL(req.url);
  const meetId = urlObj.searchParams.get("meetId");
  if (!meetId) return NextResponse.json({ error: "Missing meetId" }, { status: 400 });

  const supabase = await supabaseServer();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: meProfile, error: profErr } = await supabase
    .from("profiles")
    .select("user_id, full_name, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profErr || !meProfile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });

  const role = (meProfile as Profile).role;
  const isCoach = role === "coach" || role === "assistant_coach" || role === "assistant";

  // Use admin client ONLY for coach PDFs (bypasses RLS on server)
  const admin = isCoach ? supabaseAdmin() : null;
  const db = admin ?? supabase;

  // Meet
  const { data: meet, error: meetErr } = await db
    .from("meets")
    .select("id, name, meet_date")
    .eq("id", meetId)
    .maybeSingle();

  if (meetErr || !meet) return NextResponse.json({ error: "Meet not found" }, { status: 404 });

  const meetLabel = formatMeetLabel((meet as Meet).name, (meet as Meet).meet_date);

  // meet_events
  const { data: meetEvents, error: evErr } = await db
    .from("meet_events")
    .select("id, meet_id, event_name")
    .eq("meet_id", meetId)
    .order("event_name", { ascending: true });

  if (evErr) return NextResponse.json({ error: evErr.message }, { status: 500 });

  const evs = (meetEvents ?? []) as MeetEvent[];
  const meetEventIds = evs.map((e) => e.id);

  // assignments
  let assignments: Assignment[] = [];
  if (meetEventIds.length > 0) {
    let q = db
      .from("assignments")
      .select("id, meet_event_id, athlete_id, status")
      .in("meet_event_id", meetEventIds);

    // Only constrain to athlete for athlete view
    if (!isCoach) q = q.eq("athlete_id", user.id);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    assignments = (data ?? []) as Assignment[];
  }

  // If coach PDF is empty and admin key is missing, call it out clearly
  if (isCoach && assignments.length === 0 && !admin) {
    return NextResponse.json(
      {
        error:
          "Coach PDF requires SUPABASE_SERVICE_ROLE_KEY (server env) OR an RLS policy that allows coaches to read assignments.",
      },
      { status: 500 }
    );
  }

  const eventById = new Map<string, string>(
    evs.map((e) => [e.id, (e.event_name ?? e.name ?? "—") as string])
  );

  const athleteIds = Array.from(new Set(assignments.map((a) => a.athlete_id)));
  const nameByUserId = new Map<string, string>();

  if (athleteIds.length > 0) {
    const { data: profs, error } = await db
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", athleteIds);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    (profs ?? []).forEach((p: any) => nameByUserId.set(p.user_id, p.full_name));
  }

  const rows = assignments
    .map((a) => ({
      meet: meetLabel,
      event: eventById.get(a.meet_event_id) ?? "—",
      athlete: nameByUserId.get(a.athlete_id) ?? "—",
      status: (a.status ?? "").toString(),
    }))
    .sort((x, y) => {
      const e = x.event.localeCompare(y.event);
      if (e !== 0) return e;
      return x.athlete.localeCompare(y.athlete);
    });

  // ---------------- PDF (no lines, no outer border, status aligned) ----------------
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageW = 612;
  const pageH = 792;
  const margin = 50;

  const page = pdf.addPage([pageW, pageH]);
  let y = pageH - margin;

  const colors = {
    text: rgb(0.066, 0.091, 0.153),
    muted: rgb(0.294, 0.333, 0.388),
    headerBg: rgb(0.969, 0.973, 0.984),
    pillBg: rgb(0.933, 0.949, 1),
    pillText: rgb(0.216, 0.188, 0.639),
    pillBorder: rgb(0.878, 0.906, 1),
  };

  const drawText = (t: string, x: number, yy: number, s: number, bold = false, c = colors.text) =>
    page.drawText(t, { x, y: yy, size: s, font: bold ? fontBold : font, color: c });

  const textW = (t: string, s: number, bold = false) =>
    (bold ? fontBold : font).widthOfTextAtSize(t, s);

  drawText("Assignments", margin, y, 20, true);
  y -= 22;
  drawText("Assignments for the selected meet", margin, y, 11, false, colors.muted);
  y -= 18;

  drawText(`Meet: ${meetLabel}`, margin, y, 10, false, colors.muted);
  y -= 14;
  drawText(`Generated: ${new Date().toLocaleString()}`, margin, y, 10, false, colors.muted);
  y -= 14;
  drawText(`View: ${isCoach ? "Coach" : "Athlete"}`, margin, y, 10, false, colors.muted);
  y -= 24;

  drawText("Assignments for this meet", margin, y, 12, true);
  y -= 18;

  const tableW = pageW - margin * 2;

  const colMeet = 220;
  const colEvent = 120;
  const colAthlete = 150;
  const colStatus = tableW - (colMeet + colEvent + colAthlete);

  const meetX = margin + 10;
  const eventX = margin + colMeet + 10;
  const athleteX = margin + colMeet + colEvent + 10;

  const statusCellX = margin + colMeet + colEvent + colAthlete;
  const statusCellW = colStatus;

  // Header band
  page.drawRectangle({ x: margin, y: y - 16, width: tableW, height: 20, color: colors.headerBg });

  drawText("Meet", meetX, y - 12, 10, true, colors.muted);
  drawText("Event", eventX, y - 12, 10, true, colors.muted);
  drawText("Athlete", athleteX, y - 12, 10, true, colors.muted);

  const shw = textW("Status", 10, true);
  drawText("Status", statusCellX + (statusCellW - shw) / 2, y - 12, 10, true, colors.muted);

  y -= 22;

  for (const r of rows) {
    if (y < margin + 40) break; // simple single-page guard (your current output shows single page)

    drawText(r.meet, meetX, y - 12, 10, false, colors.muted);
    drawText(r.event, eventX, y - 12, 10);
    drawText(r.athlete, athleteX, y - 12, 10);

    const pillText = r.status || "";
    const pillW = Math.max(44, textW(pillText, 9, true) + 16);
    const pillX = statusCellX + (statusCellW - pillW) / 2;

    page.drawRectangle({
      x: pillX,
      y: y - 16,
      width: pillW,
      height: 14,
      color: colors.pillBg,
      borderColor: colors.pillBorder,
      borderWidth: 1,
    });

    drawText(pillText, pillX + (pillW - textW(pillText, 9, true)) / 2, y - 12, 9, true, colors.pillText);

    y -= 22;
  }

  const bytes = await pdf.save();
  const filename = safeFilename(`Assignments - ${meetLabel}.pdf`);

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
