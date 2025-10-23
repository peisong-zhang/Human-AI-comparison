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
  responses: Record<string, RecordedAnswer>;
  currentIndex: number;
  globalStart: number;
  itemStart: number;
}

interface SessionContextValue {
  config: ConfigResponse | null;
  loadingConfig: boolean;
  session: SessionStartResponse | null;
  responses: Record<string, RecordedAnswer>;
  currentIndex: number;
  globalStart: number | null;
  itemStart: number | null;
  startSession: (session: SessionStartResponse) => void;
  setCurrentIndex: (index: number) => void;
  recordAnswer: (imageId: string, answer: RecordedAnswer) => void;
  resetItemTimer: () => void;
  clearSession: () => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

const STORAGE_KEY = "human_ai_experiment_state";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [session, setSession] = useState<SessionStartResponse | null>(null);
  const [responses, setResponses] = useState<Record<string, RecordedAnswer>>({});
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
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as PersistedState;
      if (parsed.session && Array.isArray((parsed.session as SessionStartResponse).stages)) {
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
  }, []);

  const persistState = useCallback(
    (next: Partial<PersistedState>) => {
      if (!session || globalStart === null || itemStart === null) {
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
    (imageId: string, answer: RecordedAnswer) => {
      setResponses((prev) => {
        const next = { ...prev, [imageId]: answer };
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
