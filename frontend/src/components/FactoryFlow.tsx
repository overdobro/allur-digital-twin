import { AnimatePresence, motion as m } from "framer-motion";
import { useMemo } from "react";
import { useFlowSim, type SimGeometry } from "../lib/flowSim";
import type { FactoryNode, Status } from "../api/types";
import { useApp } from "../lib/context";
import { fmtPct, STATUS_HEX, STATUS_LABEL } from "../lib/format";

/**
 * Живой конвейер — симуляция потока по данным выбранной даты.
 * Скорость на участке ∝ факт/план (с усилением для наглядности), кузова не обгоняют друг друга,
 * поэтому перед медленным участком сама образуется очередь. Брак детерминирован: каждый N-й кузов,
 * N = 100 / %брака участка — доля брака на экране совпадает с данными.
 */

const W = 1200;
const ZONE_W = 172;
const GAP = 25.6;
const X0 = 20;
const BELT_Y = 176;
const CAR_W = 24;
const CAR_GAP = 34;
const BASE_SPEED = 110; // px/s при 100% плана

const zoneX = (i: number) => X0 + i * (ZONE_W + GAP);


export function keyMetric(n: FactoryNode): { label: string; value: string; status: Status } | null {
  const m = n.metrics;
  if (!m) return null;
  const eqBad = n.equipment.filter((e) => e.status !== "ok").sort((a, b) => b.downtime_min - a.downtime_min)[0];
  const cands: { label: string; value: string; status: Status; w: number }[] = [
    { label: "Брак", value: `${fmtPct(m.defect_pct)}%`, status: m.statuses.defect, w: 3 },
    { label: "OEE", value: `${fmtPct(m.oee_pct)}%`, status: m.statuses.oee, w: 2 },
    { label: "Выполнение плана", value: `${fmtPct(m.plan_completion_pct)}%`, status: m.statuses.plan_completion, w: 1 },
  ];
  if (eqBad) cands.push({ label: eqBad.name, value: `${eqBad.downtime_min} мин`, status: eqBad.status, w: 2.5 });
  const rank = { critical: 20, warning: 10, ok: 0, no_data: -1 } as const;
  // OEE в сценариях не считается (нет времени работы) — не показываем
  return cands.filter((c) => c.label !== "OEE" || Number.isFinite(m.oee_pct)).sort((a, b) => rank[b.status] + b.w - (rank[a.status] + a.w))[0];
}

function CarShape({ x, defect, drop }: { x: number; defect: boolean; drop: number }) {
  const y = BELT_Y - 11 + (defect ? Math.min(drop, 0.6) * 75 : 0);
  const op = defect ? Math.max(0, 1 - Math.max(0, drop - 0.45) * 2.2) : 1;
  const fill = defect ? "#ef4444" : "#cbd5e1";
  return (
    <g transform={`translate(${x} ${y})`} opacity={op}>
      <rect width={CAR_W} height={10} rx={3} fill={fill} />
      <rect x={6} y={-5} width={11} height={6} rx={2} fill={fill} />
      <rect x={8} y={-3.5} width={3} height={3} rx={0.5} fill="#0b1017" opacity={0.6} />
      <rect x={12.5} y={-3.5} width={3} height={3} rx={0.5} fill="#0b1017" opacity={0.6} />
    </g>
  );
}

export interface FlowEvent { index: number; section_id: string; text: string; severity: Status | "info" }

export function FactoryFlow({ nodes, override, highlight, onSelect, dateLabel, event, interactive = true }: {
  nodes: FactoryNode[]; override?: Record<string, Status>; highlight?: string | null;
  onSelect: (id: string) => void; dateLabel: string; event?: FlowEvent | null;
  /** false — сценарные потоки без детализации: без «подробнее» и курсора-руки */
  interactive?: boolean;
}) {
  const { motion } = useApp();
  const sorted = useMemo(() => [...nodes].sort((a, b) => a.order - b.order), [nodes]);
  const geo = useMemo<SimGeometry>(() => ({
    zones: sorted.map((n, i) => ({ id: n.id, start: zoneX(i), end: zoneX(i) + ZONE_W })),
    trackStart: X0 - 10, trackEnd: W, carGap: CAR_GAP, baseSpeed: BASE_SPEED,
  }), [sorted]);
  const { cars, counters } = useFlowSim(sorted, geo, motion);
  const st = (n: FactoryNode) => override?.[n.id] ?? n.status;

  const evZone = event ? sorted.findIndex((n) => n.id === event.section_id) : -1;
  const evColor = event && event.severity !== "info" ? STATUS_HEX[event.severity] : "#94a3b8";

  return (
    <div className={`relative transition-[padding] duration-300 ${event !== undefined && event !== null ? "pt-11" : ""}`}>
      {/* Всплывающее событие replay над участком */}
      <AnimatePresence>
        {event && evZone >= 0 && (
          <m.div key={event.index} className="pointer-events-none absolute z-10"
            style={{ left: `${((zoneX(evZone) + ZONE_W / 2) / W) * 100}%`, top: 0 }}
            initial={{ opacity: 0, x: "-50%", y: 10, scale: 0.9 }} animate={{ opacity: 1, x: "-50%", y: 0, scale: 1 }} exit={{ opacity: 0, x: "-50%", y: -8 }}
            transition={{ duration: 0.3 }}>
            <div className="w-max max-w-[300px] rounded-lg border bg-bg/95 px-3 py-1.5 text-center text-xs font-medium shadow-xl"
              style={{ borderColor: evColor, color: evColor === "#94a3b8" ? "#e2e8f0" : evColor }}>
              {event.text}
            </div>
            <div className="mx-auto h-0 w-0 border-x-[6px] border-t-[7px] border-x-transparent" style={{ borderTopColor: evColor }} />
          </m.div>
        )}
      </AnimatePresence>
      <svg viewBox={`0 0 ${W} 262`} className="w-full select-none" role="img" aria-label="Производственный поток">
        <defs>
          <pattern id="belt" width="16" height="14" patternUnits="userSpaceOnUse">
            <rect width="16" height="14" fill="#18222f" />
            <rect width="2" height="14" fill="#243244" />
            {motion && <animateTransform attributeName="patternTransform" type="translate" from="0 0" to="16 0" dur="0.15s" repeatCount="indefinite" />}
          </pattern>
          <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="8" /></filter>
        </defs>

        {/* Зоны участков */}
        {sorted.map((n, i) => {
          const s = st(n);
          const c = STATUS_HEX[s];
          const km = s === "no_data" ? null : keyMetric(n);
          const x = zoneX(i);
          const clickable = interactive && n.line !== null;
          const isHl = highlight === n.id;
          return (
            <g key={n.id} onClick={() => clickable && onSelect(n.id)} className={clickable ? "cursor-pointer" : ""}
              role={clickable ? "button" : undefined} aria-label={clickable ? `${n.name}: ${STATUS_LABEL[s]}` : undefined}>
              {s === "critical" && <rect x={x} y={14} width={ZONE_W} height={206} rx={14} fill={c} opacity={0.25} filter="url(#glow)" className="zone-pulse" />}
              <rect x={x} y={14} width={ZONE_W} height={206} rx={14} fill="#121a24"
                stroke={c} strokeOpacity={s === "no_data" ? 0.35 : 0.9} strokeWidth={isHl ? 3 : 1.5}
                className="zone-frame" />
              {s !== "no_data" && <rect key={`flash-${s}`} x={x} y={14} width={ZONE_W} height={206} rx={14} fill={c} className="zone-flash" pointerEvents="none" />}
              <text x={x + 14} y={40} fill="#e2e8f0" fontSize={15} fontWeight={600}>{n.name.length > 14 ? n.name.split(" ")[0] : n.name}</text>
              {n.name.length > 14 && <text x={x + 14} y={57} fill="#e2e8f0" fontSize={15} fontWeight={600}>{n.name.split(" ").slice(1).join(" ")}</text>}
              <circle cx={x + ZONE_W - 16} cy={34} r={5} fill={c} />
              {km ? (
                <>
                  <text x={x + 14} y={88} fill="#8696a8" fontSize={11}>{km.label}</text>
                  <text x={x + 14} y={124} fill={STATUS_HEX[km.status] === STATUS_HEX.ok ? "#e2e8f0" : STATUS_HEX[km.status]} fontSize={30} fontWeight={700} className="num">{km.value}</text>
                </>
              ) : (
                <text x={x + 14} y={100} fill="#64748b" fontSize={12}>{n.metrics ? "ожидание данных…" : "нет данных"}</text>
              )}
              {clickable && <text x={x + ZONE_W - 14} y={208} textAnchor="end" fill="#64748b" fontSize={10}>подробнее ›</text>}
            </g>
          );
        })}

        {/* Лента */}
        <rect x={X0 - 10} y={BELT_Y} width={W - 20} height={14} rx={7} fill="url(#belt)" />
        <rect x={X0 - 10} y={BELT_Y} width={W - 20} height={14} rx={7} fill="none" stroke="#2c3b50" />

        {/* Счётчики брака под участками с данными */}
        {sorted.map((n, i) => {
          const cnt = counters[n.id];
          if (!n.metrics || !cnt || !motion) return null;
          return (
            <text key={n.id} x={zoneX(i) + 14} y={208} fill={cnt.defects ? "#ef4444" : "#64748b"} fontSize={10} className="num">
              брак {cnt.defects} из {cnt.passed}
            </text>
          );
        })}

        {/* Кузова */}
        {cars.map((c) => <CarShape key={c.id} x={c.x} defect={!!c.defectAt} drop={c.drop} />)}
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-3.5 rounded-sm bg-slate-300" />кузов</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-3.5 rounded-sm bg-crit" />брак — уходит с линии</span>
        <span>Симуляция по данным {dateLabel} · скорость участка ∝ факт/план · доля брака = данным · очередь = узкое место</span>
      </div>
    </div>
  );
}
