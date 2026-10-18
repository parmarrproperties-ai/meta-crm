/**
 * GET /api/bot/knowledge — fact sheets, plus the project names to create them for.
 * PUT /api/bot/knowledge — { project_name, content } (needs the x-admin-key header).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/bot/adminAuth";

export const dynamic = "force-dynamic";

function projectNames(): string[] {
  try {
    const accounts: { name?: string }[] = JSON.parse(process.env.META_AD_ACCOUNTS || "[]");
    return accounts.map((a) => a.name).filter((n): n is string => !!n);
  } catch {
    return [];
  }
}

export async function GET() {
  const { data, error } = await supabase.from("knowledge_base").select("project_name, content, updated_at").order("project_name");
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  const names = Array.from(new Set(["General", ...projectNames(), ...(data ?? []).map((r) => r.project_name)]));
  return NextResponse.json({ success: true, projects: names, entries: data ?? [] });
}

export async function PUT(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const project = String(body?.project_name ?? "").trim().slice(0, 120);
  const content = String(body?.content ?? "").slice(0, 12_000);
  if (!project) return NextResponse.json({ success: false, error: "Missing project_name" }, { status: 400 });
  const { error } = await supabase
    .from("knowledge_base")
    .upsert({ project_name: project, content, updated_at: new Date().toISOString() }, { onConflict: "project_name" });
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
