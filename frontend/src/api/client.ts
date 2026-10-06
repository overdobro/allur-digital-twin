import { useEffect, useState } from "react";
import { effectCalc, type EffectInputs } from "../lib/effect";
import type {
  Advice, Downtime, Effect, Forecast, LineMetrics, Meta, Overview, QualityRow, ReplayStep, RiskResponse, SectionDetail,
} from "./types";

/** Статический режим (GitLab Pages): ответы API заранее выгружены в JSON, сервера нет. */
export const STATIC = import.meta.env.VITE_STATIC === "1";
const BASE = STATIC ? `${import.meta.env.BASE_URL}static-api/` : (import.meta.env.VITE_API_URL ?? "/api");

type Params = Record<string, string | number | boolean | null | undefined>;

const clean = (params: Params = {}) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => [k, String(v)]));

/** Имя файла — та же схема, что backend/app/export_static.py → file_name. */
export function staticName(path: string, params: Params = {}): string {
  const p = clean(params);
  const keys = Object.keys(p).sort();
  return path.replace(/^\/+/, "").replace(/\//g, "_") + (keys.length ? "__" + keys.map((k) => `${k}=${p[k]}`).join("&") : "") + ".json";
}

async function get<T>(path: string, params: Params = {}): Promise<T> {
  const url = STATIC
    ? BASE + staticName(path, params)
    : BASE + path + (Object.keys(clean(params)).length ? "?" + new URLSearchParams(clean(params)).toString() : "");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json() as Promise<T>;
}

let inputsCache: Promise<EffectInputs> | null = null;

export const api = {
  meta: () => get<Meta>("/meta"),
  overview: (date: string | null) => get<Overview>("/overview", { date }),
  section: (id: string, date: string | null) => get<SectionDetail>(`/sections/${id}`, { date }),
  production: (date: string | null) => get<{ lines: LineMetrics[]; by_date: { date: string; lines: LineMetrics[] }[] }>("/production", { date }),
  quality: (date: string | null) => get<{ norm_pct: number; rows: QualityRow[] }>("/quality", { date }),
  downtime: (date: string | null) => get<Downtime>("/downtime", { date }),
  risk: () => get<RiskResponse>("/risk"),
  // В статике рекомендации сгенерированы при сборке — refresh не нужен
  advice: (refresh = false) => get<Advice>("/advice", STATIC ? {} : { refresh: refresh || null }),
  forecast: () => get<Forecast>("/forecast"),
  effect: async (p: { working_days?: number; defect_target_pct?: number; downtime_cut_pct?: number; margin_per_car?: number | null }) => {
    if (!STATIC) return get<Effect>("/effect", p);
    inputsCache ??= get<EffectInputs>("/effect-inputs");
    return effectCalc(await inputsCache, p.working_days ?? 22, p.defect_target_pct ?? 2, p.downtime_cut_pct ?? 50, p.margin_per_car ?? null);
  },
  replay: () => get<{ steps: ReplayStep[]; total: number }>("/replay"),
};

/** Загрузка данных с повторным запросом при смене зависимостей. */
export function useApi<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null; loading: boolean } {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fn()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e: Error) => alive && setState({ data: null, error: e.message, loading: false }));
    return () => { alive = false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
