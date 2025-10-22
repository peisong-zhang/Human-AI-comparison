interface TimerDisplayProps {
  label: string;
  value: string;
  variant?: "primary" | "warning" | "danger";
}

export default function TimerDisplay({
  label,
  value,
  variant = "primary"
}: TimerDisplayProps) {
  const variantClass =
    variant === "danger"
      ? "bg-red-500/20 text-red-200 border-red-400/60"
      : variant === "warning"
        ? "bg-amber-500/20 text-amber-100 border-amber-400/60"
        : "bg-blue-500/20 text-blue-100 border-blue-400/60";

  return (
    <div className={`rounded-md border px-3 py-2 text-sm font-medium ${variantClass}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
