import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { fetchConfig } from "../api/client";
import {
  ConfigResponse,
  RecordedAnswer,
  ResponseSnapshot,
  SessionStartResponse
} from "../types";


interface SessionContextValue {
  config: ConfigResponse | null;
  loadingConfig: boolean;
  session: SessionStartResponse | null;
  responses: Record<number, RecordedAnswer>;
  currentIndex: number;
  globalStart: number | null;
  itemStart: number | null;
  startSession: (session: SessionStartResponse) => void;
  setCurrentIndex: (index: number) => void;
  recordAnswer: (orderIndex: number, answer: RecordedAnswer) => void;
  resetItemTimer: () => void;
  shiftTimersBy: (deltaMs: number) => void;
  pauseSession: () => void;
  clearSession: () => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

const STORAGE_KEY = "human_ai_experiment_state";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [session, setSession] = useState<SessionStartResponse | null>(null);
  const [responses, setResponses] = useState<Record<number, RecordedAnswer>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [globalStart, setGlobalStart] = useState<number | null>(null);
  const [itemStart, setItemStart] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const cfg = await fetchConfig();
        setConfig(cfg);
      } catch (error) {
        console.error("Failed to load config", error);
      } finally {
        setLoadingConfig(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!config) return;
    if (!config.allow_resume) {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [config]);

  const startSession = useCallback(
    (sessionData: SessionStartResponse) => {
      if (session && session.session_id === sessionData.session_id) {
        setSession(sessionData);
        return;
      }

      setSession(sessionData);
      const responseMap: Record<number, RecordedAnswer> = {};
      if (sessionData.responses) {
        sessionData.responses.forEach((snapshot: ResponseSnapshot) => {
          responseMap[snapshot.order_index] = {
            answer: snapshot.answer,
            elapsed_ms_item: snapshot.elapsed_ms_item ?? 0,
            elapsed_ms_global: snapshot.elapsed_ms_global ?? 0,
            skipped: snapshot.skipped,
            item_timeout: snapshot.item_timeout,
            recorded_at: snapshot.recorded_at ?? new Date().toISOString()
          };
        });
      }
      setResponses(responseMap);
      const resumedIndex = sessionData.current_index ?? 0;
      setCurrentIndex(resumedIndex);
      const now = Date.now();
      const resumeElapsed = sessionData.elapsed_ms_global ?? 0;
      const globalStartNext = now - Math.max(resumeElapsed, 0);
      setGlobalStart(globalStartNext);
      setItemStart(now);
    },
    [session]
  );

  const recordAnswer = useCallback(
    (orderIndex: number, answer: RecordedAnswer) => {
      setResponses((prev) => {
        return { ...prev, [orderIndex]: answer };
      });
    },
    []
  );

  const resetItemTimer = useCallback(() => {
    const now = Date.now();
    setItemStart(now);
  }, []);

  const shiftTimersBy = useCallback((deltaMs: number) => {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    setGlobalStart((prev) => (prev === null ? prev : prev + deltaMs));
    setItemStart((prev) => (prev === null ? prev : prev + deltaMs));
  }, []);

  const setCurrentIndexSafe = useCallback(
    (index: number) => {
      setCurrentIndex(index);
    },
    []
  );

  const clearSession = useCallback(() => {
    setSession(null);
    setResponses({});
    setCurrentIndex(0);
    setGlobalStart(null);
    setItemStart(null);
    window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const pauseSession = useCallback(() => {
    setSession(null);
    setResponses({});
    setCurrentIndex(0);
    setGlobalStart(null);
    setItemStart(null);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      config,
      loadingConfig,
      session,
      responses,
      currentIndex,
      globalStart,
      itemStart,
      startSession,
      setCurrentIndex: setCurrentIndexSafe,
      recordAnswer,
      resetItemTimer,
      shiftTimersBy,
      pauseSession,
      clearSession
    }),
    [
      config,
      loadingConfig,
      session,
      responses,
      currentIndex,
      globalStart,
      itemStart,
      startSession,
      setCurrentIndexSafe,
      recordAnswer,
      resetItemTimer,
      shiftTimersBy,
      pauseSession,
      clearSession
    ]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return ctx;
}
