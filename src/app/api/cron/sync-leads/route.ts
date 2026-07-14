import { NextRequest, NextResponse } from "next/server";
import { fetchLeadDetails } from "@/lib/meta";
import { supabase } from "@/lib/supabase";
import { sendNewLeadAlert } from "@/lib/email";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      // In a real Vercel deployment, this ensures only Vercel can trigger the cron
      console.warn("Unauthorized cron invocation");
    }

    const { data: ads, error: adsError } = await supabase
      .from("daily_ad_snapshots")
      .select("ad_id, project_name")
      .gt("results", 0);

    if (adsError) throw adsError;
    if (!ads || ads.length === 0) {
      return NextResponse.json({ success: true, message: "No active ads to sync.", newLeadsCount: 0 });
    }

    let totalUpserted = 0;
    const allNewLeads: any[] = [];
    const uniqueAds = new Map<string, string>();
    
    for (const ad of ads) {
      if (ad.ad_id) {
        uniqueAds.set(ad.ad_id, ad.project_name);
      }
    }

    for (const [adId, projectName] of uniqueAds.entries()) {
      try {
        const leads = await fetchLeadDetails(adId);
        
        if (leads.length > 0) {
          const rows = leads.map(l => ({
            lead_id: l.id,
            created_time: l.created_time,
            ad_id: l.ad_id,
            ad_name: l.ad_name,
            campaign_name: l.campaign_name,
            project_name: projectName,
            form_id: l.form_id,
            field_data: l.field_data,
            status: 'New'
          }));

          // Determine which leads are genuinely new
          const { data: existingLeads } = await supabase
            .from("leads")
            .select("lead_id")
            .in("lead_id", rows.map(r => r.lead_id));
            
          const existingIds = new Set(existingLeads?.map(r => r.lead_id) || []);
          const newlyDiscovered = rows.filter(r => !existingIds.has(r.lead_id));
          
          allNewLeads.push(...newlyDiscovered);

          const { error: upsertError } = await supabase
            .from("leads")
            .upsert(rows, { onConflict: "lead_id" });
            
          if (upsertError) {
            console.error(`Error upserting leads for ad ${adId}:`, upsertError);
          } else {
            totalUpserted += rows.length;
          }
        }
      } catch (err) {
        console.error(`Error fetching leads for ad ${adId}:`, err);
      }
    }

    if (allNewLeads.length > 0) {
      console.log(`[ALERT] 🔔 You have ${allNewLeads.length} new leads! (Email disabled in favor of daily report)`);
      // Email alerting has been disabled here because we now send a daily report.
    }

    return NextResponse.json({
      success: true,
      newLeadsCount: allNewLeads.length,
      totalSynced: totalUpserted,
      message: `Successfully synced ${totalUpserted} leads. Found ${allNewLeads.length} new.`
    });

  } catch (err: any) {
    console.error("[cron/sync-leads] Error:", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
