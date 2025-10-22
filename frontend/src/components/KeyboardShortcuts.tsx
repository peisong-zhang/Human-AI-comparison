export default function KeyboardShortcuts() {
  const entries = [
    { key: "Y", action: "Mark Yes" },
    { key: "N", action: "Mark No" },
    { key: "← / →", action: "Navigate items" },
    { key: "S", action: "Skip current item" }
  ];

  return (
    <div className="flex flex-wrap gap-4 text-xs text-slate-300">
      {entries.map((entry) => (
        <div
          key={entry.key}
          className="flex items-center gap-2 rounded border border-slate-700 bg-slate-800/60 px-3 py-2"
        >
          <span className="rounded bg-slate-900/80 px-2 py-1 font-semibold text-slate-100">
            {entry.key}
          </span>
          <span>{entry.action}</span>
        </div>
      ))}
    </div>
  );
}
