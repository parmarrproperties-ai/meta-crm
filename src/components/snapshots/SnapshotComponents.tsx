import React from "react";
import { SnapshotFrame } from "./SnapshotFrame";
import { formatNum } from "@/lib/compute";
import { Target, Users, MousePointerClick, DollarSign } from "lucide-react";

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function SnapshotStatCards({
  id,
  title,
  subtitle,
  stats,
}: {
  id: string;
  title: string;
  subtitle: string;
  stats: Array<{ label: string; value: string; icon: "spend" | "leads" | "cpa" | "ctr" }>;
}) {
  const iconMap = {
    spend: <DollarSign className="w-5 h-5" />,
    leads: <Target className="w-5 h-5" />,
    cpa: <Users className="w-5 h-5" />,
    ctr: <MousePointerClick className="w-5 h-5" />,
  };

  return (
    <div className="absolute left-[-9999px] top-0 pointer-events-none">
      <div id={id}>
        <SnapshotFrame title={title} subtitle={subtitle}>
        <div className="grid grid-cols-4 gap-4 bg-slate-50 p-6">
          {stats.map((s, i) => (
            <div key={i} className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
              <div className="flex items-center gap-3 text-slate-500 mb-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  {iconMap[s.icon]}
                </div>
                <span className="text-sm font-medium">{s.label}</span>
              </div>
              <div className="text-2xl font-bold text-slate-900">{s.value}</div>
            </div>
          ))}
        </div>
      </SnapshotFrame>
      </div>
    </div>
  );
}

export function SnapshotTable({
  id,
  title,
  subtitle,
  columns,
  data,
  renderRow,
}: {
  id: string;
  title: string;
  subtitle: string;
  columns: string[];
  data: any[];
  renderRow: (row: any, i: number) => React.ReactNode;
}) {
  const MAX_ROWS = 10;
  const visibleData = data.slice(0, MAX_ROWS);
  const hiddenCount = data.length - MAX_ROWS;

  return (
    <div className="absolute left-[-9999px] top-0 pointer-events-none">
      <div id={id}>
        <SnapshotFrame title={title} subtitle={subtitle}>
        <div className="bg-white">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50">
                {columns.map((col, i) => (
                  <th key={i} className="px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleData.map((row, i) => renderRow(row, i))}
            </tbody>
          </table>
          {hiddenCount > 0 && (
            <div className="p-4 text-center text-sm font-medium text-slate-500 bg-slate-50/30 border-t border-slate-100">
              + {hiddenCount} more rows not shown
            </div>
          )}
        </div>
      </SnapshotFrame>
      </div>
    </div>
  );
}
