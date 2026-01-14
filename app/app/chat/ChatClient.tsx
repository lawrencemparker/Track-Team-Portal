"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

/**
 * Bran-DEE Avatar (compact header version)
 */
function BranDEEAvatar({ size = 44 }: { size?: number }) {
  const [isBlinking, setIsBlinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [particles, setParticles] = useState<
    { id: number; x: number; y: number; size: number; speed: number }[]
  >([]);
  const [waveOffset, setWaveOffset] = useState(0);

  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 120);
    }, 3500);

    const speakInterval = setInterval(() => {
      setIsSpeaking(true);
      setTimeout(() => setIsSpeaking(false), 1800);
    }, 4500);

    const waveInterval = setInterval(() => {
      setWaveOffset((prev) => (prev + 1) % 360);
    }, 30);

    const particleArray = Array.from({ length: 14 }, (_, i) => ({
      id: i,
      x: Math.random() * 200,
      y: Math.random() * 200,
      size: Math.random() * 2 + 1,
      speed: Math.random() * 2 + 1,
    }));
    setParticles(particleArray);

    return () => {
      clearInterval(blinkInterval);
      clearInterval(speakInterval);
      clearInterval(waveInterval);
    };
  }, []);

  const accent = "rgb(var(--accent-rgb, 239 68 68))";
  const accent2 = "rgb(var(--accent2-rgb, 248 113 113))";

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-label="Bran-DEE avatar"
      title="Bran-DEE"
    >
      <div className="absolute inset-0 rounded-full bg-white/5 ring-1 ring-white/10" />
      <div className="absolute inset-0 overflow-hidden rounded-full">
        <svg viewBox="0 0 200 200" className="h-full w-full">
          <defs>
            <linearGradient id="glassGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.06" />
              <stop offset="50%" stopColor="#ffffff" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.06" />
            </linearGradient>

            <radialGradient id="eyeGradient">
              <stop offset="0%" stopColor={accent2} stopOpacity="0.95" />
              <stop offset="40%" stopColor={accent} stopOpacity="0.95" />
              <stop offset="100%" stopColor={accent} stopOpacity="0.9" />
            </radialGradient>

            <linearGradient id="holoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={accent} />
              <stop offset="50%" stopColor={accent2} />
              <stop offset="100%" stopColor={accent} />
            </linearGradient>

            <filter id="glow">
              <feGaussianBlur stdDeviation="2.2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {particles.map((p) => (
            <circle key={p.id} cx={p.x} cy={p.y} r={p.size} fill={accent} opacity="0.22">
              <animate
                attributeName="cy"
                values={`${p.y};${p.y - 40};${p.y}`}
                dur={`${p.speed}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.10;0.35;0.10"
                dur={`${p.speed}s`}
                repeatCount="indefinite"
              />
            </circle>
          ))}

          <circle cx="100" cy="100" r="75" fill="url(#glassGradient)" />

          <g opacity="0.85">
            <path
              d="M 30 70 Q 50 30 100 25 Q 150 30 170 70"
              fill="none"
              stroke="url(#holoGradient)"
              strokeWidth="3"
              filter="url(#glow)"
            >
              <animate
                attributeName="d"
                values="M 30 70 Q 50 30 100 25 Q 150 30 170 70;M 30 70 Q 50 25 100 22 Q 150 25 170 70;M 30 70 Q 50 30 100 25 Q 150 30 170 70"
                dur="4s"
                repeatCount="indefinite"
              />
            </path>
            <path d="M 28 75 Q 22 100 25 125" stroke="url(#holoGradient)" strokeWidth="2" opacity="0.5" />
            <path d="M 172 75 Q 178 100 175 125" stroke="url(#holoGradient)" strokeWidth="2" opacity="0.5" />
          </g>

          <g opacity="0.6">
            <line x1="60" y1="68" x2="82" y2="65" stroke={accent} strokeWidth="2" strokeLinecap="round" />
            <line x1="118" y1="65" x2="140" y2="68" stroke={accent} strokeWidth="2" strokeLinecap="round" />
          </g>

          <g>
            <ellipse
              cx="70"
              cy="90"
              rx="16"
              ry={isBlinking ? 2 : 20}
              fill="url(#eyeGradient)"
              opacity="0.95"
              filter="url(#glow)"
            />
            {!isBlinking && (
              <>
                <circle cx="70" cy="90" r="8" fill="#0b1220" opacity="0.8" />
                <circle cx="72" cy="88" r="3" fill={accent2} opacity="0.9">
                  <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
                </circle>
              </>
            )}

            <ellipse
              cx="130"
              cy="90"
              rx="16"
              ry={isBlinking ? 2 : 20}
              fill="url(#eyeGradient)"
              opacity="0.95"
              filter="url(#glow)"
            />
            {!isBlinking && (
              <>
                <circle cx="130" cy="90" r="8" fill="#0b1220" opacity="0.8" />
                <circle cx="132" cy="88" r="3" fill={accent2} opacity="0.9">
                  <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
                </circle>
              </>
            )}
          </g>

          <g>
            <path
              d={isSpeaking ? "M 75 135 Q 100 148 125 135" : "M 78 138 Q 100 145 122 138"}
              stroke="url(#holoGradient)"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              filter="url(#glow)"
              opacity="0.85"
            />
            {isSpeaking && (
              <g stroke={accent} strokeWidth="1" fill="none" opacity="0.55">
                {Array.from({ length: 7 }).map((_, i) => (
                  <line
                    key={i}
                    x1={85 + i * 5}
                    y1={140}
                    x2={85 + i * 5}
                    y2={140 - Math.sin((waveOffset * Math.PI) / 180 + i) * 6}
                    strokeLinecap="round"
                  />
                ))}
              </g>
            )}
          </g>
        </svg>
      </div>
    </div>
  );
}

/**
 * Extract a usable assistant string from various possible API response shapes.
 * This prevents confusing fallback bubbles.
 */
function extractAssistantText(json: any): string | null {
  if (!json) return null;

  // Common keys (your earlier route used text/message/answer, but many APIs differ)
  const directCandidates = [
    json.text,
    json.message,
    json.answer,
    json.response,
    json.content,
    json.output,
    json.reply,
  ];

  for (const c of directCandidates) {
    if (typeof c === "string" && c.trim()) return c;
  }

  // OpenAI-style response shapes
  // e.g., { choices: [{ message: { content: "..." } }] }
  const choice0 = json?.choices?.[0];
  const openAIContent =
    choice0?.message?.content ??
    choice0?.delta?.content ??
    choice0?.text;

  if (typeof openAIContent === "string" && openAIContent.trim()) return openAIContent;

  // Tool / structured response: sometimes { data: { text: "..." } }
  const nestedCandidates = [
    json?.data?.text,
    json?.data?.message,
    json?.data?.answer,
    json?.result?.text,
    json?.result?.message,
  ];

  for (const c of nestedCandidates) {
    if (typeof c === "string" && c.trim()) return c;
  }

  return null;
}

export default function ChatClient() {
  const [messages, setMessages] = useState<ChatMsg[]>(() => [
    {
      id: uid(),
      role: "assistant",
      ts: Date.now(),
      content:
        "Ask me about meets (locations/dates), announcements, assignments, rosters, or results.\nAthletes: I can only show your own assignments/results.",
    },
  ]);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => text.trim().length > 0 && !sending, [text, sending]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  function clearChat() {
    setErr(null);
    setText("");
    setMessages([
      {
        id: uid(),
        role: "assistant",
        ts: Date.now(),
        content:
          "Ask me about meets (locations/dates), announcements, assignments, rosters, or results.\nAthletes: I can only show your own assignments/results.",
      },
    ]);
  }

  async function sendMessage(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canSend) return;

    const userText = text.trim();
    setText("");
    setErr(null);

    const nextUser: ChatMsg = { id: uid(), role: "user", ts: Date.now(), content: userText };
    setMessages((prev) => [...prev, nextUser]);
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: userText }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.error ?? "Chat request failed.");
      }

      const assistantText = extractAssistantText(json);

      // IMPORTANT CHANGE:
      // If server didn't return a usable string, treat it as an error.
      // This prevents the confusing “server did not return…” bubble.
      if (!assistantText) {
        // Leave a breadcrumb for you in dev tools without exposing internal details to users.
        // eslint-disable-next-line no-console
        console.warn("Chat API response had no recognizable text:", json);
        throw new Error("No response content returned from chat service.");
      }

      const nextAssistant: ChatMsg = {
        id: uid(),
        role: "assistant",
        ts: Date.now(),
        content: assistantText,
      };

      setMessages((prev) => [...prev, nextAssistant]);
    } catch (e: any) {
      // User-facing: clear, non-technical.
      setErr("Bran-DEE couldn’t generate a response right now. Please try again.");
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          ts: Date.now(),
          content:
            "I couldn’t get a response for that request. Please try again, or ask using a specific meet name/date, athlete full name, or event.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="glass rounded-3xl p-0">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div className="flex items-start gap-3">
            <BranDEEAvatar size={44} />
            <div className="leading-tight">
              <div className="text-2xl font-semibold text-white">Chat with Bran-DEE</div>
              <div className="mt-1 text-sm text-white/65">
                Ask questions about meets, announcements, assignments, roster, and results.
              </div>
            </div>
          </div>

          <button
            type="button"
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
            onClick={clearChat}
          >
            Clear
          </button>
        </div>

        {/* Messages */}
        <div ref={listRef} className="h-[520px] overflow-y-auto px-6 pb-4 pt-4">
          <div className="space-y-4">
            {messages.map((m) => {
              const isUser = m.role === "user";
              return (
                <div key={m.id} className={isUser ? "flex justify-end" : "flex justify-start"}>
                  <div className="max-w-[78%]">
                    <div
                      className={[
                        "rounded-3xl border px-4 py-3 text-sm leading-relaxed",
                        isUser
                          ? "border-white/10 bg-white text-black"
                          : "border-white/10 bg-white/5 text-white/85",
                      ].join(" ")}
                    >
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    </div>
                    <div
                      className={[
                        "mt-1 text-xs",
                        isUser ? "text-right text-white/40" : "text-white/40",
                      ].join(" ")}
                    >
                      {new Date(m.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 p-6">
          {err ? (
            <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {err}
            </div>
          ) : null}

          <form onSubmit={sendMessage} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Write a message…"
                className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/35 outline-none focus:border-white/25"
                disabled={sending}
              />
            </div>

            <button
              type="submit"
              disabled={!canSend}
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
