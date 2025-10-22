import { AnswerValue } from "../types";

interface AnswerControlsProps {
  disabled?: boolean;
  onAnswer: (answer: AnswerValue) => void;
  onSkip?: () => void;
  className?: string;
}

const buttons: { label: string; answer: AnswerValue; style: string }[] = [
  { label: "✔ Yes", answer: "yes", style: "bg-emerald-600 hover:bg-emerald-500" },
  { label: "✘ No", answer: "no", style: "bg-rose-600 hover:bg-rose-500" }
];

export default function AnswerControls({
  disabled,
  onAnswer,
  onSkip,
  className
}: AnswerControlsProps) {
  const containerClasses = [
    "rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-4 text-sm text-slate-300 shadow-lg sm:px-5 sm:py-5",
    className ?? ""
  ]
    .join(" ")
    .trim();

  return (
    <div className={containerClasses}>
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2 sm:justify-items-center">
          {buttons.map(({ label, answer, style }) => (
            <button
              key={answer}
              type="button"
              disabled={disabled}
              onClick={() => onAnswer(answer)}
              className={`w-full rounded-lg px-6 py-4 text-base font-semibold text-white transition sm:w-48 ${
                disabled
                  ? "cursor-not-allowed bg-slate-700/60 text-slate-300"
                  : style
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {onSkip && (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              disabled={disabled}
              onClick={onSkip}
              className="w-full max-w-[180px] rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Skip
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
