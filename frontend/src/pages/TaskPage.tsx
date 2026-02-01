import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { AnswerValue, RecordedAnswer, SessionItem } from "../types";
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
    shiftTimersBy,
    pauseSession,
    globalStart,
    itemStart
  } = useSession();

  const [globalElapsed, setGlobalElapsed] = useState(0);
  const [itemElapsed, setItemElapsed] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [timeoutTriggered, setTimeoutTriggered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [imageNaturalSize, setImageNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [dimensionCache, setDimensionCache] = useState<Record<string, { width: number; height: number }>>({});
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({ width: 1024, height: 768 });
  const [showCompletionPrompt, setShowCompletionPrompt] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [languageMode, setLanguageMode] = useState<"en" | "zh">("en");
  const instructionPauseStartedAt = useRef<number | null>(null);
  const submittingRef = useRef(false);
  const lastLoadedSrc = useRef<string>("");
  const backgroundExitTriggered = useRef(false);

  useEffect(() => {
    if (!session || !config) {
      navigate("/");
    }
  }, [session, config, navigate]);

  useEffect(() => {
    if (!session) return;

    const isMobileDevice = () => {
      if (typeof window === "undefined") return false;
      const ua = navigator.userAgent || "";
      const uaMatch = /Mobi|Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i.test(ua);
      const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
      const smallScreen = window.matchMedia?.("(max-width: 900px)")?.matches ?? false;
      return uaMatch || (coarsePointer && smallScreen);
    };

    const handleBackgroundExit = () => {
      if (!isMobileDevice()) return;
      if (backgroundExitTriggered.current) return;
      backgroundExitTriggered.current = true;
      pauseSession();
      navigate("/");
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        handleBackgroundExit();
      }
    };

    window.addEventListener("pagehide", handleBackgroundExit);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("pagehide", handleBackgroundExit);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [session, pauseSession, navigate]);

  const stages = session?.stages ?? [];
  const items = session?.items ?? [];

  useEffect(() => {
    if (globalStart == null) return;
    if (instructionsOpen) return;
    const tick = () => setGlobalElapsed(Date.now() - globalStart);
    tick();
    const interval = window.setInterval(tick, 500);
    return () => window.clearInterval(interval);
  }, [globalStart, instructionsOpen]);

  useEffect(() => {
    if (itemStart == null) return;
    if (instructionsOpen) return;
    const tick = () => setItemElapsed(Date.now() - itemStart);
    tick();
    const interval = window.setInterval(tick, 200);
    return () => window.clearInterval(interval);
  }, [itemStart, currentIndex, instructionsOpen]);

  useEffect(() => {
    setTimeoutTriggered(false);
  }, [currentIndex, session?.items]);

  const groupConfig = useMemo(() => {
    if (!config || !session) return undefined;
    return config.groups.find((group) => group.group_id === session.group_id);
  }, [config, session]);

  const currentItem: SessionItem | undefined = items[currentIndex];
  const currentStage = useMemo(() => {
    if (!currentItem) return undefined;
    return stages.find((stage) => stage.stage_index === currentItem.stage_index);
  }, [stages, currentItem]);

  const modeConfig = useMemo(() => {
    if (!config || !currentStage) return undefined;
    return config.modes.find((mode) => mode.mode_id === currentStage.mode_id);
  }, [config, currentStage]);

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

  const totalItems = items.length;
  const progressValue = totalItems ? currentIndex + 1 : 0;
  const currentResponse = currentItem ? responses[currentItem.order_index] : undefined;

  const stageStats = useMemo(() => {
    const counts: number[] = Array.from({ length: stages.length }, () => 0);
    items.forEach((item) => {
      if (typeof counts[item.stage_index] === "number") {
        counts[item.stage_index] += 1;
      }
    });
    const starts: number[] = [];
    counts.reduce((acc, count, idx) => {
      starts[idx] = acc;
      return acc + count;
    }, 0);
    return { counts, starts };
  }, [stages, items]);

  const currentStageIndex = currentItem?.stage_index ?? 0;
  const currentStageCount = stageStats.counts[currentStageIndex] ?? 0;
  const currentStageStart = stageStats.starts[currentStageIndex] ?? 0;
  const currentStagePosition = Math.max(0, currentIndex - currentStageStart);
  const stageTotalItems = currentStage?.total_items ?? currentStageCount;
  const stageDisplayTotal = stageTotalItems > 0 ? stageTotalItems : currentStageCount;
  const stageDisplayIndex = stageDisplayTotal > 0 ? currentStagePosition + 1 : 0;
  const stageKey = currentStage
    ? `${currentStage.stage_index}-${currentStage.mode_id}-${currentStage.ai_enabled ? "ai" : "human"}`
    : "unknown";


  const incompleteItems = useMemo(() => {
    if (!session) return [];
    return session.items.filter((item) => {
      const response = responses[item.order_index];
      return !response || response.skipped || response.answer === "skip";
    });
  }, [session, responses]);
  const completedCount = totalItems - incompleteItems.length;
  const allAnswered = incompleteItems.length === 0 && totalItems > 0;
  const onLastItem = currentIndex === totalItems - 1;

  useEffect(() => {
    if (!itemLimitMs || !hardTimeout || !currentItem || timeoutTriggered || instructionsOpen) return;
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
  }, [itemLimitMs, hardTimeout, currentItem, timeoutTriggered, itemStart, instructionsOpen]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (!currentItem || submitting || submittingRef.current || instructionsOpen) return;
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
  }, [currentItem, submitting, currentIndex, totalItems, instructionsOpen]);

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

  const isSkippedResponse = (response?: RecordedAnswer) =>
    Boolean(response && (response.skipped || response.answer === "skip"));
  const isUnansweredResponse = (response?: RecordedAnswer) => !response;
  const isUnfinishedResponse = (response?: RecordedAnswer) =>
    isSkippedResponse(response) || isUnansweredResponse(response);

  const findNextIndexBy = (
    responseMap: Record<number, RecordedAnswer>,
    predicate: (response?: RecordedAnswer) => boolean
  ) => {
    if (!items.length || totalItems <= 0) return null;
    for (let offset = 1; offset <= totalItems; offset += 1) {
      const idx = (currentIndex + offset) % totalItems;
      const candidate = items[idx];
      if (!candidate) continue;
      const response = responseMap[candidate.order_index];
      if (predicate(response)) {
        return idx;
      }
    }
    return null;
  };

  const goToNextUnanswered = () => {
    if (!items.length || totalItems <= 0) return;
    if (incompleteItems.length === 0) return;
    if (currentItem) {
      const currentResponse = responses[currentItem.order_index];
      if (isUnfinishedResponse(currentResponse)) {
        let hasUnfinishedBefore = false;
        for (let idx = 0; idx < currentIndex; idx += 1) {
          const item = items[idx];
          if (!item) continue;
          if (isUnfinishedResponse(responses[item.order_index])) {
            hasUnfinishedBefore = true;
            break;
          }
        }
        if (!hasUnfinishedBefore) {
          setHint(
            languageMode === "zh"
              ? "当前已经是第一个未完成的病例，请先完成这一题。"
              : "You are already on the first unfinished case. Please complete it first."
          );
          return;
        }
      }
    }
    const nextSkipped = findNextIndexBy(responses, isSkippedResponse);
    if (nextSkipped !== null) {
      goToIndex(nextSkipped);
      return;
    }
    const nextUnanswered = findNextIndexBy(responses, isUnansweredResponse);
    if (nextUnanswered !== null) {
      goToIndex(nextUnanswered);
    }
  };

  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => setHint(null), 2000);
    return () => window.clearTimeout(timer);
  }, [hint]);

  const handleAnswer = async (
    answer: AnswerValue,
    options: HandleAnswerOptions = {}
  ) => {
    if (!session || !currentItem || submitting || submittingRef.current || instructionsOpen) return;
    const previousResponse = responses[currentItem.order_index];
    const wasSkipped = isSkippedResponse(previousResponse);
    submittingRef.current = true;
    if (timeoutTriggered && answer !== "timeout") {
      setTimeoutTriggered(false);
    }
    setSubmitting(true);
    setError(null);

    try {
      const now = Date.now();
      const elapsedItem = itemStart ? now - itemStart : 0;
      const elapsedGlobal = globalStart ? now - globalStart : now;
      const nextResponse = {
        answer,
        elapsed_ms_item: elapsedItem,
        elapsed_ms_global: elapsedGlobal,
        skipped: options.skip ?? answer === "skip",
        item_timeout: options.timeout ?? answer === "timeout",
        recorded_at: new Date().toISOString()
      };
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

      recordAnswer(currentItem.order_index, nextResponse);

      const nextResponses = {
        ...responses,
        [currentItem.order_index]: nextResponse
      };
      let navigated = false;
      if (wasSkipped) {
        const nextSkipped = findNextIndexBy(nextResponses, isSkippedResponse);
        if (nextSkipped !== null) {
          goToIndex(nextSkipped);
          navigated = true;
        } else {
          const nextUnanswered = findNextIndexBy(nextResponses, isUnansweredResponse);
          if (nextUnanswered !== null) {
            goToIndex(nextUnanswered);
            navigated = true;
          }
        }
      }
      if (!navigated) {
        if (currentIndex < totalItems - 1) {
          goToNext();
        } else if (answer === "skip") {
          setHint(
            languageMode === "zh"
              ? "已到最后一题，请使用“定位下一个未完成”返回未完成病例。"
              : "You are on the last case. Use “Find next unfinished” to return to unfinished items."
          );
        }
      }
    } catch (err) {
      console.error(err);
      setError("Failed to save response. Please retry. / 保存失败，请重试。");
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  };

  const handleComplete = async () => {
    if (!session || instructionsOpen) return;
    if (incompleteItems.length > 0) {
      setError(
        `Please complete all cases before finishing (${incompleteItems.length} remaining). / 还有 ${incompleteItems.length} 个病例未完成，无法提交。`
      );
      return;
    }
    try {
      setFinishing(true);
      const totalElapsed = globalStart ? Date.now() - globalStart : 0;
      await apiFinishSession(session.session_id, totalElapsed);
      navigate("/summary");
    } catch (err) {
      console.error(err);
      setError("Failed to finish session. Please retry. / 结束会话失败，请重试。");
    } finally {
      setFinishing(false);
    }
  };

  const handleExitSession = () => {
    if (instructionsOpen) return;
    setExitConfirmOpen(true);
  };

  const confirmExitSession = () => {
    pauseSession();
    navigate("/");
  };

  const itemProgressPercent =
    itemLimitMs && itemLimitMs > 0 ? clamp((itemElapsed / itemLimitMs) * 100, 0, 100) : 0;

  const isAiMode = Boolean(currentStage?.ai_enabled);

  const computedImageDimensions = useMemo(() => {
    if (!imageNaturalSize) {
      return null;
    }
    const aspectRatio =
      imageNaturalSize.height === 0 ? 1 : imageNaturalSize.width / imageNaturalSize.height;
    const widthLimit = viewportSize.width * (isAiMode ? 0.97 : 0.94);
    const heightLimit = viewportSize.height * (isAiMode ? 0.91 : 0.88);

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
  }, [imageNaturalSize, isAiMode, viewportSize.width, viewportSize.height]);

  const fallbackImageDimensions = useMemo(() => {
    const fallbackAspectRatio = 4 / 3;
    const widthLimit = viewportSize.width * (isAiMode ? 0.97 : 0.94);
    const heightLimit = viewportSize.height * (isAiMode ? 0.91 : 0.88);

    let width = widthLimit;
    let height = width / fallbackAspectRatio;

    if (height > heightLimit) {
      height = heightLimit;
      width = heightLimit * fallbackAspectRatio;
    }

    const minWidth = Math.min(420, widthLimit);
    const minHeight = Math.min(280, heightLimit);

    return {
      width: Math.max(width, minWidth),
      height: Math.max(height, minHeight)
    };
  }, [isAiMode, viewportSize.height, viewportSize.width]);

  useEffect(() => {
    if (!imageLoaded || !computedImageDimensions) return;
    setDimensionCache((prev) => ({
      ...prev,
      [stageKey]: computedImageDimensions
    }));
  }, [computedImageDimensions, imageLoaded, stageKey]);

  const resolvedImageDimensions = useMemo(() => {
    if (imageLoaded && computedImageDimensions) {
      return computedImageDimensions;
    }
    return dimensionCache[stageKey] ?? fallbackImageDimensions;
  }, [computedImageDimensions, dimensionCache, fallbackImageDimensions, imageLoaded, stageKey]);

  const imageContainerStyle = useMemo<CSSProperties>(() => {
    const base: CSSProperties = {
      maxWidth: isAiMode ? "97vw" : "94vw",
      maxHeight: isAiMode ? "91vh" : "88vh"
    };
    if (!resolvedImageDimensions) {
      return base;
    }
    return {
      ...base,
      width: `${Math.round(resolvedImageDimensions.width)}px`,
      height: `${Math.round(resolvedImageDimensions.height)}px`
    };
  }, [isAiMode, resolvedImageDimensions]);

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

  const applyImageLanguage = useCallback((url: string, lang: string) => {
    if (!url) return "";
    const [path, queryString] = url.split("?");
    const params = new URLSearchParams(queryString ?? "");
    params.set("lang", lang);
    const query = params.toString();
    return query ? `${path}?${query}` : path;
  }, []);

  const handleInstructionsOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        instructionPauseStartedAt.current = Date.now();
        setInstructionsOpen(true);
        return;
      }

      const startedAt = instructionPauseStartedAt.current;
      if (startedAt != null) {
        shiftTimersBy(Date.now() - startedAt);
      }
      instructionPauseStartedAt.current = null;
      setInstructionsOpen(false);
    },
    [shiftTimersBy]
  );

  const imageSrc = useMemo(() => {
    if (!currentItem) return "";
    return resolveImageUrl(applyImageLanguage(currentItem.url, languageMode));
  }, [applyImageLanguage, currentItem, languageMode, resolveImageUrl]);

  useEffect(() => {
    if (!imageSrc) {
      setImageNaturalSize(null);
      setImageLoaded(false);
      return;
    }
    if (lastLoadedSrc.current !== imageSrc) {
      setImageNaturalSize(null);
      setImageLoaded(false);
    }
  }, [imageSrc]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[95vw] flex-col gap-6 px-4 py-8 md:px-6 lg:px-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">
            {currentStage
              ? currentStage.label ??
                `Stage ${currentStage.stage_index + 1} / 阶段${currentStage.stage_index + 1}: ${currentStage.mode_name}`
              : "Study Stage / 实验阶段"}
          </h2>
          <p className="text-sm text-slate-300">
            Participant / 参与者 {session?.participant_id} · Group / 分组 {session?.group_id} · Case / 病例 {progressValue} / {totalItems}
          </p>
          {currentStage && (
            <p className="text-xs text-slate-400">
              Subset / 子集: {currentStage.subset_name} · Stage item / 阶段题目 {stageDisplayIndex} / {stageDisplayTotal}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <TimerDisplay label="Global Timer / 总计时" value={formatDuration(globalElapsed)} />
          {itemLimitMs ? (
            <TimerDisplay
              label="Item Timer / 单题计时"
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
            <TimerDisplay label="Item Timer / 单题计时" value={formatDuration(itemElapsed)} />
          )}
          <button
            type="button"
            onClick={() => setLanguageMode((prev) => (prev === "en" ? "zh" : "en"))}
            className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2 text-left text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800/60"
            aria-label="Switch language / 切换语言"
          >
            <div className="text-xs uppercase tracking-wide opacity-70">Language / 语言</div>
            <div className="text-lg font-semibold">
              {languageMode === "en" ? "EN → 中文" : "中文 → EN"}
            </div>
          </button>
        </div>
      </div>
      <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">
        <div>Refreshing or closing this page will exit the annotation task. To pause, open Task Instructions.</div>
        <div>刷新或关闭页面将退出标注任务，如需暂停，请打开任务说明。</div>
      </div>

      {currentStage && (
        <GuidelinePanel
          taskMarkdown={modeConfig?.task_markdown ?? currentStage.task_markdown}
          guidelinesMarkdown={modeConfig?.guidelines_markdown ?? currentStage.guidelines_markdown}
          onOpenChange={handleInstructionsOpenChange}
          languageMode={languageMode}
        />
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6 shadow-xl">
        {currentItem ? (
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex flex-col gap-3 text-slate-200 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-base font-semibold">{currentItem.title}</div>
                <div className="flex items-center gap-3">
                  <div className="rounded-full border border-amber-500/50 bg-amber-500/10 px-3 py-1 text-sm font-semibold text-amber-100">
                    {languageMode === "zh"
                      ? `第 ${progressValue} 张 / 共 ${totalItems} 张`
                      : `Case ${progressValue} / ${totalItems}`}
                  </div>
                  <div className="text-xs uppercase tracking-wide text-slate-400">
                    Overall / 总进度 {progressValue} / {totalItems}
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="w-full lg:flex-1">
                  <ProgressBar current={stageDisplayIndex} total={stageDisplayTotal || 1} />
                </div>
                <div className="space-y-1 text-xs text-slate-400">
                  <div>
                    Stage progress / 阶段进度: {stageDisplayIndex} / {stageDisplayTotal || 0}
                  </div>
                  {perItemSeconds && (
                    <div>
                      Limit / 限时: {perItemSeconds}s{" "}
                      {hardTimeout ? "(auto/自动)" : softTimeout ? "(soft/软提示)" : ""}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="mb-2 text-xs text-amber-200/90 text-center">
              Note: Ages &gt; 90 are recorded as 300. / 注：年龄 &gt; 90 的患者会标记为 300。
            </div>
            <div
              className={`relative mx-auto w-full max-w-full overflow-hidden rounded-2xl border border-slate-800 bg-black ${
                isAiMode ? "p-3" : "p-4"
              }`}
              style={imageContainerStyle}
            >
              {currentItem && (
                <img
                  src={imageSrc}
                  alt={currentItem.title}
                  className="mx-auto transition-opacity duration-300"
                  draggable={false}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    opacity: imageLoaded ? 1 : 0
                  }}
                  onLoad={(event) =>
                    (() => {
                      setImageNaturalSize({
                        width: event.currentTarget.naturalWidth,
                        height: event.currentTarget.naturalHeight
                      });
                      lastLoadedSrc.current = imageSrc;
                      setImageLoaded(true);
                    })()
                  }
                  onError={() => {
                    lastLoadedSrc.current = imageSrc;
                    setImageLoaded(true);
                  }}
                />
              )}
              {!imageLoaded && (
                <div className="absolute inset-0 animate-pulse rounded-2xl bg-slate-900/40" />
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
                disabled={submitting || instructionsOpen}
                languageMode={languageMode}
                onAnswer={(answer) => void handleAnswer(answer)}
                onSkip={() => void handleAnswer("skip", { skip: true })}
              />
              <div className="mx-auto w-full max-w-md rounded-lg border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300 lg:mx-0">
                <div className="flex flex-col gap-3">
                  {showCompletionPrompt && (
                    <div className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 text-center">
                      All cases are answered. Select{" "}
                      <span className="font-semibold">Complete Session</span> to submit your results.
                      <br />
                      已完成所有病例。点击 <span className="font-semibold">Complete Session</span> 提交结果。
                    </div>
                  )}
                  {currentStage && (
                    <div className="text-xs text-slate-400 text-center">
                      Stage {currentStage.stage_index + 1} / 阶段{currentStage.stage_index + 1}:{" "}
                      {currentStage.label ?? `${currentStage.mode_name} · ${currentStage.subset_name}`}
                    </div>
                  )}
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Completed / 已完成</span>
                    <span>
                      {completedCount} / {totalItems}
                    </span>
                  </div>
                  <div className="grid grid-cols-[1fr_1.6fr_1fr] gap-2">
                    <button
                      type="button"
                      onClick={goToPrevious}
                      className="flex h-12 flex-col items-center justify-center rounded-lg border border-slate-700 px-3 text-center text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={currentIndex === 0 || instructionsOpen}
                    >
                      <span className="text-sm font-semibold leading-tight">Previous</span>
                      <span className="text-[11px] font-semibold leading-tight opacity-90">上一题</span>
                    </button>
                    <button
                      type="button"
                      disabled={incompleteItems.length > 0 || finishing || instructionsOpen}
                      onClick={() => void handleComplete()}
                      className="flex h-12 flex-col items-center justify-center rounded-lg bg-emerald-600 px-3 text-center text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                    >
                      <span className="text-sm font-semibold leading-tight">
                        {finishing ? "Finishing..." : "Complete Session"}
                      </span>
                      <span className="text-[11px] font-semibold leading-tight opacity-95">
                        {finishing ? "正在提交..." : "完成提交"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={goToNext}
                      className="flex h-12 flex-col items-center justify-center rounded-lg border border-slate-700 px-3 text-center text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={currentIndex >= totalItems - 1 || instructionsOpen}
                    >
                      <span className="text-sm font-semibold leading-tight">Next</span>
                      <span className="text-[11px] font-semibold leading-tight opacity-90">下一题</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleExitSession}
                    disabled={submitting || finishing || instructionsOpen}
                    className="flex h-11 w-full flex-col items-center justify-center rounded-lg border border-slate-700/80 bg-slate-900/60 px-3 text-center text-slate-200 transition hover:border-slate-500 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="text-sm font-semibold leading-tight">Exit & Pause</span>
                    <span className="text-[11px] font-semibold leading-tight opacity-90">暂时退出并暂停</span>
                  </button>
                  {incompleteItems.length > 0 ? (
                    <>
                      <button
                        type="button"
                        disabled={instructionsOpen}
                        onClick={goToNextUnanswered}
                        className="flex h-12 w-full flex-col items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 text-center text-amber-200 transition hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="text-sm font-semibold leading-tight">
                          Find next unfinished ({incompleteItems.length})
                        </span>
                        <span className="text-[11px] font-semibold leading-tight opacity-95">
                          定位下一个未完成（{incompleteItems.length}）
                        </span>
                      </button>
                      <p className="text-xs text-amber-300 text-center">
                        {incompleteItems.length} case(s) remain unfinished (unanswered or skipped). Complete all items before finishing.
                        <br />
                        还有 {incompleteItems.length} 个病例未完成（未作答或已跳过），请先完成所有题目再提交。
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-emerald-300 text-center">
                      All cases answered{onLastItem ? "; you can submit the session now." : "."}
                      <br />
                      已完成全部病例{onLastItem ? "，现在可以提交会话。" : "。"}
                    </p>
                  )}
                  {error && <p className="text-xs text-rose-400 text-center">{error}</p>}
                  {hint && <p className="text-xs text-amber-300 text-center">{hint}</p>}
                  <p className="text-xs text-center text-slate-500">
                    Finishing stores total elapsed time and locks further edits.
                    <br />
                    完成提交会记录总用时，并锁定后续修改。
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-300">No items available. / 暂无可用题目。</p>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryStatCard label="Total Cases / 总病例数" value={totalItems.toString()} />
        <SummaryStatCard label="Completed / 已完成" value={completedCount.toString()} />
        <SummaryStatCard label="Remaining / 剩余" value={(totalItems - completedCount).toString()} />
      </div>
      {exitConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setExitConfirmOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950/95 p-6 text-slate-100 shadow-[0_25px_60px_rgba(15,23,42,0.6)]">
            <div className="text-lg font-semibold">Exit & Pause / 暂时退出</div>
            <p className="mt-2 text-sm text-slate-300">
              Exit now and pause the session. You can resume later with the same name and group.
              <br />
              现在退出并暂停标注。稍后使用相同姓名与分组可继续。
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setExitConfirmOpen(false)}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-900"
              >
                Cancel / 取消
              </button>
              <button
                type="button"
                onClick={confirmExitSession}
                className="flex-1 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500"
              >
                Exit & Pause / 退出并暂停
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
