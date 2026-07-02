"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3,
  Calendar,
  MessageCircle,
  RefreshCw,
  TrendingUp,
  Zap,
  ChevronDown
} from "lucide-react";

const navItems = [
  {
    label: "Daily Dashboard",
    href: "/dashboard",
    icon: BarChart3,
  },
  {
    label: "Weekly Report",
    href: "/dashboard/weekly",
    icon: Calendar,
  },
];

import { X } from "lucide-react";

export function Sidebar({ 
  projects = [],
  isOpen = false,
  onClose = () => {}
}: { 
  projects?: string[];
  isOpen?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentProject = searchParams.get("project") || "all";

  const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    if (val === "all") {
      params.delete("project");
    } else {
      params.set("project", val);
    }
    router.push(`${pathname}?${params.toString()}`);
    // Close sidebar on mobile after selection
    onClose();
  };

  const createHref = (basePath: string) => {
    const params = new URLSearchParams(searchParams.toString());
    return `${basePath}${params.toString() ? `?${params.toString()}` : ""}`;
  };

  return (
    <aside className={`fixed left-0 top-0 h-full w-64 bg-white border-r border-slate-200 flex flex-col z-50 shadow-sm transition-transform duration-300 transform lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      {/* Logo */}
      <div className="p-6 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 leading-tight">Meta Ads</p>
            <p className="text-xs text-slate-500">Dashboard</p>
          </div>
        </div>
        <button onClick={onClose} className="lg:hidden p-2 -mr-2 text-slate-500 hover:bg-slate-100 rounded-lg">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Project Selector */}
      <div className="p-4 border-b border-slate-100">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">
          Active Portfolio
        </p>
        <div className="relative">
          <select
            value={currentProject}
            onChange={handleProjectChange}
            className="w-full appearance-none bg-slate-50 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg px-3 py-2.5 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer hover:bg-slate-100"
          >
            <option value="all">All Projects (Portfolio)</option>
            {projects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 mb-3">
          Dashboards
        </p>
        {navItems.map(({ label, href, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={createHref(href)}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                active
                  ? "bg-blue-50 text-blue-700 border border-blue-100 shadow-sm"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          );
        })}


      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/50 mt-auto">
        <p className="text-xs text-slate-400 text-center font-medium">
          Automated Meta Ads v2.0
        </p>
      </div>
    </aside>
  );
}
