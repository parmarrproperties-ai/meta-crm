"use client";

import { useEffect, useState, useCallback, Suspense, useMemo } from "react";
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
  Calendar,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { ShareButton } from "@/components/ShareButton";
import { SnapshotStatCards, SnapshotTable } from "@/components/snapshots/SnapshotComponents";
import { computeDailySummary, type AdSnapshot as AdRow, type DailySummary } from "@/lib/compute";
import { useSearchParams } from "next/navigation";

interface PortfolioRow {
  project_name: string;
  account_name?: string;
  spend: number;
  results: number;
  impressions: number;
  clicks: number;
  cost_per_result: number;
  ctr: number;
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

function formatDateRangeLabel(range: string, sd?: string, ed?: string): string {
  const today = new Date();
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });

  switch (range) {
    case "today": return `Today · ${fmt(today)}`;
    case "yesterday": {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      return `Yesterday · ${fmt(y)}`;
    }
    case "last_month": {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return `${fmt(start)} – ${fmt(end)}`;
    }
    case "custom": {
      if (sd && ed) return `${fmt(new Date(sd))} – ${fmt(new Date(ed))}`;
      return "Custom Range";
    }
    case "7d": case "14d": case "30d": default: {
      const days = range === "7d" ? 7 : range === "14d" ? 14 : 30;
      const start = new Date(today); start.setDate(start.getDate() - (days - 1));
      return `${fmt(start)} – ${fmt(today)}`;
    }
  }
}

const trendDaysFor = (range: string, sd?: string, ed?: string) => {
  if (range === "7d") return 7;
  if (range === "last_month" || range === "30d") return 30;
  if (range === "custom" && sd && ed) {
    const diff = new Date(ed).getTime() - new Date(sd).getTime();
    return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1);
  }
  return 14;
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
  const [adScope, setAdScope] = useState<"overall" | "per-campaign">("overall");
  const [dateRange, setDateRange] = useState<"today" | "yesterday" | "7d" | "14d" | "30d" | "last_month" | "custom">("today");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [activeAdsOnly, setActiveAdsOnly] = useState(false);
  const [activeCampOnly, setActiveCampOnly] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<string>("all");

  const availableCampaigns = useMemo(() => {
    if (!summary) return [];
    const camps = summary.ads.map((ad) => ad.campaign_name).filter(Boolean);
    return Array.from(new Set(camps)).sort();
  }, [summary]);

  const displayedSummary = useMemo(() => {
    if (!summary) return null;
    if (selectedCampaign === "all") return summary;
    const filteredAds = summary.ads.filter((ad) => ad.campaign_name === selectedCampaign);
    return computeDailySummary(filteredAds, summary.date);
  }, [summary, selectedCampaign]);

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
      } else if (dateRange === "last_month") {
        sd = new Date(sd.getFullYear(), sd.getMonth() - 1, 1);
        ed = new Date(sd.getFullYear(), sd.getMonth(), 0);
      } else if (dateRange === "custom") {
        if (customStartDate && customEndDate) {
          sd = new Date(customStartDate);
          ed = new Date(customEndDate);
        }
      } else if (dateRange === "30d") {
        sd.setDate(sd.getDate() - 29);
      }

      const startDate = sd.toISOString().split("T")[0];
      const endDate = ed.toISOString().split("T")[0];
      const trendDays = trendDaysFor(dateRange, customStartDate, customEndDate);

      const res = await fetch(`/api/ads/summary?project=${encodeURIComponent(currentProject)}&startDate=${startDate}&endDate=${endDate}&days=${trendDays}`);
      const json = await res.json();
      if (json.summary) setSummary(json.summary);
      if (json.trend) setTrend(json.trend);
      if (json.portfolio) setPortfolio(json.portfolio);
    } catch {
      showToast("Failed to load dashboard data", "error");
    } finally {
      setLoading(false);
    }
  }, [currentProject, dateRange, customStartDate, customEndDate]);

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

  const todayLabel = formatDateRangeLabel(dateRange, customStartDate, customEndDate);

  const handleNativeShare = async () => {
    if (!displayedSummary) return;
    const { generateDailyWhatsAppText } = await import("@/lib/whatsappFormat");
    const text = generateDailyWhatsAppText(displayedSummary, currentProject, todayLabel);
    
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

  const filteredAds = (displayedSummary?.ads ?? []).filter((a) => !activeAdsOnly || a.spend > 0 || a.impressions > 0 || a.results > 0);
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

  const filteredCampaigns = (displayedSummary?.campaigns ?? []).filter(
    (c) => !activeCampOnly || c.spend > 0 || c.impressions > 0 || c.results > 0
  );
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

  const isAllProjects = currentProject === "all";

  return (
    <div className="p-4 sm:p-8 min-h-screen pb-20">
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
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            {isAllProjects ? "Portfolio Dashboard" : currentProject}
          </h1>
          <p className="text-slate-500 text-sm mt-1.5 font-medium" suppressHydrationWarning>{todayLabel}</p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <div className="relative flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            {dateRange !== "custom" && (
              <div className="relative w-full sm:w-auto">
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value as any)}
                  className="appearance-none w-full sm:w-auto pl-9 pr-8 py-2.5 sm:py-2 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer shadow-sm h-[44px] sm:h-auto"
                >
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="14d">Last 14 Days</option>
                  <option value="30d">Last 30 Days</option>
                  <option value="last_month">Last Month</option>
                </select>
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}

            {dateRange === "custom" && (
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 bg-white border border-slate-200 rounded-xl p-1 sm:p-1 shadow-sm w-full sm:w-auto h-auto min-h-[44px]">
                <input 
                  type="date" 
                  value={customStartDate} 
                  onChange={e => setCustomStartDate(e.target.value)}
                  className="flex-1 text-sm px-2 py-1.5 sm:py-1 bg-transparent text-slate-700 outline-none min-w-[120px]" 
                />
                <span className="text-slate-400 text-sm px-1">to</span>
                <input 
                  type="date" 
                  value={customEndDate} 
                  onChange={e => setCustomEndDate(e.target.value)}
                  className="flex-1 text-sm px-2 py-1.5 sm:py-1 bg-transparent text-slate-700 outline-none min-w-[120px]" 
                />
                <button 
                  onClick={() => setDateRange("today")} 
                  className="w-full sm:w-auto px-2 py-2 sm:py-1 text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors border-t border-slate-100 sm:border-0"
                >
                  Cancel
                </button>
              </div>
            )}

            {dateRange !== "custom" && (
              <button
                onClick={() => setDateRange("custom")}
                className="w-full sm:w-auto flex justify-center items-center gap-2 px-3 py-2.5 sm:py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-sm font-medium text-slate-700 transition-all duration-150 shadow-sm h-[44px] sm:h-auto"
              >
                <Calendar className="w-4 h-4 text-slate-500" />
                <span className="inline sm:hidden">Custom Date Range</span>
                <span className="hidden sm:inline">Custom</span>
              </button>
            )}
          </div>

          <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-4 py-2.5 sm:py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-sm font-medium text-slate-700 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm h-[44px] sm:h-auto"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              <span className="inline">{refreshing ? "Syncing..." : "Sync Now"}</span>
            </button>

            <button
              onClick={handleNativeShare}
              disabled={!summary}
              className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-4 py-2.5 sm:py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-medium text-white transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-blue-600/20 h-[44px] sm:h-auto"
            >
              <Share2 className="w-4 h-4" />
              <span className="inline">Share<span className="hidden sm:inline"> Report (S)</span></span>
            </button>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900">Top-Level Metrics</h3>
        <ShareButton elementId="snapshot-stat-cards" fileName="top-level-metrics" title="Top-Level Metrics" />
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-8">
        <StatCard
          label="Total Spend"
          value={displayedSummary ? formatINR(displayedSummary.totalSpend) : "₹0"}
          icon={<DollarSign className="w-4 h-4" />}
          loading={loading}
        />
        <StatCard
          label="Total Leads / Results"
          value={displayedSummary ? String(displayedSummary.totalResults) : "0"}
          icon={<Target className="w-4 h-4" />}
          loading={loading}
        />
        <StatCard
          label="Avg Cost Per Lead"
          value={displayedSummary ? formatINR(displayedSummary.avgCPA) : "₹0"}
          icon={<Users className="w-4 h-4" />}
          loading={loading}
          invertGood
        />
        <StatCard
          label="Avg CTR"
          value={displayedSummary ? `${formatNum(displayedSummary.avgCTR)}%` : "0%"}
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
            <ShareButton elementId="snapshot-portfolio" fileName="portfolio-breakdown" title="Portfolio Breakdown" />
          </div>
          <div className="overflow-x-auto sm:overflow-visible">
            <table className="w-full text-sm text-left">
              <thead className="hidden sm:table-header-group">
                <tr className="border-b border-slate-100 bg-slate-50/30">
                  <th className="px-5 py-3 text-xs font-semibold text-slate-500 text-left uppercase tracking-wider">Project Name</th>
                  <th className="px-5 py-3 text-xs font-semibold text-slate-500 text-left uppercase tracking-wider">Account Name</th>
                  <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Spend</th>
                  <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Leads</th>
                  <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Cost/Lead</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 sm:divide-y sm:divide-slate-100 space-y-4 sm:space-y-0 p-4 sm:p-0 flex flex-col sm:table-row-group bg-slate-50/50 sm:bg-transparent">
                {portfolio.map((p) => (
                  <tr key={`${p.project_name}::${p.account_name}`} className="flex flex-col sm:table-row bg-white rounded-xl border border-slate-200 sm:border-0 sm:bg-transparent shadow-sm sm:shadow-none hover:bg-slate-50/50 transition-colors p-1 sm:p-0">
                    <td className="px-4 py-3 sm:px-5 sm:py-2.5 font-medium text-slate-900 border-b border-slate-50 sm:border-0 flex justify-between items-center sm:table-cell">
                      <span className="sm:hidden font-medium text-slate-500 text-xs uppercase">Project</span>
                      <div className="max-w-[150px] sm:max-w-[200px] truncate text-right sm:text-left">
                        {p.project_name}
                      </div>
                    </td>
                    <td className="px-4 py-3 sm:px-5 sm:py-2.5 text-slate-700 border-b border-slate-50 sm:border-0 flex justify-between items-center sm:table-cell">
                      <span className="sm:hidden font-medium text-slate-500 text-xs uppercase">Account</span>
                      <div className="max-w-[150px] sm:max-w-[200px] truncate text-right sm:text-left">
                        {p.account_name}
                      </div>
                    </td>
                    <td className="px-4 py-3 sm:px-5 sm:py-2.5 text-slate-600 border-b border-slate-50 sm:border-0 flex justify-between items-center sm:table-cell">
                      <span className="sm:hidden font-medium text-slate-500 text-xs uppercase">Spend</span>
                      {formatINR(p.spend)}
                    </td>
                    <td className="px-4 py-3 sm:px-5 sm:py-2.5 border-b border-slate-50 sm:border-0 flex justify-between items-center sm:table-cell">
                      <span className="sm:hidden font-medium text-slate-500 text-xs uppercase">Leads</span>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                        {p.results}
                      </span>
                    </td>
                    <td className="px-4 py-3 sm:px-5 sm:py-2.5 font-medium text-slate-900 flex justify-between items-center sm:table-cell">
                      <span className="sm:hidden font-medium text-slate-500 text-xs uppercase">Cost/Lead</span>
                      {formatINR(p.cost_per_result)}
                    </td>
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
          <h3 className="font-semibold text-slate-900">Performance Trend (Last {trendDaysFor(dateRange, customStartDate, customEndDate)} Days)</h3>
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

      {/* Campaign Filter Dropdown */}
      <div className="flex items-center gap-3 mb-4 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <span className="text-sm font-medium text-slate-600 ml-2">Filter by Campaign:</span>
        <select
          value={selectedCampaign}
          onChange={(e) => setSelectedCampaign(e.target.value)}
          disabled={availableCampaigns.length === 0}
          className="flex-1 appearance-none bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="all">All Campaigns</option>
          {availableCampaigns.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Campaign Performance Table */}
      <div id="snapshot-campaigns" className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-sm mb-8">
        <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
          <div>
            <h3 className="font-semibold text-slate-900">Campaign Performance</h3>
            <p className="text-xs text-slate-500 mt-1">Rollup by campaign</p>
          </div>
          <div className="flex items-center gap-4">
            <ShareButton elementId="snapshot-campaigns" fileName="campaign-performance" title="Campaign Performance" />
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

        <div className="overflow-x-auto sm:overflow-visible">
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
              <thead className="hidden sm:table-header-group">
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
              <tbody className="divide-y divide-slate-100 sm:divide-y sm:divide-slate-100 space-y-4 sm:space-y-0 p-4 sm:p-0 flex flex-col sm:table-row-group bg-slate-50/50 sm:bg-transparent">
                {sortedCampaigns.map((camp) => (
                  <tr
                    key={camp.campaign_name}
                    className="flex flex-col sm:table-row bg-white rounded-xl border border-slate-200 sm:border-0 sm:bg-transparent shadow-sm sm:shadow-none hover:bg-slate-50/50 transition-colors p-1 sm:p-0 group"
                  >
                    <td className="px-4 py-3 sm:px-5 sm:py-2.5 border-b border-slate-50 sm:border-0 flex justify-between items-center sm:table-cell group-hover:bg-slate-50/70 transition-colors sticky sm:static left-0 bg-white z-10">
                      <span className="sm:hidden font-medium text-slate-500 text-xs uppercase">Campaign</span>
                      <p className="font-medium text-slate-900 text-sm max-w-[150px] sm:max-w-[280px] truncate text-right sm:text-left">
                        {camp.campaign_name}
                      </p>
                    </td>
                    <td className="px-4 py-3 sm:px-5 sm:py-2.5 font-medium text-slate-700 border-b border-slate-50 sm:border-0 flex justify-between items-center sm:table-cell whitespace-nowrap">
                      <span className="sm:hidden font-medium text-slate-500 text-xs uppercase">Spend</span>
                      <span className="font-medium text-slate-700">{formatINR(camp.spend)}</span>
                    </td>
                    <td className="px-4 py-3 sm:px-5 sm:py-2.5 text-slate-500 border-b border-slate-50 sm:border-0 flex justify-between items-center sm:table-cell whitespace-nowrap">
                      <span className="sm:hidden font-medium text-slate-500 text-xs uppercase">Impr.</span>
                      {camp.impressions.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3 sm:px-5 sm:py-2.5 text-slate-500 border-b border-slate-50 sm:border-0 flex justify-between items-center sm:table-cell">
                      <span className="sm:hidden font-medium text-slate-500 text-xs uppercase">Clicks</span>
                      {camp.clicks.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3 sm:px-5 sm:py-2.5 text-slate-500 border-b border-slate-50 sm:border-0 flex justify-between items-center sm:table-cell">
                      <span className="sm:hidden font-medium text-slate-500 text-xs uppercase">CTR</span>
                      {formatNum(camp.ctr)}%
                    </td>
                    <td className="px-4 py-3 sm:px-5 sm:py-2.5 text-slate-500 border-b border-slate-50 sm:border-0 flex justify-between items-center sm:table-cell">
                      <span className="sm:hidden font-medium text-slate-500 text-xs uppercase">CPC</span>
                      {formatINR(camp.cpc)}
                    </td>
                    <td className="px-4 py-3 sm:px-5 sm:py-2.5 border-b border-slate-50 sm:border-0 flex justify-between items-center sm:table-cell">
                      <span className="sm:hidden font-medium text-slate-500 text-xs uppercase">Leads</span>
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
                    <td className="px-4 py-3 sm:px-5 sm:py-2.5 font-semibold border-b border-slate-50 sm:border-0 flex justify-between items-center sm:table-cell whitespace-nowrap">
                      <span className="sm:hidden font-medium text-slate-500 text-xs uppercase">Cost/Lead</span>
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
      <div id="snapshot-ads" className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
          <div>
            <h3 className="font-semibold text-slate-900">Ad Performance</h3>
            <p className="text-xs text-slate-500 mt-1">Click column headers to sort</p>
          </div>
          <div className="flex items-center gap-4">
            <ShareButton elementId="snapshot-ads" fileName="ad-performance" title="Ad Performance" />
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setAdScope("overall")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  adScope === "overall"
                    ? "bg-white text-slate-900 shadow-sm border border-slate-200/60"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Overall
              </button>
              <button
                onClick={() => setAdScope("per-campaign")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  adScope === "per-campaign"
                    ? "bg-white text-slate-900 shadow-sm border border-slate-200/60"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Per-Campaign
              </button>
            </div>
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

        <div className="overflow-x-auto sm:overflow-visible">
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
              <thead className="hidden sm:table-header-group">
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
              <tbody className="divide-y divide-slate-100 sm:divide-y sm:divide-slate-100 space-y-4 sm:space-y-0 p-4 sm:p-0 flex flex-col sm:table-row-group bg-slate-50/50 sm:bg-transparent">
                {(adScope === "overall" 
                  ? sortedAds 
                  : Array.from(new Set(sortedAds.map(a => a.campaign_name)))
                      .map(campName => {
                        const campAds = sortedAds.filter(a => a.campaign_name === campName);
                        const campSpend = campAds.reduce((sum, a) => sum + a.spend, 0);
                        return { campName, campAds, campSpend };
                      })
                      .sort((a, b) => b.campSpend - a.campSpend)
                      .flatMap(({ campName, campAds }) => [
                        { isHeader: true, title: campName, id: `header-${campName}` },
                        ...campAds
                      ])
                ).map((item: any) => {
                  if (item.isHeader) {
                    return (
                      <tr key={item.id} className="bg-slate-50/80 rounded-xl sm:rounded-none">
                        <td colSpan={8} className="px-4 py-3 sm:px-5 sm:py-2 font-bold text-slate-700 text-xs uppercase tracking-wider block sm:table-cell">
                          {item.title}
                        </td>
                      </tr>
                    );
                  }
                  
                  const ad = item;
                  return (
                    <tr
                      key={ad.ad_id}
                      className="flex flex-col sm:table-row bg-white rounded-xl border border-slate-200 sm:border-0 sm:bg-transparent shadow-sm sm:shadow-none hover:bg-slate-50/50 transition-colors p-1 sm:p-0 group"
                    >
                      <td className="px-4 py-3 sm:px-5 sm:py-2.5 border-b border-slate-50 sm:border-0 flex justify-between items-start sm:items-center sm:table-cell group-hover:bg-slate-50/70 transition-colors sticky sm:static left-0 bg-white z-10">
                        <span className="sm:hidden font-medium text-slate-500 text-xs uppercase mt-0.5">Ad / Camp</span>
                        <div className="max-w-[200px] sm:max-w-[280px] text-right sm:text-left">
                          <p className="font-medium text-slate-900 truncate text-sm">
                            {ad.ad_name}
                          </p>
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            {isAllProjects && <span className="font-medium text-blue-600 mr-1">[{ad.project_name}]</span>}
                            {ad.campaign_name}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 sm:px-5 sm:py-2.5 font-medium text-slate-700 border-b border-slate-50 sm:border-0 flex justify-between items-center sm:table-cell whitespace-nowrap">
                        <span className="sm:hidden font-medium text-slate-500 text-xs uppercase">Spend</span>
                        <span className="font-medium text-slate-700">{formatINR(ad.spend)}</span>
                      </td>
                      <td className="px-4 py-3 sm:px-5 sm:py-2.5 text-slate-500 border-b border-slate-50 sm:border-0 flex justify-between items-center sm:table-cell whitespace-nowrap">
                        <span className="sm:hidden font-medium text-slate-500 text-xs uppercase">Impr.</span>
                        {ad.impressions.toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3 sm:px-5 sm:py-2.5 text-slate-500 border-b border-slate-50 sm:border-0 flex justify-between items-center sm:table-cell">
                        <span className="sm:hidden font-medium text-slate-500 text-xs uppercase">Clicks</span>
                        {ad.clicks.toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3 sm:px-5 sm:py-2.5 text-slate-500 border-b border-slate-50 sm:border-0 flex justify-between items-center sm:table-cell">
                        <span className="sm:hidden font-medium text-slate-500 text-xs uppercase">CTR</span>
                        {formatNum(ad.ctr)}%
                      </td>
                      <td className="px-4 py-3 sm:px-5 sm:py-2.5 text-slate-500 border-b border-slate-50 sm:border-0 flex justify-between items-center sm:table-cell">
                        <span className="sm:hidden font-medium text-slate-500 text-xs uppercase">CPC</span>
                        {formatINR(ad.cpc)}
                      </td>
                      <td className="px-4 py-3 sm:px-5 sm:py-2.5 border-b border-slate-50 sm:border-0 flex justify-between items-center sm:table-cell">
                        <span className="sm:hidden font-medium text-slate-500 text-xs uppercase">Leads</span>
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
                      <td className="px-4 py-3 sm:px-5 sm:py-2.5 font-semibold border-b border-slate-50 sm:border-0 flex justify-between items-center sm:table-cell whitespace-nowrap">
                        <span className="sm:hidden font-medium text-slate-500 text-xs uppercase">Cost/Lead</span>
                        <span
                          className={
                            ad.results === 0 ? "text-slate-400" : "text-slate-900"
                          }
                        >
                          {ad.results === 0 ? "—" : formatINR(ad.cost_per_result)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {summary && (
        <>
          <SnapshotStatCards
            id="snapshot-stat-cards"
            title={`${isAllProjects ? 'Portfolio' : currentProject} Performance`}
            subtitle={todayLabel}
            stats={[
              { label: "Total Spend", value: displayedSummary ? formatINR(displayedSummary.totalSpend) : "₹0", icon: "spend" },
              { label: "Total Leads", value: displayedSummary ? String(displayedSummary.totalResults) : "0", icon: "leads" },
              { label: "Cost Per Lead", value: displayedSummary ? formatINR(displayedSummary.avgCPA) : "₹0", icon: "cpa" },
              { label: "Avg CTR", value: displayedSummary ? `${formatNum(displayedSummary.avgCTR)}%` : "0%", icon: "ctr" },
            ]}
          />
          {isAllProjects && portfolio.length > 0 && (
            <SnapshotTable
              id="snapshot-portfolio"
              title="Portfolio Breakdown"
              subtitle={todayLabel}
              columns={["Project Name", "Account Name", "Spend", "Leads", "Cost/Lead"]}
              data={portfolio}
              renderRow={(p, i) => (
                <tr key={i}>
                  <td className="px-5 py-2.5 font-medium">{p.project_name}</td>
                  <td className="px-5 py-2.5">{p.account_name}</td>
                  <td className="px-5 py-2.5">{formatINR(p.spend)}</td>
                  <td className="px-5 py-2.5">{p.results}</td>
                  <td className="px-5 py-2.5">{formatINR(p.cost_per_result)}</td>
                </tr>
              )}
            />
          )}
          {!isAllProjects && sortedCampaigns.length > 0 && (
            <SnapshotTable
              id="snapshot-campaigns"
              title={`${currentProject} Campaigns`}
              subtitle={todayLabel}
              columns={["Campaign", "Spend", "Leads", "Cost/Lead"]}
              data={sortedCampaigns}
              renderRow={(camp, i) => (
                <tr key={i}>
                  <td className="px-5 py-2.5 font-medium">{camp.campaign_name}</td>
                  <td className="px-5 py-2.5">{formatINR(camp.spend)}</td>
                  <td className="px-5 py-2.5">{camp.results}</td>
                  <td className="px-5 py-2.5">{formatINR(camp.cost_per_result)}</td>
                </tr>
              )}
            />
          )}
          {!isAllProjects && sortedAds.length > 0 && (
            <SnapshotTable
              id="snapshot-ads"
              title={`${currentProject} Ads`}
              subtitle={todayLabel}
              columns={["Ad & Campaign", "Spend", "Leads", "Cost/Lead"]}
              data={sortedAds}
              renderRow={(ad, i) => (
                <tr key={i}>
                  <td className="px-5 py-2.5">
                    <p className="font-medium text-slate-900">{ad.ad_name}</p>
                    <p className="text-xs text-slate-500">{ad.campaign_name}</p>
                  </td>
                  <td className="px-5 py-2.5">{formatINR(ad.spend)}</td>
                  <td className="px-5 py-2.5">{ad.results}</td>
                  <td className="px-5 py-2.5">{formatINR(ad.cost_per_result)}</td>
                </tr>
              )}
            />
          )}
        </>
      )}
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
