import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

type LanguageMode = "zh" | "en";

interface GuidelinePanelProps {
  taskMarkdown: string;
  guidelinesMarkdown: string;
  onOpenChange?: (open: boolean) => void;
  languageMode?: LanguageMode;
}

const PANEL_WIDTH = 520;
const PANEL_HEIGHT = 560;
const BOUNDARY_PADDING = 20;

function splitBilingualMarkdown(markdown: string): { en: string; zh: string; hasSeparator: boolean } {
  const parts = markdown.split(/\n\s*---\s*\n/);
  if (parts.length < 2) {
    return { en: markdown, zh: markdown, hasSeparator: false };
  }
  const [enPart, ...rest] = parts;
  return {
    en: enPart.trim(),
    zh: rest.join("\n---\n").trim(),
    hasSeparator: true
  };
}

export default function GuidelinePanel({
  taskMarkdown,
  guidelinesMarkdown,
  onOpenChange,
  languageMode: languageModeProp
}: GuidelinePanelProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 120, left: 120 });
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const languageMode = languageModeProp ?? "en";

  const taskParts = useMemo(() => splitBilingualMarkdown(taskMarkdown), [taskMarkdown]);
  const guidelineParts = useMemo(() => splitBilingualMarkdown(guidelinesMarkdown), [guidelinesMarkdown]);
  const hasBilingual = taskParts.hasSeparator || guidelineParts.hasSeparator;

  const isZh = languageMode === "zh";

  const resolvedTaskMarkdown = useMemo(() => {
    if (!hasBilingual) return taskMarkdown;
    return isZh ? taskParts.zh || taskMarkdown : taskParts.en || taskMarkdown;
  }, [hasBilingual, isZh, taskMarkdown, taskParts.en, taskParts.zh]);

  const resolvedGuidelinesMarkdown = useMemo(() => {
    if (!hasBilingual) return guidelinesMarkdown;
    return isZh ? guidelineParts.zh || guidelinesMarkdown : guidelineParts.en || guidelinesMarkdown;
  }, [guidelinesMarkdown, guidelineParts.en, guidelineParts.zh, hasBilingual, isZh]);

  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => ({
        top: Math.min(
          Math.max(prev.top, BOUNDARY_PADDING),
          window.innerHeight - PANEL_HEIGHT - BOUNDARY_PADDING
        ),
        left: Math.min(
          Math.max(prev.left, BOUNDARY_PADDING),
          window.innerWidth - PANEL_WIDTH - BOUNDARY_PADDING
        )
      }));
    };

    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!dragging.current) return;
      setPosition({
        top: Math.min(
          Math.max(event.clientY - dragOffset.current.y, BOUNDARY_PADDING),
          window.innerHeight - PANEL_HEIGHT - BOUNDARY_PADDING
        ),
        left: Math.min(
          Math.max(event.clientX - dragOffset.current.x, BOUNDARY_PADDING),
          window.innerWidth - PANEL_WIDTH - BOUNDARY_PADDING
        )
      });
    };

    const handleMouseUp = () => {
      dragging.current = false;
    };

    if (open) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [open]);

  const startDrag = (event: React.MouseEvent<HTMLDivElement>) => {
    dragging.current = true;
    dragOffset.current = {
      x: event.clientX - position.left,
      y: event.clientY - position.top
    };
  };

  return (
    <>
      <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/80 px-4 py-3 shadow-lg">
        <div>
          <div className="text-sm font-semibold text-slate-100">
            {isZh ? "任务说明" : "Task Instructions"}
          </div>
          <p className="text-xs text-slate-400">
            {isZh ? "打开浮动面板查看任务说明与要点。" : "Open the floating panel to review guidelines."}
          </p>
        </div>
        <button
          className="rounded-md border border-slate-700 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary transition hover:border-primary hover:bg-slate-800/60"
          onClick={() =>
            setOpen((prev) => {
              const next = !prev;
              onOpenChange?.(next);
              return next;
            })
          }
          type="button"
        >
          {open ? (isZh ? "隐藏" : "Hide") : isZh ? "查看" : "View"}
        </button>
      </div>

      {open && (
        <div className="pointer-events-none fixed inset-0 z-50">
          <div
            className="pointer-events-auto flex flex-col rounded-2xl border border-primary/40 bg-slate-900/95 shadow-[0_20px_50px_rgba(15,23,42,0.55)] backdrop-blur-sm"
            style={{
              width: PANEL_WIDTH,
              maxWidth: "90vw",
              top: position.top,
              left: position.left,
              position: "fixed"
            }}
            >
            <div
              className="flex cursor-grab items-center justify-between rounded-t-2xl border-b border-slate-800 bg-slate-900/90 px-4 py-2 text-sm font-semibold text-slate-100"
              onMouseDown={startDrag}
            >
              <span>{isZh ? "任务说明" : "Task Instructions"}</span>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>{isZh ? "拖动移动" : "Drag to move"}</span>
                <button
                  className="rounded-md border border-slate-700 px-2 py-1 text-xs uppercase tracking-wide text-slate-300 transition hover:border-slate-500 hover:text-white"
                  onClick={() => {
                    setOpen(false);
                    onOpenChange?.(false);
                  }}
                  type="button"
                >
                  {isZh ? "关闭" : "Close"}
                </button>
              </div>
            </div>
            <div className="max-h-[80vh] overflow-y-auto px-6 py-5 text-sm leading-relaxed text-slate-100">
              <section className="space-y-3">
                <h3 className="text-base font-semibold text-primary">
                  {isZh ? "任务描述" : "Task Description"}
                </h3>
                <ReactMarkdown className="prose prose-invert max-w-none">
                  {resolvedTaskMarkdown}
                </ReactMarkdown>
              </section>
              <section className="mt-5 space-y-3">
                <h3 className="text-base font-semibold text-primary">
                  {isZh ? "操作要点" : "Guidelines"}
                </h3>
                <ReactMarkdown className="prose prose-invert max-w-none">
                  {resolvedGuidelinesMarkdown}
                </ReactMarkdown>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
