"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, Megaphone, MessageCircle, RefreshCw, Search, Target } from "lucide-react";
import { csvCell } from "@/lib/csv";

interface BotLead {
  lead_id: string;
  source: "ads" | "direct";
  name: string | null;
  phone: string | null;
  project_name: string | null;
  state: string;
  score: string | null;
  answers: Record<string, string>;
  lead_questions: string | null;
  needs_attention: boolean;
  attention_reason: string | null;
  last_message: string | null;
  last_activity: string | null;
  started_at: string;
  followups_sent: number;
}

const STATE_LABEL: Record<string, string> = {
  no_phone: "No phone",
  duplicate: "Duplicate",
  awaiting_start: "No reply yet",
  in_progress: "Answering",
  completed: "Qualified",
  not_interested: "Not interested",
  opted_out: "Unsubscribed",
  no_response: "No response",
  undeliverable: "Not on WhatsApp",
  failed: "Send failed",
};

const STATUS_FILTERS = [
  { id: "all", label: "All", match: () => true },
  { id: "qualified", label: "Qualified", match: (s: string) => s === "completed" },
  { id: "answering", label: "Answering", match: (s: string) => s === "in_progress" },
  { id: "waiting", label: "No reply", match: (s: string) => ["awaiting_start", "no_response"].includes(s) },
  { id: "closed", label: "Not interested", match: (s: string) => ["not_interested", "opted_out"].includes(s) },
] as const;

const SCORE_STYLE: Record<string, string> = {
  Hot: "bg-rose-50 text-rose-700 border-rose-200",
  Warm: "bg-amber-50 text-amber-700 border-amber-200",
  Cold: "bg-slate-100 text-slate-600 border-slate-200",
};

/** A half-finished chat scores Cold only because answers are missing, so don't show that. */
const shownScore = (l: BotLead) => (l.score === "Cold" && l.state !== "completed" ? null : l.score);

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

export default function QualifiedLeadsPage() {
  const [leads, setLeads] = useState<BotLead[]>([]);
  const [columns, setColumns] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"ads" | "direct">("ads");
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]["id"]>("all");
  const [score, setScore] = useState<"all" | "Hot" | "Warm" | "Cold">("all");
  const [query, setQuery] = useState("");

  const load = async () => {
    try {
      const res = await fetch("/api/bot/leads");
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load");
      setLeads(json.leads);
      setColumns(json.columns);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching
    load();
  }, []);

  const counts = useMemo(
    () => ({
      ads: leads.filter((l) => l.source === "ads").length,
      direct: leads.filter((l) => l.source === "direct").length,
    }),
    [leads]
  );

  const visible = useMemo(() => {
    const statusMatch = STATUS_FILTERS.find((f) => f.id === status)!.match;
    const q = query.trim().toLowerCase();
    return leads.filter(
      (l) =>
        l.source === source &&
        statusMatch(l.state) &&
        (score === "all" || shownScore(l) === score) &&
        (!q || [l.name, l.phone, l.project_name, ...Object.values(l.answers)].some((v) => v?.toLowerCase().includes(q)))
    );
  }, [leads, source, status, score, query]);

  const tabStats = useMemo(() => {
    const inTab = leads.filter((l) => l.source === source);
    return {
      total: inTab.length,
      qualified: inTab.filter((l) => l.state === "completed").length,
      hot: inTab.filter((l) => l.score === "Hot").length,
    };
  }, [leads, source]);

  const download = () => {
    const header = ["Name", "Phone", "Project", ...columns.map((c) => c.label), "Score", "Status", "Questions asked", "Last activity"];
    const lines = visible.map((l) =>
      [
        l.name,
        l.phone ? `+${l.phone}` : "",
        l.project_name,
        ...columns.map((c) => l.answers[c.id]),
        l.score,
        STATE_LABEL[l.state] ?? l.state,
        l.lead_questions,
        fmt(l.last_activity),
      ]
        .map(csvCell)
        .join(",")
    );
    const blob = new Blob([[header.map(csvCell).join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bot-leads-${source}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const chip = (active: boolean) =>
    `shrink-0 text-sm font-medium px-3 py-1.5 rounded-lg border ${
      active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
    }`;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Target className="w-6 h-6 text-blue-600" /> Qualified Leads
          </h1>
          <p className="text-sm text-slate-500 mt-1">What each lead told the bot, in one table.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={download}
            disabled={visible.length === 0}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40"
          >
            <Download className="w-4 h-4" /> <span className="hidden sm:inline">CSV</span>
          </button>
          <button
            onClick={() => {
              setLoading(true);
              load();
            }}
            className="p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Source tabs */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {(
          [
            { id: "ads", label: "From ads", hint: "Bot messaged them after a lead form", icon: Megaphone },
            { id: "direct", label: "Messaged us", hint: "They WhatsApped the bot first", icon: MessageCircle },
          ] as const
        ).map(({ id, label, hint, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSource(id)}
            className={`text-left rounded-xl border p-3 sm:p-4 transition ${
              source === id ? "border-blue-300 bg-blue-50/60 ring-2 ring-blue-500/10" : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Icon className="w-4 h-4" /> {label}
              <span className="ml-auto text-xs font-medium text-slate-500">{counts[id]}</span>
            </span>
            <span className="block text-xs text-slate-500 mt-1">{hint}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-4 text-sm text-slate-600 mb-4">
        <span><b className="text-slate-900">{tabStats.total}</b> chats</span>
        <span><b className="text-slate-900">{tabStats.qualified}</b> qualified</span>
        <span><b className="text-rose-700">{tabStats.hot}</b> hot</span>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {STATUS_FILTERS.map((f) => (
            <button key={f.id} onClick={() => setStatus(f.id)} className={chip(status === f.id)}>
              {f.label}
            </button>
          ))}
          <span className="w-px bg-slate-200 mx-1 shrink-0" />
          {(["all", "Hot", "Warm", "Cold"] as const).map((s) => (
            <button key={s} onClick={() => setScore(s)} className={chip(score === s)}>
              {s === "all" ? "Any score" : s}
            </button>
          ))}
        </div>
        <label className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, phone, project, answers…"
            className="w-full text-sm border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </label>
      </div>

      {error && <p className="text-sm text-rose-600 mb-4">{error}</p>}
      {!loading && !error && visible.length === 0 && (
        <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-8 text-center">
          {source === "ads" ? "No form leads have chatted with the bot yet." : "Nobody has messaged the bot directly yet."}
        </p>
      )}

      {/* Phone: cards */}
      <div className="space-y-3 lg:hidden">
        {visible.map((l) => (
          <Link
            key={l.lead_id}
            href={`/dashboard/conversations?lead=${encodeURIComponent(l.lead_id)}`}
            className="block bg-white border border-slate-200 rounded-xl p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 truncate">{l.name || "Lead"}</p>
                <p className="text-xs text-slate-500">
                  {l.phone ? `+${l.phone}` : "no phone"}
                  {l.project_name ? ` · ${l.project_name}` : ""}
                </p>
              </div>
              {shownScore(l) && <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${SCORE_STYLE[l.score!] ?? ""}`}>{l.score}</span>}
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-3 text-xs">
              {columns.map((c) => (
                <div key={c.id} className="min-w-0">
                  <dt className="text-slate-400">{c.label}</dt>
                  <dd className="text-slate-800 truncate">{l.answers[c.id] || "—"}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-slate-500 mt-3">
              {STATE_LABEL[l.state] ?? l.state} · {fmt(l.last_activity)}
              {l.needs_attention && <span className="text-rose-600 font-medium"> · needs you</span>}
            </p>
          </Link>
        ))}
      </div>

      {/* Desktop: table */}
      {visible.length > 0 && (
        <div className="hidden lg:block bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Lead</th>
                {columns.map((c) => (
                  <th key={c.id} className="px-3 py-3 whitespace-nowrap">{c.label}</th>
                ))}
                <th className="px-3 py-3">Score</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 whitespace-nowrap">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((l) => (
                <tr key={l.lead_id} className="hover:bg-slate-50/60 align-top">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/conversations?lead=${encodeURIComponent(l.lead_id)}`} className="font-semibold text-slate-900 hover:text-blue-700">
                      {l.name || "Lead"}
                    </Link>
                    <p className="text-xs text-slate-500 whitespace-nowrap">
                      {l.phone ? `+${l.phone}` : "no phone"}
                      {l.project_name ? ` · ${l.project_name}` : ""}
                    </p>
                    {l.lead_questions && <p className="text-xs text-slate-500 mt-1 max-w-[220px] truncate" title={l.lead_questions}>Asked: {l.lead_questions}</p>}
                  </td>
                  {columns.map((c) => (
                    <td key={c.id} className="px-3 py-3 text-slate-700 whitespace-nowrap">{l.answers[c.id] || <span className="text-slate-300">—</span>}</td>
                  ))}
                  <td className="px-3 py-3">
                    {shownScore(l) && <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${SCORE_STYLE[l.score!] ?? ""}`}>{l.score}</span>}
                  </td>
                  <td className="px-3 py-3 text-slate-600 whitespace-nowrap">
                    {STATE_LABEL[l.state] ?? l.state}
                    {l.needs_attention && <span className="block text-xs text-rose-600 font-medium">needs you</span>}
                  </td>
                  <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{fmt(l.last_activity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
