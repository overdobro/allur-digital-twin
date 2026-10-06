import { MotionConfig } from "framer-motion";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, useApi } from "../api/client";
import type { Meta } from "../api/types";

interface Ctx {
  meta: Meta | null;
  /** null — весь период */
  date: string | null;
  setDate: (d: string | null) => void;
  /** Анимации включены (выключаются вручную или системной настройкой reduced-motion) */
  motion: boolean;
  setMotion: (v: boolean) => void;
}

const AppContext = createContext<Ctx>({ meta: null, date: null, setDate: () => {}, motion: true, setMotion: () => {} });

function initialMotion(): boolean {
  try {
    const saved = localStorage.getItem("twin.motion");
    if (saved !== null) return saved === "1";
  } catch { /* storage недоступен */ }
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { data: meta } = useApi(api.meta, []);
  const [date, setDate] = useState<string | null>("2026-10-02");
  const [motion, setMotionState] = useState(initialMotion);
  const setMotion = (v: boolean) => {
    setMotionState(v);
    try { localStorage.setItem("twin.motion", v ? "1" : "0"); } catch { /* ignore */ }
  };
  useEffect(() => { document.documentElement.classList.toggle("no-motion", !motion); }, [motion]);
  return (
    <AppContext.Provider value={{ meta, date, setDate, motion, setMotion }}>
      <MotionConfig reducedMotion={motion ? "never" : "always"}>{children}</MotionConfig>
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
