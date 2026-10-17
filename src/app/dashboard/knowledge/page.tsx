"use client";

import { useEffect, useState } from "react";
import { BookOpen, Save } from "lucide-react";
import { adminFetch } from "@/lib/bot/adminKeyClient";

interface Entry {
  project_name: string;
  content: string;
  updated_at: string;
}

const PLACEHOLDER = `Write plain facts the bot may share. One per line works best, e.g.

Location: Worli, Mumbai, 2 minutes from the Sea Link
Configurations: 3 BHK (1,450 sq ft carpet), 4 BHK (2,100 sq ft carpet)
Price: 3 BHK from ₹9.5 Cr, 4 BHK from ₹14 Cr (all inclusive)
Possession: December 2027
RERA: P51900012345
Amenities: rooftop pool, gym, clubhouse, 3-level parking
Site visits: daily 11 am to 7 pm; our advisor confirms the slot

The bot answers ONLY from this text. Anything not written here is passed to you.`;

export default function KnowledgePage() {
  const [projects, setProjects] = useState<string[]>([]);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [active, setActive] = useState("General");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/bot/knowledge");
      const json = await res.json();
      if (!json.success) {
        setMsg({ text: json.error || "Failed to load", ok: false });
        return;
      }
      const map: Record<string, Entry> = {};
      for (const e of json.entries as Entry[]) map[e.project_name] = e;
      setProjects(json.projects);
      setEntries(map);
      setDraft(map["General"]?.content ?? "");
    })();
  }, []);

  const pick = (p: string) => {
    setActive(p);
    setDraft(entries[p]?.content ?? "");
    setMsg(null);
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await adminFetch("/api/bot/knowledge", {
        method: "PUT",
        body: JSON.stringify({ project_name: active, content: draft }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Save failed");
      setEntries((e) => ({ ...e, [active]: { project_name: active, content: draft, updated_at: new Date().toISOString() } }));
      setMsg({ text: "Saved. The bot uses this from the next message.", ok: true });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setSaving(false);
    }
  };

  const dirty = (entries[active]?.content ?? "") !== draft;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
        <BookOpen className="w-6 h-6 text-blue-600" /> Knowledge Base
      </h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">
        Facts the WhatsApp bot can use to answer questions. <b>General</b> applies to every project. Empty is fine: the bot then passes every question to you.
      </p>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {projects.map((p) => (
          <button
            key={p}
            onClick={() => pick(p)}
            className={`shrink-0 text-sm font-medium px-3 py-2 rounded-lg border ${
              active === p ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {p}
            {entries[p]?.content?.trim() ? "" : " ·  empty"}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={18}
          maxLength={12000}
          className="w-full text-sm font-mono leading-relaxed border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        <div className="flex items-center justify-between gap-3 mt-3">
          <span className={`text-sm ${msg ? (msg.ok ? "text-emerald-600" : "text-rose-600") : "text-slate-400"}`}>
            {msg?.text ?? `${draft.length.toLocaleString()} / 12,000 characters`}
          </span>
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-lg bg-slate-900 text-white disabled:opacity-40"
          >
            <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
