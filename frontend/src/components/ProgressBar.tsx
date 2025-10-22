interface ProgressBarProps {
  current: number;
  total: number;
}

export default function ProgressBar({ current, total }: ProgressBarProps) {
  const percentage = Math.min(100, (current / Math.max(total, 1)) * 100);
  return (
    <div className="w-full rounded-full bg-slate-800">
      <div
        className="rounded-full bg-primary/80 py-1 text-center text-xs font-semibold text-white transition-all"
        style={{ width: `${percentage}%` }}
      >
        {Math.round(percentage)}%
      </div>
    </div>
  );
}
