import { NextRequest, NextResponse } from "next/server";
import { fetchLeadDetails } from "@/lib/meta";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") ?? new Date().toISOString().split("T")[0];

    // We want to fetch leads for any ad that has been active and generated results recently.
    // Relying strictly on today's snapshot means if they haven't synced the main dashboard today, they get 0 leads.
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

    const { data: ads, error: adsError } = await supabase
      .from("daily_ad_snapshots")
      .select("ad_id, project_name")
      .gte("snapshot_date", thirtyDaysAgoStr)
      .gt("results", 0);

    if (adsError) throw adsError;
    if (!ads || ads.length === 0) {
      return NextResponse.json({ success: true, message: "No ads with results found in the last 30 days.", upserted: 0 });
    }

    let totalUpserted = 0;
    
    // We only need unique ad_ids and their project names.
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
            field_data: l.field_data
          }));

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
        // Continue with other ads
      }
    }

    return NextResponse.json({
      success: true,
      upserted: totalUpserted,
      message: `Successfully fetched and stored leads for ads active in the last 30 days.`
    });

  } catch (err: any) {
    console.error("[fetch-leads] Error:", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
