import { AnswerValue } from "../types";

interface AnswerControlsProps {
  disabled?: boolean;
  onAnswer: (answer: AnswerValue) => void;
  onSkip?: () => void;
  className?: string;
}

const buttons: { en: string; zh: string; answer: AnswerValue; style: string }[] = [
  { en: "✔ Yes", zh: "需要再插管", answer: "yes", style: "bg-emerald-600 hover:bg-emerald-500" },
  { en: "✘ No", zh: "不需要再插管", answer: "no", style: "bg-rose-600 hover:bg-rose-500" }
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
          {buttons.map(({ en, zh, answer, style }) => (
            <button
              key={answer}
              type="button"
              disabled={disabled}
              onClick={() => onAnswer(answer)}
              className={`flex w-full flex-col items-center justify-center gap-1 rounded-lg px-6 py-4 text-center text-white transition sm:w-48 ${
                disabled
                  ? "cursor-not-allowed bg-slate-700/60 text-slate-300"
                  : style
              }`}
            >
              <span className="text-base font-semibold leading-tight">{en}</span>
              <span className="text-sm font-semibold leading-tight opacity-95">{zh}</span>
            </button>
          ))}
        </div>
        {onSkip && (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              disabled={disabled}
              onClick={onSkip}
              className="flex w-full max-w-[180px] flex-col items-center justify-center gap-0.5 rounded-lg border border-slate-600 px-4 py-2 text-center text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-48 sm:max-w-none"
            >
              <span className="text-sm font-semibold leading-tight">Skip</span>
              <span className="text-xs font-semibold leading-tight opacity-90">跳过</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
