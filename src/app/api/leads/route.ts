import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/supabasePaged";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set(["New", "Contacted", "Qualified", "Junk"]);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const project = searchParams.get("project") || "all";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // Paged: a single PostgREST response is capped at 1,000 rows regardless of .limit()
    const leads = await fetchAllRows((from, to) => {
      let query = supabase
        .from("leads")
        .select("*")
        .order("created_time", { ascending: false })
        .order("id");
      if (project !== "all") query = query.eq("project_name", project);
      if (startDate) query = query.gte("created_time", startDate);
      if (endDate) query = query.lte("created_time", endDate);
      return query.range(from, to);
    });

    return NextResponse.json({ success: true, leads });
  } catch (err: any) {
    console.error("[api/leads] Error:", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, status } = await req.json();
    if (!id || !status) {
      return NextResponse.json({ success: false, error: "Missing id or status" }, { status: 400 });
    }
    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ success: false, error: "Invalid status" }, { status: 400 });
    }

    const { error } = await supabase
      .from("leads")
      .update({ status })
      .eq("id", id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[api/leads PUT] Error:", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
