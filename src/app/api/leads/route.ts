import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const project = searchParams.get("project") || "all";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    let query = supabase.from("leads").select("*").order("created_time", { ascending: false }).limit(100000);

    if (project !== "all") {
      query = query.eq("project_name", project);
    }

    if (startDate) {
      query = query.gte("created_time", startDate);
    }
    
    if (endDate) {
      query = query.lte("created_time", endDate);
    }

    const { data, error } = await query;
    
    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, leads: data || [] });
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
