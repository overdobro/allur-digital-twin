import { animate } from "framer-motion";
import { useEffect, useRef } from "react";
import type { Forecast, Kpi, Status } from "../api/types";
import { useApp } from "../lib/context";
import { fmtInt, fmtPct, STATUS_HEX } from "../lib/format";
import { CalcTag, Dot } from "./ui";

/** Число «набирается» от предыдущего значения к новому. */
function CountUp({ value, decimals }: { value: number; decimals: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  const { motion } = useApp();
  const format = (v: number) => (decimals ? fmtPct(v) : fmtInt(v));
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!motion) { el.textContent = format(value); prev.current = value; return; }
    const ctrl = animate(prev.current, value, { duration: 1.1, ease: "easeOut", onUpdate: (v) => { el.textContent = format(v); } });
    prev.current = value;
    return () => ctrl.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, motion]);
  return <span ref={ref}>{format(value)}</span>;
}

function Trend({ delta, better, unit }: { delta: number | null; better: "up" | "down"; unit: string }) {
  if (delta === null || Math.abs(delta) < 0.05) return null;
  const good = better === "up" ? delta > 0 : delta < 0;
  return (
    <span className={`num text-xs font-medium ${good ? "text-ok" : "text-crit"}`} title="Изменение к 01.10">
      {delta > 0 ? "▲" : "▼"} {fmtPct(Math.abs(delta)).replace(",0", "")}{unit}
    </span>
  );
}

function Tile({ label, value, decimals, unit, target, status, line, lineStatus, tip, calc, delta, better = "up", deltaUnit = "" }: {
  label: string; value: number; decimals: number; unit?: string; target: string; status: Status;
  line: string; lineStatus?: Status; tip: string; calc?: boolean; delta: number | null; better?: "up" | "down"; deltaUnit?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-panel p-4" title={tip}>
      <div className="absolute inset-y-0 left-0 w-1 transition-colors duration-700" style={{ background: STATUS_HEX[status] }} />
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="flex items-center gap-2">{label}{calc && <CalcTag />}</span>
        <Dot status={status} pulse />
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="num text-4xl font-semibold transition-colors duration-700" style={{ color: status === "ok" ? undefined : STATUS_HEX[status] }}>
          <CountUp value={value} decimals={decimals} />
        </span>
        {unit && <span className="text-sm text-muted">{unit}</span>}
        <span className="ml-auto"><Trend delta={delta} better={better} unit={deltaUnit} /></span>
      </div>
      <div className="mt-1 text-xs text-muted">{target}</div>
      <div className="mt-2 truncate text-xs" style={{ color: lineStatus && lineStatus !== "ok" ? STATUS_HEX[lineStatus] : "#cbd5e1" }}>{line}</div>
    </div>
  );
}

export function KpiBar({ kpi, prev, forecast }: { kpi: Kpi; prev?: Kpi | null; forecast: Forecast | null }) {
  const d = kpi.downtime;
  const dl = (a: number, b?: number) => (prev && b !== undefined ? a - b : null);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        label="OEE" calc value={kpi.oee.value_pct} decimals={1} unit="%" status={kpi.oee.status}
        target={`цель ≥ ${kpi.oee.target_pct}%`} delta={dl(kpi.oee.value_pct, prev?.oee.value_pct)} deltaUnit=" п.п."
        line={`худшая линия: ${kpi.oee.worst.section} ${fmtPct(kpi.oee.worst.value_pct)}%`} lineStatus={kpi.oee.status}
        tip="Среднее по линиям. OEE = Доступность × Производительность × Качество (допущение A2). Статус — по худшей линии."
      />
      <Tile
        label="Брак" value={kpi.defect.value_pct} decimals={1} unit="%" status={kpi.defect.status} better="down"
        target={`норма ≤ ${kpi.defect.target_pct}%`} delta={dl(kpi.defect.value_pct, prev?.defect.value_pct)} deltaUnit=" п.п."
        line={`${kpi.defect.worst.section} ${fmtPct(kpi.defect.worst.value_pct)}%${kpi.defect.worst.norm_ratio > 1 ? ` · ×${fmtPct(kpi.defect.worst.norm_ratio)} к норме` : ""}`}
        lineStatus={kpi.defect.status}
        tip="Брак по заводу = сумма брака / сумма выпуска участков. Статус — по худшему участку."
      />
      <Tile
        label="Простой оборудования" value={d.max_equipment_day_min} decimals={0} unit="мин" status={d.status} better="down"
        target={`норма ≤ ${d.target_min} мин/сутки`} delta={null}
        line={`аварийных инцидентов: ${d.incidents}`}
        tip={`Максимальный аварийный простой единицы оборудования за сутки (A5). Всего простоев: ${d.total_min} мин, включая плановое ТО.`}
      />
      <Tile
        label="Выпуск" value={kpi.output.fact} decimals={0} unit={`/ ${kpi.output.plan}`} status={kpi.output.status}
        target={`${kpi.date ? "план смены" : "план периода"} · ${fmtPct(kpi.output.completion_pct)}%`} delta={dl(kpi.output.fact, prev?.output.fact)}
        line={forecast ? `прогноз месяца ${fmtInt(forecast.forecast)} из ${fmtInt(forecast.target)}` : ""} lineStatus={forecast?.status}
        tip={forecast ? `Выпуск завода = выход Сборки (A3). Прогноз: ${forecast.forecast_formula}.` : "Выпуск завода = выход Сборки (A3)."}
      />
    </div>
  );
}
