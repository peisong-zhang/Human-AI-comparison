import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import {
  finishSession as apiFinishSession,
  recordAnswer as apiRecordAnswer
} from "../api/client";
import AnswerControls from "../components/AnswerControls";
import GuidelinePanel from "../components/GuidelinePanel";
import ProgressBar from "../components/ProgressBar";
import SummaryStatCard from "../components/SummaryStatCard";
import TimerDisplay from "../components/TimerDisplay";
import { useSession } from "../context/SessionContext";
import { AnswerValue, SessionItem } from "../types";
import { clamp, formatDuration } from "../utils/time";

interface HandleAnswerOptions {
  skip?: boolean;
  timeout?: boolean;
}

export default function TaskPage() {
  const navigate = useNavigate();
  const {
    session,
    config,
    responses,
    currentIndex,
    setCurrentIndex,
    resetItemTimer,
    recordAnswer,
    globalStart,
    itemStart
  } = useSession();

  const [globalElapsed, setGlobalElapsed] = useState(0);
  const [itemElapsed, setItemElapsed] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [timeoutTriggered, setTimeoutTriggered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [imageNaturalSize, setImageNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({ width: 1024, height: 768 });
  const [showCompletionPrompt, setShowCompletionPrompt] = useState(false);

  useEffect(() => {
    if (!session || !config) {
      navigate("/");
    }
  }, [session, config, navigate]);

  const items = session?.items ?? [];

  useEffect(() => {
    if (globalStart == null) return;
    const tick = () => setGlobalElapsed(Date.now() - globalStart);
    tick();
    const interval = window.setInterval(tick, 500);
    return () => window.clearInterval(interval);
  }, [globalStart]);

  useEffect(() => {
    if (itemStart == null) return;
    const tick = () => setItemElapsed(Date.now() - itemStart);
    tick();
    const interval = window.setInterval(tick, 200);
    return () => window.clearInterval(interval);
  }, [itemStart, currentIndex]);

  useEffect(() => {
    setTimeoutTriggered(false);
    setImageNaturalSize(null);
  }, [currentIndex, session?.items]);

  const groupConfig = useMemo(() => {
    if (!config || !session) return undefined;
    return config.groups.find((group) => group.group_id === session.group_id);
  }, [config, session]);

  const modeConfig = useMemo(() => {
    if (!config || !session) return undefined;
    return config.modes.find((mode) => mode.mode_id === session.mode_id);
  }, [config, session]);

  const perItemSeconds = useMemo(() => {
    if (!config) return undefined;
    return (
      groupConfig?.per_item_seconds ??
      modeConfig?.per_item_seconds ??
      config.default_per_item_seconds
    );
  }, [config, groupConfig, modeConfig]);

  const itemLimitMs = perItemSeconds ? perItemSeconds * 1000 : undefined;
  const hardTimeout = groupConfig?.hard_timeout ?? false;
  const softTimeout = groupConfig?.soft_timeout ?? true;

  const currentItem: SessionItem | undefined = items[currentIndex];
  const totalItems = items.length;
  const completedCount = Object.keys(responses).length;
  const progressValue = totalItems ? currentIndex + 1 : 0;
  const currentResponse = currentItem ? responses[currentItem.image_id] : undefined;

  const unansweredItems = useMemo(() => {
    if (!session) return [];
    return session.items.filter((item) => !responses[item.image_id]);
  }, [session, responses]);
  const allAnswered = unansweredItems.length === 0 && totalItems > 0;
  const onLastItem = currentIndex === totalItems - 1;

  useEffect(() => {
    if (!itemLimitMs || !hardTimeout || !currentItem || timeoutTriggered) return;
    const poll = window.setInterval(() => {
      if (itemStart == null) return;
      const now = Date.now();
      if (now - itemStart >= itemLimitMs) {
        window.clearInterval(poll);
        setTimeoutTriggered(true);
        void handleAnswer("timeout", { timeout: true });
      }
    }, 200);

    return () => window.clearInterval(poll);
  }, [itemLimitMs, hardTimeout, currentItem, timeoutTriggered, itemStart]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (!currentItem || submitting) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      switch (event.key.toLowerCase()) {
        case "y":
          event.preventDefault();
          void handleAnswer("yes");
          break;
        case "n":
          event.preventDefault();
          void handleAnswer("no");
          break;
        case "s":
          event.preventDefault();
          void handleAnswer("skip", { skip: true });
          break;
        case "arrowright":
          event.preventDefault();
          goToNext();
          break;
        case "arrowleft":
          event.preventDefault();
          goToPrevious();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentItem, submitting, currentIndex, totalItems]);

  useEffect(() => {
    const updateViewport = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  const goToIndex = (index: number) => {
    const clamped = clamp(index, 0, totalItems - 1);
    if (clamped === currentIndex) return;
    setCurrentIndex(clamped);
    resetItemTimer();
  };

  const goToNext = () => {
    if (currentIndex < totalItems - 1) {
      goToIndex(currentIndex + 1);
    }
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      goToIndex(currentIndex - 1);
    }
  };

  const handleAnswer = async (
    answer: AnswerValue,
    options: HandleAnswerOptions = {}
  ) => {
    if (!session || !currentItem || submitting) return;
    if (timeoutTriggered && answer !== "timeout") {
      setTimeoutTriggered(false);
    }
    setSubmitting(true);
    setError(null);

    try {
      const now = Date.now();
      const elapsedItem = itemStart ? now - itemStart : 0;
      const elapsedGlobal = globalStart ? now - globalStart : now;
      await apiRecordAnswer({
        session_id: session.session_id,
        image_id: currentItem.image_id,
        answer,
        order_index: currentItem.order_index,
        elapsed_ms_item: elapsedItem,
        elapsed_ms_global: elapsedGlobal,
        skipped: options.skip ?? answer === "skip",
        item_timeout: options.timeout ?? answer === "timeout",
        ts_client: new Date().toISOString(),
        user_agent: window.navigator.userAgent
      });

      recordAnswer(currentItem.image_id, {
        answer,
        elapsed_ms_item: elapsedItem,
        elapsed_ms_global: elapsedGlobal,
        skipped: options.skip ?? answer === "skip",
        item_timeout: options.timeout ?? answer === "timeout",
        recorded_at: new Date().toISOString()
      });

      if (currentIndex < totalItems - 1) {
        goToNext();
      }
    } catch (err) {
      console.error(err);
      setError("Failed to save response. Please retry.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleComplete = async () => {
    if (!session) return;
    try {
      setFinishing(true);
      const totalElapsed = globalStart ? Date.now() - globalStart : 0;
      await apiFinishSession(session.session_id, totalElapsed);
      navigate("/summary");
    } catch (err) {
      console.error(err);
      setError("Failed to finish session. Please retry.");
    } finally {
      setFinishing(false);
    }
  };

  const itemProgressPercent =
    itemLimitMs && itemLimitMs > 0 ? clamp((itemElapsed / itemLimitMs) * 100, 0, 100) : 0;

  const computedImageDimensions = useMemo(() => {
    if (!imageNaturalSize) {
      return null;
    }
    const aspectRatio =
      imageNaturalSize.height === 0 ? 1 : imageNaturalSize.width / imageNaturalSize.height;
    const widthLimit = viewportSize.width * 0.9;
    const heightLimit = viewportSize.height * 0.85;

    let width = widthLimit;
    let height = width / aspectRatio;

    if (height > heightLimit) {
      height = heightLimit;
      width = heightLimit * aspectRatio;
    }

    const minWidth = Math.min(420, widthLimit);
    const minHeight = Math.min(280, heightLimit);

    return {
      width: Math.max(width, minWidth),
      height: Math.max(height, minHeight)
    };
  }, [imageNaturalSize, viewportSize.width, viewportSize.height]);

  const imageContainerStyle = useMemo<CSSProperties>(() => {
    const base: CSSProperties = { maxWidth: "90vw", maxHeight: "82vh" };
    if (!computedImageDimensions) {
      return base;
    }
    return {
      ...base,
      width: `${Math.round(computedImageDimensions.width)}px`,
      height: `${Math.round(computedImageDimensions.height)}px`
    };
  }, [computedImageDimensions]);

  useEffect(() => {
    setShowCompletionPrompt(allAnswered && onLastItem);
  }, [allAnswered, onLastItem]);

  const apiBase = import.meta.env.VITE_API_BASE ?? "";
  const resolveImageUrl = useCallback(
    (url: string) => {
      if (!url) {
        return "";
      }
      if (/^https?:\/\//i.test(url)) {
        return url;
      }
      const base = (apiBase || window.location.origin).replace(/\/$/, "");
      const normalized = url.startsWith("/") ? url : `/${url}`;
      return `${base}${normalized}`;
    },
    [apiBase]
  );

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[95vw] flex-col gap-6 px-4 py-8 md:px-6 lg:px-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">
            Case {progressValue} of {totalItems}
          </h2>
          <p className="text-sm text-slate-300">
            Participant {session?.participant_id} · Mode {session?.mode_id} · Group{" "}
            {session?.group_id}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <TimerDisplay label="Global Timer" value={formatDuration(globalElapsed)} />
          {itemLimitMs ? (
            <TimerDisplay
              label="Item Timer"
              value={formatDuration(itemElapsed)}
              variant={
                timeoutTriggered
                  ? "danger"
                  : softTimeout && itemElapsed > itemLimitMs
                    ? "warning"
                    : "primary"
              }
            />
          ) : (
            <TimerDisplay label="Item Timer" value={formatDuration(itemElapsed)} />
          )}
        </div>
      </div>

      {config && modeConfig && (
        <GuidelinePanel
          taskMarkdown={modeConfig.task_markdown}
          guidelinesMarkdown={modeConfig.guidelines_markdown}
        />
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6 shadow-xl">
        {currentItem ? (
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex flex-col gap-2 text-slate-200 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-base font-semibold">{currentItem.title}</div>
                <div className="text-xs uppercase tracking-wide text-slate-400">
                  {currentIndex + 1} / {totalItems}
                </div>
              </div>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="w-full lg:flex-1">
                  <ProgressBar current={currentIndex + 1} total={totalItems} />
                </div>
                {perItemSeconds && (
                  <div className="text-xs text-slate-400">
                    Limit: {perItemSeconds}s {hardTimeout ? "(auto)" : softTimeout ? "(soft)" : ""}
                  </div>
                )}
              </div>
            </div>
            <div
              className="relative mx-auto w-full max-w-full overflow-hidden rounded-2xl border border-slate-800 bg-black p-4"
              style={imageContainerStyle}
            >
              {currentItem && (
                <img
                  src={resolveImageUrl(currentItem.url)}
                  alt={currentItem.title}
                  className="mx-auto"
                  draggable={false}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  onLoad={(event) =>
                    setImageNaturalSize({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight
                    })
                  }
                />
              )}
              {itemLimitMs && (
                <div className="absolute bottom-4 left-4 w-48">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800/80">
                    <div
                      className={`h-full rounded-full ${
                        timeoutTriggered
                          ? "bg-rose-500"
                          : itemElapsed > itemLimitMs
                            ? "bg-amber-400"
                            : "bg-primary"
                      }`}
                      style={{ width: `${itemProgressPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-4 text-sm text-slate-300 lg:flex-row lg:items-start lg:justify-center lg:gap-8">
              <AnswerControls
                className="mx-auto w-full max-w-md lg:mx-0"
                disabled={submitting}
                onAnswer={(answer) => void handleAnswer(answer)}
                onSkip={() => void handleAnswer("skip", { skip: true })}
              />
              <div className="mx-auto w-full max-w-md rounded-lg border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300 lg:mx-0">
                <div className="flex flex-col gap-3">
                  {showCompletionPrompt && (
                    <div className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 text-center">
                      All cases are answered. Select <span className="font-semibold">Complete Session</span> to submit your results.
                    </div>
                  )}
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Status</span>
                    <span>
                      {completedCount} / {totalItems} completed
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={goToPrevious}
                      className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={currentIndex === 0}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={unansweredItems.length > 0 || finishing}
                      onClick={() => void handleComplete()}
                      className="rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                    >
                      {finishing ? "Finishing..." : "Complete Session"}
                    </button>
                    <button
                      type="button"
                      onClick={goToNext}
                      className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={currentIndex >= totalItems - 1}
                    >
                      Next
                    </button>
                  </div>
                  {unansweredItems.length > 0 ? (
                    <p className="text-xs text-amber-300 text-center">
                      {unansweredItems.length} case(s) remain unanswered. Complete all items before finishing.
                    </p>
                  ) : (
                    <p className="text-xs text-emerald-300 text-center">
                      All cases answered{onLastItem ? "; you can submit the session now." : "."}
                    </p>
                  )}
                  {error && <p className="text-xs text-rose-400 text-center">{error}</p>}
                  <p className="text-xs text-center text-slate-500">
                    Finishing stores total elapsed time and locks further edits.
                  </p>
                </div>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-200">
                {currentResponse ? (
                  <>
                    <div className="font-semibold text-slate-100">Response saved</div>
                    <dl className="mt-3 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <dt>Answer</dt>
                        <dd className="capitalize">{currentResponse.answer}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Item time</dt>
                        <dd>{formatDuration(currentResponse.elapsed_ms_item)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Global time</dt>
                        <dd>{formatDuration(currentResponse.elapsed_ms_global)}</dd>
                      </div>
                    </dl>
                  </>
                ) : (
                  <div className="text-xs text-slate-400">
                    No decision saved yet. Use the buttons above to answer.
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300">
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-slate-100">Session Progress</div>
                  <p className="text-xs text-slate-400">
                    Keep responses consistent. Use navigation buttons above to review items if needed.
                  </p>
                  <p className="text-xs text-slate-500">
                    Total time updates once the session is completed.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-300">No items available.</p>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryStatCard label="Total Cases" value={totalItems.toString()} />
        <SummaryStatCard label="Completed" value={completedCount.toString()} />
        <SummaryStatCard label="Remaining" value={(totalItems - completedCount).toString()} />
      </div>
    </div>
  );
}
