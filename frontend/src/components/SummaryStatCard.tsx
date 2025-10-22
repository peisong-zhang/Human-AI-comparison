interface SummaryStatCardProps {
  label: string;
  value: string;
}

export default function SummaryStatCard({ label, value }: SummaryStatCardProps) {
  return (
    <div className="flex flex-col rounded-lg border border-slate-800 bg-slate-900/80 px-4 py-3">
      <span className="text-xs uppercase tracking-widest text-slate-400">{label}</span>
      <span className="text-xl font-semibold text-slate-100">{value}</span>
    </div>
  );
}
