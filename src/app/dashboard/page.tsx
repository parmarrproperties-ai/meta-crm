"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  RefreshCw,
  MessageCircle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  MousePointerClick,
  Target,
  Users,
  AlertTriangle,
  CheckCircle2,
  ChevronUp,
  ChevronDown,
  Minus,
  Share2,
  ChevronsUpDown,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { useSearchParams } from "next/navigation";

interface AdRow {
  ad_id: string;
  ad_name: string;
  campaign_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  results: number;
  cost_per_result: number;
  project_name?: string;
}

interface PortfolioRow {
  project_name: string;
  spend: number;
  results: number;
  impressions: number;
  clicks: number;
  cost_per_result: number;
  ctr: number;
}

interface DailySummary {
  date: string;
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalResults: number;
  avgCTR: number;
  avgCPC: number;
  avgCPM: number;
  avgCPA: number;
  bestAd: AdRow | null;
  worstAd: AdRow | null;
  ads: AdRow[];
  campaigns: Array<{
    campaign_name: string;
    spend: number;
    impressions: number;
    clicks: number;
    results: number;
    cost_per_result: number;
    ctr: number;
    cpc: number;
  }>;
}

interface TrendPoint {
  date: string;
  spend: number;
  results: number;
  ctr: string;
}

type SortKey = keyof AdRow;
type SortDir = "asc" | "desc";

function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatNum(n: number, decimals = 2) {
  return n.toFixed(decimals);
}

function DashboardClient() {
  const searchParams = useSearchParams();
  const currentProject = searchParams.get("project") || "all";

  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [activeChart, setActiveChart] = useState<"spend" | "results">("spend");
  const [dateRange, setDateRange] = useState<"today" | "yesterday" | "7d" | "14d" | "30d">("today");
  const [activeAdsOnly, setActiveAdsOnly] = useState(false);
  const [activeCampOnly, setActiveCampOnly] = useState(false);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date();
      let sd = new Date();
      let ed = new Date();
      
      if (dateRange === "yesterday") {
        sd.setDate(sd.getDate() - 1);
        ed.setDate(ed.getDate() - 1);
      } else if (dateRange === "7d") {
        sd.setDate(sd.getDate() - 6);
      } else if (dateRange === "14d") {
        sd.setDate(sd.getDate() - 13);
      } else if (dateRange === "30d") {
        sd.setDate(sd.getDate() - 29);
      }

      const startDate = sd.toISOString().split("T")[0];
      const endDate = ed.toISOString().split("T")[0];

      const res = await fetch(`/api/ads/summary?project=${encodeURIComponent(currentProject)}&startDate=${startDate}&endDate=${endDate}`);
      const json = await res.json();
      if (json.summary) setSummary(json.summary);
      if (json.trend) setTrend(json.trend);
      if (json.portfolio) setPortfolio(json.portfolio);
    } catch {
      showToast("Failed to load dashboard data", "error");
    } finally {
      setLoading(false);
    }
  }, [currentProject, dateRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/ads/fetch-today", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        showToast(`✓ Fetched ${json.upserted} ads from Meta`, "success");
        await loadData();
      } else {
        showToast(json.error ?? "Refresh failed", "error");
      }
    } catch {
      showToast("Network error during refresh", "error");
    } finally {
      setRefreshing(false);
    }
  };

  const handleNativeShare = async () => {
    if (!summary) return;
    const text = `📊 *Daily Ads Summary - ${currentProject === "all" ? "Portfolio" : currentProject}*
${today}

*Total Spend:* ${formatINR(summary.totalSpend)}
*Total Leads:* ${summary.totalResults}
*Avg Cost/Lead:* ${formatINR(summary.avgCPA)}
*Avg CTR:* ${formatNum(summary.avgCTR)}%

${summary.bestAd ? `✅ *Best Ad:* ${summary.bestAd.ad_name} (${formatINR(summary.bestAd.cost_per_result)}/lead)` : ""}
${summary.worstAd ? `⚠️ *Watch:* ${summary.worstAd.ad_name} (${formatINR(summary.worstAd.spend)} spend, ${summary.worstAd.results} leads)` : ""}
`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Daily Meta Ads Report",
          text: text,
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          showToast("Failed to share", "error");
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        showToast("Report copied to clipboard! You can paste it anywhere.", "success");
      } catch {
        showToast("Sharing not supported on this browser", "error");
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        if (!refreshing) handleRefresh();
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (summary) handleNativeShare();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [refreshing, summary]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filteredAds = (summary?.ads ?? []).filter((a) => !activeAdsOnly || a.spend > 0 || a.impressions > 0 || a.results > 0);
  const sortedAds = [...filteredAds].sort((a, b) => {
    const av = a[sortKey] as number | string;
    const bv = b[sortKey] as number | string;
    if (typeof av === "number" && typeof bv === "number") {
      return sortDir === "asc" ? av - bv : bv - av;
    }
    return sortDir === "asc"
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  const [campSortKey, setCampSortKey] = useState<keyof DailySummary["campaigns"][0]>("spend");
  const [campSortDir, setCampSortDir] = useState<SortDir>("desc");

  const handleCampSort = (key: keyof DailySummary["campaigns"][0]) => {
    if (campSortKey === key) {
      setCampSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setCampSortKey(key);
      setCampSortDir("desc");
    }
  };

  const filteredCampaigns = (summary?.campaigns ?? []).filter((c) => !activeCampOnly || c.spend > 0 || c.impressions > 0 || c.results > 0);
  const sortedCampaigns = [...filteredCampaigns].sort((a, b) => {
    const av = a[campSortKey] as number | string;
    const bv = b[campSortKey] as number | string;
    if (typeof av === "number" && typeof bv === "number") {
      return campSortDir === "asc" ? av - bv : bv - av;
    }
    return campSortDir === "asc"
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(new Date().toLocaleDateString("en-IN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }));
  }, []);

  const SortIcon = ({ col, isCamp = false }: { col: string; isCamp?: boolean }) => {
    const sKey = isCamp ? campSortKey : sortKey;
    const sDir = isCamp ? campSortDir : sortDir;
    return sKey === col ? (
      sDir === "asc" ? (
        <ChevronUp className="w-3 h-3 inline ml-1 text-blue-500" />
      ) : (
        <ChevronDown className="w-3 h-3 inline ml-1 text-blue-500" />
      )
    ) : (
      <ChevronsUpDown className="w-3 h-3 inline ml-1 text-slate-300/50" />
    );
  };

  const isAllProjects = currentProject === "all";

  return (
    <div className="p-8 min-h-screen pb-20">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-5 py-3.5 rounded-xl shadow-2xl text-sm font-medium flex items-center gap-3 transition-all animate-in slide-in-from-top-2 duration-300 ${
            toast.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800 shadow-emerald-500/10"
              : "bg-red-50 border border-red-200 text-red-800 shadow-red-500/10"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-600" />
          )}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight flex flex-wrap items-center gap-3 sm:gap-4">
            {isAllProjects ? "Portfolio Dashboard" : currentProject}
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as any)}
              className="text-sm border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600 font-medium hover:border-slate-300 transition-colors cursor-pointer"
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7d">Last 7 Days</option>
              <option value="14d">Last 14 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </h1>
          <p className="text-slate-500 text-sm mt-1.5 font-medium" suppressHydrationWarning>{today}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-sm font-medium text-slate-700 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">{refreshing ? "Syncing Meta..." : "Sync Now (R)"}</span>
          </button>

          <button
            onClick={handleNativeShare}
            disabled={!summary}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-medium text-white transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-blue-600/20"
          >
            <Share2 className="w-4 h-4" />
            <span className="hidden sm:inline">Share Report (S)</span>
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-8">
        <StatCard
          label="Total Spend"
          value={summary ? formatINR(summary.totalSpend) : "₹0"}
          icon={<DollarSign className="w-4 h-4" />}
          loading={loading}
        />
        <StatCard
          label="Total Leads / Results"
          value={summary ? String(summary.totalResults) : "0"}
          icon={<Target className="w-4 h-4" />}
          loading={loading}
        />
        <StatCard
          label="Avg Cost Per Lead"
          value={summary ? formatINR(summary.avgCPA) : "₹0"}
          icon={<Users className="w-4 h-4" />}
          loading={loading}
          invertGood
        />
        <StatCard
          label="Avg CTR"
          value={summary ? `${formatNum(summary.avgCTR)}%` : "0%"}
          icon={<MousePointerClick className="w-4 h-4" />}
          loading={loading}
        />
      </div>

      {/* Portfolio Breakdown (Only if "all" is selected) */}
      {isAllProjects && portfolio.length > 0 && (
        <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-sm mb-8">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="font-semibold text-slate-900">Portfolio Breakdown</h3>
              <p className="text-xs text-slate-500 mt-1">Cross-project comparison</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/30">
                  <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Project Name</th>
                  <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Spend</th>
                  <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Leads</th>
                  <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Cost/Lead</th>
                  <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">CTR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {portfolio.map((p) => (
                  <tr key={p.project_name} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-2.5 font-medium text-slate-900 sticky left-0 bg-white sm:bg-transparent shadow-[4px_0_12px_rgba(0,0,0,0.03)] sm:shadow-none z-10">{p.project_name}</td>
                    <td className="px-5 py-2.5 text-slate-600">{formatINR(p.spend)}</td>
                    <td className="px-5 py-2.5">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                        {p.results}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 font-medium text-slate-900">{formatINR(p.cost_per_result)}</td>
                    <td className="px-5 py-2.5 text-slate-500">{formatNum(p.ctr)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trend Chart */}
      <div className="rounded-2xl bg-white border border-slate-200 p-6 mb-8 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold text-slate-900">14-Day Performance Trend</h3>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setActiveChart("spend")}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeChart === "spend"
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200/60"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Spend
            </button>
            <button
              onClick={() => setActiveChart("results")}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeChart === "results"
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200/60"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Results (Leads)
            </button>
          </div>
        </div>

        {loading || trend.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400">
            {loading ? (
              <div className="h-full w-full bg-slate-50 rounded-xl animate-pulse" />
            ) : (
              <p className="text-sm">No trend data yet.</p>
            )}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#64748b", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                dy={10}
              />
              <YAxis
                tick={{ fill: "#64748b", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                dx={-10}
                tickFormatter={(v) =>
                  activeChart === "spend" ? `₹${(v / 1000).toFixed(0)}k` : String(v)
                }
              />
              <Tooltip
                contentStyle={{
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "13px",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                }}
                labelStyle={{ color: "#475569", marginBottom: "4px" }}
                itemStyle={{ color: "#0f172a", fontWeight: 600 }}
              />
              <Line
                type="monotone"
                dataKey={activeChart}
                stroke="#3b82f6"
                strokeWidth={3}
                isAnimationActive={false}
                dot={{ fill: "#ffffff", stroke: "#3b82f6", strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, fill: "#3b82f6", stroke: "#ffffff", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Campaign Performance Table */}
      <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-sm mb-8">
        <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
          <div>
            <h3 className="font-semibold text-slate-900">Campaign Performance</h3>
            <p className="text-xs text-slate-500 mt-1">Rollup by campaign</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-600 cursor-pointer flex items-center gap-2 select-none">
              <input 
                type="checkbox" 
                checked={activeCampOnly}
                onChange={(e) => setActiveCampOnly(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
              />
              Active Campaigns Only (Activity &gt; 0)
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-10 bg-slate-50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : sortedCampaigns.length === 0 ? (
            <div className="p-16 text-center text-slate-400">
              <p className="text-sm font-medium text-slate-600">No campaign data for today.</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-white">
                  {(
                    [
                      ["campaign_name", "Campaign"],
                      ["spend", "Spend"],
                      ["impressions", "Impr."],
                      ["clicks", "Clicks"],
                      ["ctr", "CTR"],
                      ["cpc", "CPC"],
                      ["results", "Leads"],
                      ["cost_per_result", "Cost/Lead"],
                    ] as [keyof DailySummary["campaigns"][0], string][]
                  ).map(([key, label]) => (
                    <th
                      key={key}
                      onClick={() => handleCampSort(key)}
                      className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 hover:text-slate-800 transition-colors whitespace-nowrap bg-slate-50/30"
                    >
                      {label}
                      <SortIcon col={key} isCamp={true} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedCampaigns.map((camp) => (
                  <tr
                    key={camp.campaign_name}
                    className="group hover:bg-slate-50/70 transition-colors"
                  >
                    <td className="px-5 py-2.5 sticky left-0 bg-white group-hover:bg-slate-50/70 shadow-[4px_0_12px_rgba(0,0,0,0.03)] sm:shadow-none z-10 transition-colors">
                      <p className="font-medium text-slate-900 text-sm">
                        {camp.campaign_name}
                      </p>
                    </td>
                    <td className="px-5 py-2.5 font-medium text-slate-700 whitespace-nowrap">
                      {formatINR(camp.spend)}
                    </td>
                    <td className="px-5 py-2.5 text-slate-500 whitespace-nowrap">
                      {camp.impressions.toLocaleString("en-IN")}
                    </td>
                    <td className="px-5 py-2.5 text-slate-500">{camp.clicks.toLocaleString("en-IN")}</td>
                    <td className="px-5 py-2.5 text-slate-500">{formatNum(camp.ctr)}%</td>
                    <td className="px-5 py-2.5 text-slate-500">{formatINR(camp.cpc)}</td>
                    <td className="px-5 py-2.5">
                      <span
                        className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold min-w-[28px] ${
                          camp.results > 0
                            ? "bg-blue-50 text-blue-700 border border-blue-100"
                            : "bg-slate-100 text-slate-500 border border-slate-200"
                        }`}
                      >
                        {camp.results}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 font-semibold whitespace-nowrap">
                      <span
                        className={
                          camp.results === 0 ? "text-slate-400" : "text-slate-900"
                        }
                      >
                        {camp.results === 0 ? "—" : formatINR(camp.cost_per_result)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Ad Performance Table */}
      <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
          <div>
            <h3 className="font-semibold text-slate-900">Ad Performance</h3>
            <p className="text-xs text-slate-500 mt-1">Click column headers to sort</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-600 cursor-pointer flex items-center gap-2 select-none">
              <input 
                type="checkbox" 
                checked={activeAdsOnly}
                onChange={(e) => setActiveAdsOnly(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
              />
              Active Ads Only (Activity &gt; 0)
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 bg-slate-50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : sortedAds.length === 0 ? (
            <div className="p-16 text-center text-slate-400">
              <Target className="w-12 h-12 mx-auto mb-4 text-slate-200" />
              <p className="text-sm font-medium text-slate-600">No ad data for today.</p>
              <p className="text-xs mt-1">Click &ldquo;Sync Now&rdquo; to pull from Meta.</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-white">
                  {(
                    [
                      ["ad_name", "Ad & Campaign"],
                      ["spend", "Spend"],
                      ["impressions", "Impr."],
                      ["clicks", "Clicks"],
                      ["ctr", "CTR"],
                      ["cpc", "CPC"],
                      ["results", "Leads"],
                      ["cost_per_result", "Cost/Lead"],
                    ] as [SortKey, string][]
                  ).map(([key, label]) => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 hover:text-slate-800 transition-colors whitespace-nowrap bg-slate-50/30"
                    >
                      {label}
                      <SortIcon col={key} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedAds.map((ad) => (
                  <tr
                    key={ad.ad_id}
                    className="group hover:bg-slate-50/70 transition-colors"
                  >
                    <td className="px-5 py-2.5 sticky left-0 bg-white group-hover:bg-slate-50/70 shadow-[4px_0_12px_rgba(0,0,0,0.03)] sm:shadow-none z-10 transition-colors">
                      <div className="max-w-[280px]">
                        <p className="font-medium text-slate-900 truncate text-sm">
                          {ad.ad_name}
                        </p>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {isAllProjects && <span className="font-medium text-blue-600 mr-1">[{ad.project_name}]</span>}
                          {ad.campaign_name}
                        </p>
                      </div>
                    </td>
                    <td className="px-5 py-2.5 font-medium text-slate-700 whitespace-nowrap">
                      {formatINR(ad.spend)}
                    </td>
                    <td className="px-5 py-2.5 text-slate-500 whitespace-nowrap">
                      {ad.impressions.toLocaleString("en-IN")}
                    </td>
                    <td className="px-5 py-2.5 text-slate-500">{ad.clicks.toLocaleString("en-IN")}</td>
                    <td className="px-5 py-2.5 text-slate-500">{formatNum(ad.ctr)}%</td>
                    <td className="px-5 py-2.5 text-slate-500">{formatINR(ad.cpc)}</td>
                    <td className="px-5 py-2.5">
                      <span
                        className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold min-w-[28px] ${
                          ad.results > 0
                            ? "bg-blue-50 text-blue-700 border border-blue-100"
                            : "bg-slate-100 text-slate-500 border border-slate-200"
                        }`}
                      >
                        {ad.results}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 font-semibold whitespace-nowrap">
                      <span
                        className={
                          ad.results === 0 ? "text-slate-400" : "text-slate-900"
                        }
                      >
                        {ad.results === 0 ? "—" : formatINR(ad.cost_per_result)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DailyDashboard() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">Loading Dashboard...</div>}>
      <DashboardClient />
    </Suspense>
  );
}
