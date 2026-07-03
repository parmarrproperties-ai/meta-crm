export function SnapshotFrame({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="bg-slate-50 p-6 sm:p-8 w-[800px] flex flex-col font-sans">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">{title}</h1>
          <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-blue-600">Impeccable</div>
          <div className="text-xs text-slate-400">Meta Ads Analytics</div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {children}
      </div>

      {/* Footer */}
      <div className="mt-6 text-center text-xs text-slate-400 font-medium">
        Generated on {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
      </div>
    </div>
  );
}
