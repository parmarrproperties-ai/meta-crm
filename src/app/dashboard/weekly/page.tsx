"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import {
  AreaChart,
  Area,
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
  Target,
  MousePointerClick,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { useSearchParams } from "next/navigation";

interface WeeklyReport {
  week_start: string;
  week_end: string;
  total_spend: number;
  total_results: number;
  avg_ctr: number;
  avg_cpa: number;
  spend_change_pct: number | null;
  cpa_change_pct: number | null;
  results_change_pct: number | null;
  top_ads: Array<{ ad_name: string; results: number; cost_per_result: number; spend: number }>;
  bottom_ads: Array<{ ad_name: string; results: number; spend: number }>;
  ai_summary: string | null;
}

interface WeeklyHistoryPoint {
  week_start: string;
  total_spend: number;
  total_results: number;
  avg_cpa: number;
}

function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function ChangeChip({
  value,
  invertGood = false,
}: {
  value: number | null;
  invertGood?: boolean;
}) {
  if (value === null) {
    return <span className="text-slate-400 text-xs">N/A</span>;
  }
  const good = invertGood ? value < 0 : value > 0;
  const sign = value > 0 ? "+" : "";
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
        good
          ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
          : "bg-red-50 text-red-600 border border-red-100"
      }`}
    >
      {value > 0 ? (
        <TrendingUp className="w-3 h-3" />
      ) : (
        <TrendingDown className="w-3 h-3" />
      )}
      {sign}{Math.abs(value).toFixed(1)}%
    </span>
  );
}

function WeeklyDashboardClient() {
  const searchParams = useSearchParams();
  const currentProject = searchParams.get("project") || "all";

  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [history, setHistory] = useState<WeeklyHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [activeHistoryMetric, setActiveHistoryMetric] = useState<"total_spend" | "total_results" | "avg_cpa">("total_spend");

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/weekly-read?project=${encodeURIComponent(currentProject)}`);
      const json = await res.json();
      if (json.report) setReport(json.report);
      if (json.history) setHistory(json.history);
    } catch {
      // Report may not exist yet — that's OK
    } finally {
      setLoading(false);
    }
  }, [currentProject]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleCompute = async () => {
    setComputing(true);
    try {
      const res = await fetch(`/api/reports/weekly?project=${encodeURIComponent(currentProject)}`, { method: "POST" });
      const json = await res.json();
      if (json.success) {
        showToast("✓ Weekly report computed", "success");
        setReport({
          week_start: json.weekStart,
          week_end: json.weekEnd,
          total_spend: json.summary.totalSpend,
          total_results: json.summary.totalResults,
          avg_ctr: json.summary.avgCTR,
          avg_cpa: json.summary.avgCPA,
          spend_change_pct: json.summary.spendChangePct,
          cpa_change_pct: json.summary.cpaChangePct,
          results_change_pct: json.summary.resultsChangePct,
          top_ads: json.summary.topAds,
          bottom_ads: json.summary.bottomAds,
          ai_summary: json.aiSummary,
        });
      } else {
        showToast(json.error ?? "Failed to compute weekly report", "error");
      }
    } catch {
      showToast("Network error computing report", "error");
    } finally {
      setComputing(false);
    }
  };


  const historyMetrics = [
    { key: "total_spend" as const, label: "Spend", color: "#3b82f6" },
    { key: "total_results" as const, label: "Leads", color: "#10b981" },
    { key: "avg_cpa" as const, label: "Avg Cost/Lead", color: "#8b5cf6" },
  ];
  const activeMetric = historyMetrics.find((m) => m.key === activeHistoryMetric)!;

  const weekLabel = report
    ? `${new Date(report.week_start).toLocaleDateString("en-IN", { month: "short", day: "numeric" })} – ${new Date(report.week_end).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}`
    : "Last Week";

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
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            Weekly Report
            <span className="text-slate-400 font-normal ml-2 text-xl">
              {isAllProjects ? "Portfolio" : currentProject}
            </span>
          </h1>
          <p className="text-slate-500 text-sm mt-1.5 font-medium" suppressHydrationWarning>{weekLabel}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleCompute}
            disabled={computing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-sm font-medium text-slate-700 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${computing ? "animate-spin" : ""}`} />
            {computing ? "Computing…" : "Compute Report"}
          </button>


        </div>
      </div>

      {/* AI Summary */}
      {report?.ai_summary && (
        <div className="mb-8 rounded-2xl bg-gradient-to-br from-indigo-50/50 to-purple-50/50 border border-indigo-100 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            <span className="text-sm font-semibold text-indigo-700">AI Analysis</span>
          </div>
          <p className="text-slate-700 text-sm leading-relaxed">{report.ai_summary}</p>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-5 mb-8">
        <StatCard
          label="Total Spend"
          value={report ? formatINR(report.total_spend) : "—"}
          change={report?.spend_change_pct}
          icon={<DollarSign className="w-4 h-4" />}
          loading={loading}
        />
        <StatCard
          label="Total Leads"
          value={report ? String(report.total_results) : "—"}
          change={report?.results_change_pct}
          icon={<Target className="w-4 h-4" />}
          loading={loading}
        />
        <StatCard
          label="Avg Cost/Lead"
          value={report ? formatINR(report.avg_cpa) : "—"}
          change={report?.cpa_change_pct}
          invertGood
          icon={<MousePointerClick className="w-4 h-4" />}
          loading={loading}
        />
        <StatCard
          label="Avg CTR"
          value={report ? `${report.avg_ctr.toFixed(2)}%` : "—"}
          icon={<TrendingUp className="w-4 h-4" />}
          loading={loading}
        />
      </div>

      {/* Week-over-week change summary */}
      {report && (
        <div className="grid grid-cols-3 gap-5 mb-8">
          {[
            { label: "Spend Change", value: report.spend_change_pct, invertGood: false },
            { label: "Leads Change", value: report.results_change_pct, invertGood: false },
            { label: "Cost/Lead Change", value: report.cpa_change_pct, invertGood: true },
          ].map(({ label, value, invertGood }) => (
            <div key={label} className="rounded-2xl bg-white border border-slate-200 p-5 flex items-center justify-between shadow-sm">
              <span className="text-sm font-semibold text-slate-500">{label}</span>
              <ChangeChip value={value} invertGood={invertGood} />
            </div>
          ))}
        </div>
      )}

      {/* Top + Bottom Ads */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        {/* Top Ads */}
        <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center border border-emerald-100">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <h3 className="font-semibold text-slate-900 text-sm">Top Performing Ads</h3>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 bg-slate-50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (report?.top_ads ?? []).length === 0 ? (
            <p className="text-slate-400 text-sm">No data yet. Compute report first.</p>
          ) : (
            <div className="space-y-3">
              {(report?.top_ads ?? []).map((ad, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/50 hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                  <span className="text-lg font-bold text-emerald-500 w-6 text-center">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{ad.ad_name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      <span className="font-medium text-slate-700">{ad.results} leads</span> · {formatINR(ad.cost_per_result)}/lead
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Ads */}
        <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center border border-amber-100">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
            <h3 className="font-semibold text-slate-900 text-sm">Underperforming Ads</h3>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 bg-slate-50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (report?.bottom_ads ?? []).length === 0 ? (
            <p className="text-slate-400 text-sm">No underperformers detected.</p>
          ) : (
            <div className="space-y-3">
              {(report?.bottom_ads ?? []).map((ad, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/50 hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                  <span className="text-lg font-bold text-amber-500 w-6 text-center">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{ad.ad_name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      <span className="font-medium text-slate-700">{formatINR(ad.spend)} spend</span> · {ad.results} leads
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 4-Week History Chart */}
      <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold text-slate-900">4-Week History</h3>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            {historyMetrics.map((m) => (
              <button
                key={m.key}
                onClick={() => setActiveHistoryMetric(m.key)}
                className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                  activeHistoryMetric === m.key
                    ? "bg-white text-slate-900 shadow-sm border border-slate-200/60"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {loading || history.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400">
            {loading ? (
              <div className="h-full w-full bg-slate-50 rounded-xl animate-pulse" />
            ) : (
              <p className="text-sm">No history yet — compute reports for previous weeks.</p>
            )}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={history} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={activeMetric.color} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={activeMetric.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="week_start"
                tick={{ fill: "#64748b", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                dy={10}
                tickFormatter={(v) =>
                  new Date(v).toLocaleDateString("en-IN", { month: "short", day: "numeric" })
                }
              />
              <YAxis
                tick={{ fill: "#64748b", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                dx={-10}
                tickFormatter={(v) =>
                  activeHistoryMetric === "total_spend" || activeHistoryMetric === "avg_cpa"
                    ? `₹${(v / 1000).toFixed(0)}k`
                    : String(v)
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
                itemStyle={{ color: activeMetric.color, fontWeight: 600 }}
              />
              <Area
                type="monotone"
                dataKey={activeHistoryMetric}
                stroke={activeMetric.color}
                strokeWidth={3}
                fill="url(#colorMetric)"
                dot={{ fill: "#ffffff", stroke: activeMetric.color, strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, fill: activeMetric.color, stroke: "#ffffff", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default function WeeklyDashboard() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">Loading Dashboard...</div>}>
      <WeeklyDashboardClient />
    </Suspense>
  );
}
