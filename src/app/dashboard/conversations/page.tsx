"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Bot, MessageCircle, Pause, Play, RefreshCw, Send, CheckCircle2, Sheet } from "lucide-react";
import { adminFetch } from "@/lib/bot/adminKeyClient";

interface ConvRow {
  lead_id: string;
  name: string | null;
  phone: string | null;
  project_name: string | null;
  state: string;
  score: string | null;
  summary: string | null;
  needs_attention: boolean;
  attention_reason: string | null;
  bot_paused: boolean;
  last_message: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  updated_at: string;
  next_followup_at: string | null;
}

interface Msg {
  id: string;
  direction: "in" | "out";
  msg_type: string | null;
  body: string | null;
  status: string | null;
  error: string | null;
  created_at: string;
}

const STATE_LABEL: Record<string, string> = {
  no_phone: "No phone",
  duplicate: "Duplicate",
  awaiting_start: "Waiting for reply",
  in_progress: "Answering",
  completed: "Qualified",
  not_interested: "Not interested",
  opted_out: "Unsubscribed",
  no_response: "No response",
  undeliverable: "Not on WhatsApp",
  failed: "Send failed",
};

const SCORE_STYLE: Record<string, string> = {
  Hot: "bg-rose-50 text-rose-700 border-rose-200",
  Warm: "bg-amber-50 text-amber-700 border-amber-200",
  Cold: "bg-slate-100 text-slate-600 border-slate-200",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function ConversationsPage() {
  const [filter, setFilter] = useState<"all" | "attention" | "hot">("all");
  const [rows, setRows] = useState<ConvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<{
    conversation: ConvRow & { answers?: Record<string, unknown>; lead_questions?: string | null };
    messages: Msg[];
    /** WhatsApp allows free replies only within 24h of the lead's last message. */
    windowOpen: boolean;
  } | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    try {
      const res = await fetch(`/api/bot/conversations?filter=${filter}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load chats");
      setRows(json.conversations);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const loadThread = useCallback(async (leadId: string) => {
    const res = await fetch(`/api/bot/conversations/${encodeURIComponent(leadId)}`);
    const json = await res.json();
    if (!json.success) return;
    const last = json.conversation.last_inbound_at;
    setThread({
      conversation: json.conversation,
      messages: json.messages,
      windowOpen: !!last && Date.now() - new Date(last).getTime() < 86_400_000,
    });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selected) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching
    loadThread(selected);
    const t = setInterval(() => loadThread(selected), 15000);
    return () => clearInterval(t);
  }, [selected, loadThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [thread?.messages.length]);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 4000);
  };

  const act = async (action: string, text?: string) => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await adminFetch(`/api/bot/conversations/${encodeURIComponent(selected)}`, {
        method: "POST",
        body: JSON.stringify({ action, text }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Action failed");
      if (action === "reply") setReply("");
      await Promise.all([loadThread(selected), loadList()]);
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const setupSheet = async () => {
    setBusy(true);
    try {
      const res = await adminFetch("/api/bot/setup-sheet", { method: "POST" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Sheet setup failed");
      flash(`Google Sheet ready ✅ (${json.rowsSynced} rows filled)`);
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const conv = thread?.conversation;
  const windowOpen = thread?.windowOpen ?? false;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-emerald-600" /> WhatsApp Bot
          </h1>
          <p className="text-sm text-slate-500 mt-1">Every chat the bot is having with your leads.</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/bot/status"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
          >
            Check setup
          </a>
          <button
            onClick={setupSheet}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
          >
            <Sheet className="w-4 h-4" /> <span className="hidden sm:inline">Set up</span> Sheet
          </button>
          <button
            onClick={() => {
              setLoading(true);
              loadList();
              if (selected) loadThread(selected);
            }}
            className="p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[360px_1fr] gap-4">
        {/* List */}
        <section className={`bg-white border border-slate-200 rounded-xl overflow-hidden ${selected ? "hidden lg:block" : ""}`}>
          <div className="flex gap-1 p-2 border-b border-slate-100">
            {(["all", "attention", "hot"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 text-sm font-medium px-3 py-2 rounded-lg ${filter === f ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                {f === "all" ? "All" : f === "attention" ? "Needs you" : "Hot"}
              </button>
            ))}
          </div>
          {error && <p className="p-4 text-sm text-rose-600">{error}</p>}
          {!error && !loading && rows.length === 0 && (
            <p className="p-6 text-sm text-slate-500 text-center">No chats yet. They appear here as soon as a lead comes in.</p>
          )}
          <ul className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
            {rows.map((r) => (
              <li key={r.lead_id}>
                <button
                  onClick={() => setSelected(r.lead_id)}
                  className={`w-full text-left px-4 py-3 hover:bg-slate-50 ${selected === r.lead_id ? "bg-blue-50/60" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-slate-900 truncate">{r.name || (r.phone ? `+${r.phone}` : "Lead")}</span>
                    <span className="text-xs text-slate-400 shrink-0">{timeAgo(r.last_inbound_at ?? r.updated_at)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {r.score && <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border ${SCORE_STYLE[r.score] ?? ""}`}>{r.score}</span>}
                    <span className="text-[11px] text-slate-500">{STATE_LABEL[r.state] ?? r.state}</span>
                    {r.bot_paused && <span className="text-[11px] text-slate-500">· paused</span>}
                    {r.needs_attention && (
                      <span className="text-[11px] font-medium text-rose-600 flex items-center gap-0.5">
                        <AlertCircle className="w-3 h-3" /> needs you
                      </span>
                    )}
                  </div>
                  {r.last_message && <p className="text-xs text-slate-500 truncate mt-1">{r.last_message}</p>}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Thread */}
        <section className={`bg-white border border-slate-200 rounded-xl flex flex-col min-h-[60vh] ${selected ? "" : "hidden lg:flex"}`}>
          {!conv ? (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-400 p-8">Select a chat</div>
          ) : (
            <>
              <header className="p-4 border-b border-slate-100 space-y-2">
                <div className="flex items-start gap-3">
                  <button onClick={() => { setSelected(null); setThread(null); }} className="lg:hidden p-1 -ml-1 text-slate-500" aria-label="Back">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{conv.name || "Lead"}</p>
                    <p className="text-xs text-slate-500">
                      {conv.phone ? `+${conv.phone}` : "no phone"} · {conv.project_name || "—"} · {STATE_LABEL[conv.state] ?? conv.state}
                    </p>
                  </div>
                  {conv.score && <span className={`text-xs font-semibold px-2 py-1 rounded border ${SCORE_STYLE[conv.score] ?? ""}`}>{conv.score}</span>}
                </div>
                {conv.summary && <p className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2">{conv.summary}</p>}
                {conv.lead_questions && <p className="text-xs text-slate-600"><span className="font-semibold">Asked:</span> {conv.lead_questions}</p>}
                <div className="flex flex-wrap gap-2">
                  <button
                    disabled={busy}
                    onClick={() => act(conv.bot_paused ? "resume" : "pause")}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5"
                  >
                    {conv.bot_paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                    {conv.bot_paused ? "Resume bot" : "Pause bot (I'll handle)"}
                  </button>
                  {conv.needs_attention && (
                    <button
                      disabled={busy}
                      onClick={() => act("resolve")}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Mark done{conv.attention_reason ? ` (${conv.attention_reason})` : ""}
                    </button>
                  )}
                </div>
              </header>

              <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/50 max-h-[55vh]">
                {thread!.messages.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                        m.direction === "out" ? "bg-emerald-50 border border-emerald-100 text-slate-800" : "bg-white border border-slate-200 text-slate-800"
                      }`}
                    >
                      {m.direction === "out" && m.msg_type !== "manual" && (
                        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-emerald-700 mb-0.5">
                          <Bot className="w-3 h-3" /> bot
                        </span>
                      )}
                      {m.body}
                      <span className="block text-[10px] text-slate-400 mt-1">
                        {fmt(m.created_at)}
                        {m.direction === "out" && m.status ? ` · ${m.status}` : ""}
                        {m.error ? ` · ${m.error}` : ""}
                      </span>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (reply.trim()) act("reply", reply.trim());
                }}
                className="p-3 border-t border-slate-100 flex gap-2"
              >
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  disabled={!windowOpen || busy}
                  placeholder={windowOpen ? "Reply as yourself…" : "Replies open for 24h after the lead's last message"}
                  className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50"
                />
                <button
                  type="submit"
                  disabled={!windowOpen || busy || !reply.trim()}
                  className="px-4 rounded-lg bg-slate-900 text-white disabled:opacity-40"
                  aria-label="Send"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          )}
        </section>
      </div>

      {toast && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 bg-slate-900 text-white text-sm rounded-xl px-4 py-3 shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
