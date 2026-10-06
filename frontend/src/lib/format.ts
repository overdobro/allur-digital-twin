import type { Status } from "../api/types";

export const fmt = (x: number, digits = 1) =>
  x.toLocaleString("ru-RU", { minimumFractionDigits: Number.isInteger(x) ? 0 : digits, maximumFractionDigits: digits });

export const fmtInt = (x: number) => Math.round(x).toLocaleString("ru-RU");

export const fmtDate = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
export const fmtDateShort = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

export const STATUS_LABEL: Record<Status, string> = {
  ok: "Норма", warning: "Внимание", critical: "Критично", no_data: "Нет данных",
};

export const STATUS_HEX: Record<Status, string> = {
  ok: "#22c55e", warning: "#f59e0b", critical: "#ef4444", no_data: "#64748b",
};

export const STATUS_TEXT: Record<Status, string> = {
  ok: "text-ok", warning: "text-warn", critical: "text-crit", no_data: "text-nodata",
};

/** Процент всегда с одним знаком: 2,0% рядом с нормой ≤2% не выглядит как «ровно норма». */
export const fmtPct = (x: number) => x.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Статус по порогам из /api/meta (копия backend Band.status) — для сценариев, считаемых в браузере. */
export function bandStatus(b: { ok: number; critical: number; higher_is_better: boolean }, v: number): Status {
  if (b.higher_is_better) return v >= b.ok ? "ok" : v >= b.critical ? "warning" : "critical";
  return v <= b.ok ? "ok" : v <= b.critical ? "warning" : "critical";
}
