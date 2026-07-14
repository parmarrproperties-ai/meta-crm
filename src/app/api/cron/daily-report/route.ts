import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendDailyReport } from "@/lib/email";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.warn("Unauthorized cron invocation");
    }

    // Get yesterday's date boundaries
    const today = new Date();
    
    // We create a Date object for yesterday, at the start of the day (00:00:00)
    const startOfYesterday = new Date(today);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    startOfYesterday.setHours(0, 0, 0, 0);

    // End of yesterday (23:59:59.999)
    const endOfYesterday = new Date(today);
    endOfYesterday.setDate(endOfYesterday.getDate() - 1);
    endOfYesterday.setHours(23, 59, 59, 999);

    const dateStr = startOfYesterday.toISOString().split("T")[0]; // YYYY-MM-DD

    const { data: yesterdayLeads, error } = await supabase
      .from("leads")
      .select("*")
      .gte("created_time", startOfYesterday.toISOString())
      .lt("created_time", today.toISOString()); // less than start of today

    if (error) {
      throw error;
    }

    if (!yesterdayLeads || yesterdayLeads.length === 0) {
      console.log(`No leads found for yesterday (${dateStr}). Skipping report.`);
      return NextResponse.json({ success: true, message: "No leads yesterday, email skipped." });
    }

    console.log(`Sending daily report for ${dateStr} with ${yesterdayLeads.length} leads...`);
    const success = await sendDailyReport(yesterdayLeads, dateStr);

    if (!success) {
      throw new Error("Failed to send daily report email.");
    }

    return NextResponse.json({ success: true, message: `Report sent for ${dateStr} with ${yesterdayLeads.length} leads.` });
  } catch (error: any) {
    console.error("Daily report cron error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
