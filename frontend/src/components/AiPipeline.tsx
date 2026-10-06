import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { api, useApi } from "../api/client";
import type { Advice, RiskResponse } from "../api/types";
import { useApp } from "../lib/context";
import { fmt, STATUS_HEX } from "../lib/format";
import { levelStatus } from "./Attention";

/**
 * Анимированный ход анализа: MONITOR → ANALYZE → PREDICT → RECOMMEND.
 * Каждый этап показывает реальные результаты расчёта (не декоративный текст).
 * RECOMMEND ждёт ответа /api/advice (Claude или правила).
 */

const STAGES = [
  { key: "monitor", title: "MONITOR", sub: "Сбор данных" },
  { key: "analyze", title: "ANALYZE", sub: "KPI и отклонения" },
  { key: "predict", title: "PREDICT", sub: "Индекс риска" },
  { key: "recommend", title: "RECOMMEND", sub: "Действия" },
] as const;
const STEP_MS = 1300;

export function AiPipeline({ risk, advice, onDone }: { risk: RiskResponse; advice: Advice | null; onDone?: () => void }) {
  const { motion: anim } = useApp();
  const prod = useApi(() => api.production(null), []);
  const down = useApi(() => api.downtime(null), []);
  const qual = useApi(() => api.quality(null), []);
  const [stage, setStage] = useState(anim ? -1 : 4);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (!anim) { setStage(4); return; }
    setStage(0);
    const timers = [1, 2, 3].map((i) => window.setTimeout(() => setStage(i), i * STEP_MS));
    return () => timers.forEach(clearTimeout);
  }, [run, anim]);

  // Последний этап завершается, когда готовы рекомендации
  useEffect(() => {
    if (stage === 3 && advice) {
      const t = window.setTimeout(() => setStage(4), anim ? 700 : 0);
      return () => clearTimeout(t);
    }
  }, [stage, advice, anim]);
  useEffect(() => { if (stage === 4) onDone?.(); }, [stage, onDone]);

  const deviations = prod.data
    ? prod.data.by_date.flatMap((d) => d.lines.flatMap((l) => Object.values(l.statuses))).filter((s) => s !== "ok").length
    : 0;
  const nProd = prod.data?.by_date.reduce((a, d) => a + d.lines.length, 0) ?? 0;

  const content: Record<string, JSX.Element> = {
    monitor: (
      <span>{nProd} записей производства · {down.data?.events.length ?? 0} простоя · {qual.data?.rows.length ?? 0} замеров качества · 2 смены</span>
    ),
    analyze: (
      <span>Рассчитаны OEE, брак, выполнение плана; отклонений от норм: <b className="text-warn">{deviations}</b>; узкое место смещается: {risk.bottleneck.previous?.section} → <b className="text-warn">{risk.bottleneck.current.section}</b></span>
    ),
    predict: (
      <div className="mt-1 space-y-1.5">
        {risk.risks.map((r, i) => {
          const c = STATUS_HEX[levelStatus(r.level.code, r.stage)];
          return (
            <div key={r.section_id} className="flex items-center gap-2 text-xs">
              <span className="w-20 shrink-0 text-slate-300">{r.section}</span>
              <div className="h-2 flex-1 rounded-full bg-bg">
                <motion.div className="h-2 rounded-full" style={{ background: c }}
                  initial={{ width: 0 }} animate={{ width: `${r.risk_index}%` }} transition={{ duration: 0.9, delay: i * 0.15 }} />
              </div>
              <span className="num w-10 text-right" style={{ color: c }}>{fmt(r.risk_index)}</span>
            </div>
          );
        })}
      </div>
    ),
    recommend: advice ? (
      <span>{advice.items.reduce((a, i) => a + i.actions.length, 0)} действий для {advice.items.length} участков · {advice.source === "claude" ? `сформулировано Claude` : "шаблоны правил (офлайн)"}</span>
    ) : (
      <span className="text-muted">формулирую рекомендации…</span>
    ),
  };

  return (
    <div className="rounded-xl border border-brand/40 bg-gradient-to-br from-brand/10 via-panel to-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-brand">AI-анализ завода</div>
        <button onClick={() => setRun((x) => x + 1)} disabled={stage >= 0 && stage < 4}
          className="rounded-md border border-line px-2.5 py-1 text-xs text-muted hover:text-white disabled:opacity-40">
          ↻ Запустить анализ заново
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {STAGES.map((s, i) => {
          const state = stage > i ? "done" : stage === i ? "active" : "wait";
          return (
            <div key={s.key} className={`relative rounded-lg border p-3 transition-colors duration-500 ${
              state === "active" ? "border-brand bg-brand/10" : state === "done" ? "border-line bg-panel2" : "border-line/50 bg-transparent opacity-50"
            }`}>
              <div className="flex items-center gap-2">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                  state === "done" ? "bg-ok/20 text-ok" : state === "active" ? "bg-brand text-white" : "bg-panel2 text-muted"
                }`}>
                  {state === "done" ? "✓" : i + 1}
                </span>
                <div>
                  <div className="text-xs font-bold tracking-wider">{s.title}</div>
                  <div className="text-[10px] text-muted">{s.sub}</div>
                </div>
                {state === "active" && <span className="ml-auto h-2 w-2 animate-ping rounded-full bg-brand" />}
              </div>
              <AnimatePresence>
                {state !== "wait" && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-2 text-xs leading-relaxed text-slate-300">
                    {content[s.key]}
                  </motion.div>
                )}
              </AnimatePresence>
              {i < 3 && <div className={`absolute -right-3 top-1/2 hidden h-px w-3 md:block ${stage > i ? "bg-ok" : "bg-line"}`} />}
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {stage === 4 && advice && (
          <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className="mt-4 border-t border-line pt-4 text-lg leading-relaxed text-slate-100">
            {advice.summary}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
