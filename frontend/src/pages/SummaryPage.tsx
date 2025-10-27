import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { downloadCsv } from "../api/client";
import SummaryStatCard from "../components/SummaryStatCard";
import { useSession } from "../context/SessionContext";
import { formatDuration } from "../utils/time";

export default function SummaryPage() {
  const navigate = useNavigate();
  const { session, responses, clearSession } = useSession();
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const responseList = useMemo(() => {
    if (!session) return [];
    return session.items.map((item) => ({
      ...item,
      response: responses[item.image_id]
    }));
  }, [session, responses]);

  const totalElapsed = useMemo(() => {
    if (!responseList.length) return 0;
    const maxGlobal = Math.max(
      ...responseList
        .map((item) => item.response?.elapsed_ms_global ?? 0)
        .filter((value) => value > 0)
    );
    return maxGlobal > 0 ? maxGlobal : 0;
  }, [responseList]);

  const yesCount = responseList.filter((item) => item.response?.answer === "yes").length;
  const noCount = responseList.filter((item) => item.response?.answer === "no").length;
  const skipCount = responseList.filter(
    (item) => item.response?.answer === "skip" || item.response?.skipped
  ).length;
  const timeoutCount = responseList.filter(
    (item) => item.response?.answer === "timeout" || item.response?.item_timeout
  ).length;

  const averageItemTime = useMemo(() => {
    const times = responseList
      .map((item) => item.response?.elapsed_ms_item ?? 0)
      .filter((value) => value > 0);
    if (!times.length) return 0;
    return Math.round(times.reduce((sum, value) => sum + value, 0) / times.length);
  }, [responseList]);

  const stageBreakdown = useMemo(() => {
    if (!session) return [];
    return session.stages.map((stage) => {
      const itemsInStage = responseList.filter((item) => item.stage_index === stage.stage_index);
      const answered = itemsInStage.filter((item) => responses[item.image_id]).length;
      return {
        stage,
        total: itemsInStage.length,
        answered
      };
    });
  }, [session, responseList, responses]);

  const handleDownload = async () => {
    if (!session) return;
    try {
      setDownloading(true);
      const blob = await downloadCsv({ session_id: session.session_id });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `session_${session.session_id}.csv`;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError("Failed to download CSV.");
    } finally {
      setDownloading(false);
    }
  };

  const handleExit = () => {
    clearSession();
    navigate("/");
  };

  if (!session) {
    navigate("/");
    return null;
  }

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-white">Session Summary</h1>
        <p className="mt-2 text-sm text-slate-300">
          Participant {session.participant_id} · Group {session.group_id}
        </p>
        {stageBreakdown.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-slate-400">
            {stageBreakdown.map(({ stage, total, answered }) => (
              <li key={stage.stage_index}>
                Stage {stage.stage_index + 1}: {stage.label ?? `${stage.mode_name} · ${stage.subset_name}`} · {answered}/{total} answered
              </li>
            ))}
          </ul>
        )}
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStatCard label="Total Time" value={formatDuration(totalElapsed)} />
        <SummaryStatCard label="Cases Reviewed" value={responseList.length.toString()} />
        <SummaryStatCard label="Average Item Time" value={formatDuration(averageItemTime)} />
        <SummaryStatCard label="Yes / No" value={`${yesCount} / ${noCount}`} />
        <SummaryStatCard label="Skipped" value={skipCount.toString()} />
        <SummaryStatCard label="Timeouts" value={timeoutCount.toString()} />
      </section>

      <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-950/80 p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-white">Per-item detail</h2>
        <div className="mt-4 overflow-auto">
          <table className="min-w-full divide-y divide-slate-800 text-sm">
            <thead className="bg-slate-900/60 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Order</th>
                <th className="px-4 py-2 text-left font-medium">Stage</th>
                <th className="px-4 py-2 text-left font-medium">Subset</th>
                <th className="px-4 py-2 text-left font-medium">Mode</th>
                <th className="px-4 py-2 text-left font-medium">Case</th>
                <th className="px-4 py-2 text-left font-medium">Answer</th>
                <th className="px-4 py-2 text-left font-medium">Item Time</th>
                <th className="px-4 py-2 text-left font-medium">Global Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-200">
              {responseList.map((item) => (
                <tr key={item.image_id} className="hover:bg-slate-900/60">
                  <td className="px-4 py-2 text-slate-400">{item.order_index + 1}</td>
                  <td className="px-4 py-2 text-slate-400">Stage {item.stage_index + 1}</td>
                  <td className="px-4 py-2 text-slate-200">{session.stages[item.stage_index]?.subset_name ?? item.subset_id}</td>
                  <td className="px-4 py-2 text-slate-200">{session.stages[item.stage_index]?.mode_name ?? item.mode_id}</td>
                  <td className="px-4 py-2">{item.title}</td>
                  <td className="px-4 py-2 capitalize">
                    {item.response?.answer ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    {formatDuration(item.response?.elapsed_ms_item)}
                  </td>
                  <td className="px-4 py-2">
                    {formatDuration(item.response?.elapsed_ms_global)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleExit}
          className="rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary/80"
        >
          Finish
        </button>
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={downloading}
          className="rounded-lg border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {downloading ? "Preparing CSV..." : "Download Session CSV"}
        </button>
        {error && <p className="text-sm text-rose-400">{error}</p>}
      </div>
    </div>
  );
}
