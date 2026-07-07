"use client";

import { useEffect, useState, useMemo } from "react";
import {
  RefreshCw,
  Search,
  Calendar,
  Users
} from "lucide-react";
import { useSearchParams } from "next/navigation";

interface LeadRow {
  id: string;
  lead_id: string;
  created_time: string;
  ad_name: string;
  campaign_name: string;
  project_name: string;
  field_data: Record<string, string>;
}

export default function LeadsPage() {
  const searchParams = useSearchParams();
  const currentProject = searchParams.get("project") || "all";

  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Since time_created is what matters for leads, let's keep it simple with a date range
  const [dateRange, setDateRange] = useState<"today" | "yesterday" | "7d" | "30d" | "all">("today");

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchLeads = async () => {
    setLoading(true);
    try {
      let startDateStr = "";
      let endDateStr = "";

      if (dateRange !== "all") {
        const today = new Date();
        let startDate = new Date();
        
        switch (dateRange) {
          case "today":
            startDate.setHours(0, 0, 0, 0);
            break;
          case "yesterday":
            startDate.setDate(today.getDate() - 1);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(startDate);
            endDate.setHours(23, 59, 59, 999);
            endDateStr = endDate.toISOString();
            break;
          case "7d":
            startDate.setDate(today.getDate() - 7);
            startDate.setHours(0, 0, 0, 0);
            break;
          case "30d":
            startDate.setDate(today.getDate() - 30);
            startDate.setHours(0, 0, 0, 0);
            break;
        }
        
        startDateStr = startDate.toISOString();
      }

      const params = new URLSearchParams();
      if (currentProject !== "all") params.set("project", currentProject);
      if (startDateStr) params.set("startDate", startDateStr);
      if (endDateStr) params.set("endDate", endDateStr);

      const res = await fetch(`/api/leads?${params.toString()}`);
      const json = await res.json();
      
      if (!json.success) {
        throw new Error(json.error || "Failed to load leads");
      }
      
      setLeads(json.leads || []);
    } catch (err: any) {
      console.error(err);
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject, dateRange]);

  const handleSyncLeads = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const dateStr = new Date().toISOString().split("T")[0]; // Sync today by default, or could match date range
      const res = await fetch(`/api/leads/fetch?date=${dateStr}`, { method: "POST" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to fetch leads");
      
      showToast(`Synced ${json.upserted} leads.`, "success");
      await fetchLeads();
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setRefreshing(false);
    }
  };

  const filteredLeads = useMemo(() => {
    if (!searchQuery) return leads;
    const lowerQuery = searchQuery.toLowerCase();
    return leads.filter((lead) => {
      const inProject = lead.project_name?.toLowerCase().includes(lowerQuery);
      const inCampaign = lead.campaign_name?.toLowerCase().includes(lowerQuery);
      const inAd = lead.ad_name?.toLowerCase().includes(lowerQuery);
      
      const inFields = Object.values(lead.field_data || {}).some(val => 
        String(val).toLowerCase().includes(lowerQuery)
      );

      return inProject || inCampaign || inAd || inFields;
    });
  }, [leads, searchQuery]);

  // Extract all unique field keys to form dynamic columns
  const dynamicColumns = useMemo(() => {
    const keys = new Set<string>();
    leads.forEach(lead => {
      if (lead.field_data) {
        Object.keys(lead.field_data).forEach(k => keys.add(k));
      }
    });
    return Array.from(keys);
  }, [leads]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 px-4 py-3 rounded-lg shadow-lg z-50 text-white ${toast.type === "error" ? "bg-red-500" : "bg-emerald-500"} animate-in fade-in slide-in-from-top-2`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight">
              Lead Center
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {currentProject === "all" ? "All Projects" : currentProject}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-slate-100/80 p-1 rounded-xl">
            {(["today", "yesterday", "7d", "30d", "all"] as const).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-all ${
                  dateRange === range
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                }`}
              >
                {range === "today" ? "Today" : 
                 range === "yesterday" ? "Yesterday" : 
                 range === "7d" ? "7D" : 
                 range === "30d" ? "30D" : "All Time"}
              </button>
            ))}
          </div>

          <button
            onClick={handleSyncLeads}
            disabled={refreshing}
            className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-4 py-2.5 sm:py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-sm font-medium text-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm h-[44px] sm:h-auto"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            <span className="inline">{refreshing ? "Syncing..." : "Sync Today's Leads"}</span>
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
        {/* Search Bar */}
        <div className="p-4 border-b border-slate-100">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email, campaign..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto min-h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mb-2" />
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500 space-y-3">
              <Users className="w-12 h-12 text-slate-300" />
              <p>No leads found for the selected criteria.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse whitespace-nowrap text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-medium">
                  <th className="px-6 py-3">Time</th>
                  {currentProject === "all" && <th className="px-6 py-3">Project</th>}
                  <th className="px-6 py-3">Campaign</th>
                  {dynamicColumns.map(col => (
                    <th key={col} className="px-6 py-3 capitalize">{col.replace(/_/g, " ")}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      {new Date(lead.created_time).toLocaleString()}
                    </td>
                    {currentProject === "all" && (
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {lead.project_name}
                      </td>
                    )}
                    <td className="px-6 py-4 text-slate-600">
                      <div className="max-w-[200px] truncate" title={lead.campaign_name}>
                        {lead.campaign_name}
                      </div>
                    </td>
                    {dynamicColumns.map(col => (
                      <td key={col} className="px-6 py-4 text-slate-900">
                        {lead.field_data?.[col] || "-"}
                      </td>
                    ))}
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
