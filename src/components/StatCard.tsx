"use client";

import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  change?: number | null;
  invertGood?: boolean; // true if lower is better (e.g. CPA)
  icon?: React.ReactNode;
  className?: string;
  loading?: boolean;
}

export function StatCard({
  label,
  value,
  change,
  invertGood = false,
  icon,
  className,
  loading = false,
}: StatCardProps) {
  const isPositive = change !== null && change !== undefined
    ? invertGood ? change < 0 : change > 0
    : null;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-white border border-slate-200 p-6 transition-all duration-200 hover:border-slate-300 hover:shadow-lg hover:-translate-y-0.5",
        className
      )}
    >
      {/* Subtle gradient glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 via-transparent to-transparent pointer-events-none" />

      <div className="relative">
        <div className="flex items-start justify-between mb-4">
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          {icon && (
            <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-500 shadow-sm">
              {icon}
            </div>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            <div className="h-8 bg-slate-100 rounded-lg animate-pulse w-3/4" />
            <div className="h-4 bg-slate-50 rounded animate-pulse w-1/3" />
          </div>
        ) : (
          <>
            <p className="text-2xl font-bold text-slate-900 tracking-tight">{value}</p>

            {change !== null && change !== undefined && (
              <div
                className={cn(
                  "flex items-center gap-1 mt-2 text-sm font-semibold",
                  isPositive === true
                    ? "text-emerald-600 bg-emerald-50 w-max px-2 py-0.5 rounded"
                    : isPositive === false
                    ? "text-red-600 bg-red-50 w-max px-2 py-0.5 rounded"
                    : "text-slate-500 bg-slate-100 w-max px-2 py-0.5 rounded"
                )}
              >
                {change > 0 ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : change < 0 ? (
                  <TrendingDown className="w-3.5 h-3.5" />
                ) : (
                  <Minus className="w-3.5 h-3.5" />
                )}
                <span>
                  {change > 0 ? "+" : ""}
                  {change.toFixed(1)}% vs last week
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
