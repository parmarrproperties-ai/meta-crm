import { formatNum } from "@/lib/compute";

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function generateDailyWhatsAppText(summary: any, projectName: string, dateLabel: string, campaignName: string = "all"): string {
  const isPortfolio = projectName.toLowerCase() === "all" || projectName.toLowerCase() === "portfolio";
  const title = isPortfolio ? "Portfolio" : projectName;

  let text = `*Daily Ads Summary - ${title}*`;
  if (campaignName && campaignName !== "all") {
    text += `\n*Campaign:* ${campaignName}`;
  }
  text += `\n${dateLabel}\n
*Spend:* ${formatINR(summary.totalSpend)}
*Leads:* ${summary.totalResults}
*Cost/Lead:* ${formatINR(summary.avgCPA)}
*CTR:* ${formatNum(summary.avgCTR)}%\n`;

  const topAd = summary.bestAd || (summary.topAds && summary.topAds.length > 0 ? summary.topAds[0] : null);
  if (topAd) {
    text += `\n✅ *Top Ad:* ${topAd.ad_name} (${formatINR(topAd.cost_per_result)}/lead)`;
  }

  const bottomAd = summary.worstAd || (summary.bottomAds && summary.bottomAds.length > 0 ? summary.bottomAds[0] : null);
  if (bottomAd) {
    text += `\n⚠️ *Watch:* ${bottomAd.ad_name} (${formatINR(bottomAd.spend)} spend, ${bottomAd.results} leads)`;
  }

  return text;
}

export function generateWeeklyWhatsAppText(report: any, projectName: string): string {
  const isPortfolio = projectName.toLowerCase() === "all" || projectName.toLowerCase() === "portfolio";
  const title = isPortfolio ? "Portfolio" : projectName;
  
  const start = new Date(report.week_start).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  const end = new Date(report.week_end).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });

  let text = `*Weekly Ads Summary - ${title}*
${start} – ${end}

*Spend:* ${formatINR(report.total_spend)}
*Leads:* ${report.total_results}
*Cost/Lead:* ${formatINR(report.avg_cpa)}
*CTR:* ${report.avg_ctr.toFixed(2)}%\n`;

  if (report.top_ads && report.top_ads.length > 0) {
    const top = report.top_ads[0];
    text += `\n✅ *Top Ad:* ${top.ad_name} (${formatINR(top.cost_per_result)}/lead)`;
  }

  if (report.bottom_ads && report.bottom_ads.length > 0) {
    const bottom = report.bottom_ads[0];
    text += `\n⚠️ *Watch:* ${bottom.ad_name} (${formatINR(bottom.spend)} spend, ${bottom.results} leads)`;
  }

  return text;
}
