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
  SessionStartResponse
} from "../types";

interface PersistedState {
  session: SessionStartResponse;
  responses: Record<number, RecordedAnswer>;
  currentIndex: number;
  globalStart: number;
  itemStart: number;
}

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
  clearSession: () => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

const STORAGE_KEY = "human_ai_experiment_state";

const isValidPersistedSession = (
  sessionData: SessionStartResponse | undefined
): sessionData is SessionStartResponse => {
  if (!sessionData) return false;
  if (!sessionData.session_id?.trim()) return false;
  if (!sessionData.participant_id?.trim()) return false;
  if (!sessionData.group_id?.trim()) return false;
  if (!Array.isArray(sessionData.stages) || !Array.isArray(sessionData.items)) return false;
  return true;
};

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
      setSession(null);
      setResponses({});
      setCurrentIndex(0);
      setGlobalStart(null);
      setItemStart(null);
      return;
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as PersistedState;
      if (isValidPersistedSession(parsed.session)) {
        setSession(parsed.session);
        setResponses(parsed.responses ?? {});
        setCurrentIndex(parsed.currentIndex ?? 0);
        setGlobalStart(parsed.globalStart ?? Date.now());
        setItemStart(parsed.itemStart ?? Date.now());
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      console.warn("Failed to parse persisted session state", error);
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [config]);

  const persistState = useCallback(
    (next: Partial<PersistedState>) => {
      if (!session || globalStart === null || itemStart === null || config?.allow_resume === false) {
        return;
      }
      const snapshot: PersistedState = {
        session,
        responses,
        currentIndex,
        globalStart,
        itemStart,
        ...next
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    },
    [session, responses, currentIndex, globalStart, itemStart]
  );

  const startSession = useCallback(
    (sessionData: SessionStartResponse) => {
      if (session && session.session_id === sessionData.session_id) {
        setSession(sessionData);
        persistState({ session: sessionData } as Partial<PersistedState>);
        return;
      }

      setSession(sessionData);
      setResponses({});
      setCurrentIndex(0);
      const now = Date.now();
      setGlobalStart(now);
      setItemStart(now);
      const snapshot: PersistedState = {
        session: sessionData,
        responses: {},
        currentIndex: 0,
        globalStart: now,
        itemStart: now
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    },
    [session, persistState]
  );

  const recordAnswer = useCallback(
    (orderIndex: number, answer: RecordedAnswer) => {
      setResponses((prev) => {
        const next = { ...prev, [orderIndex]: answer };
        persistState({ responses: next });
        return next;
      });
    },
    [persistState]
  );

  const resetItemTimer = useCallback(() => {
    const now = Date.now();
    setItemStart(now);
    persistState({ itemStart: now });
  }, [persistState]);

  const shiftTimersBy = useCallback((deltaMs: number) => {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    setGlobalStart((prev) => (prev === null ? prev : prev + deltaMs));
    setItemStart((prev) => (prev === null ? prev : prev + deltaMs));
  }, []);

  const setCurrentIndexSafe = useCallback(
    (index: number) => {
      setCurrentIndex(index);
      persistState({ currentIndex: index });
    },
    [persistState]
  );

  const clearSession = useCallback(() => {
    setSession(null);
    setResponses({});
    setCurrentIndex(0);
    setGlobalStart(null);
    setItemStart(null);
    window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => {
    if (session && globalStart !== null && itemStart !== null) {
      persistState({});
    }
  }, [session, globalStart, itemStart, persistState]);

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
