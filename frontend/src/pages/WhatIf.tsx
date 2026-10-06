import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { api, useApi } from "../api/client";
import type { FactoryNode, Meta, Status } from "../api/types";
import { FlowView, useViewMode, ViewToggle } from "../components/FlowView";
import { TwoFutures } from "../components/TwoFutures";
import { useSearchParams } from "react-router-dom";
import { CalcTag, Card, Loading, PageTitle } from "../components/ui";
import { useApp } from "../lib/context";
import { bandStatus, fmtInt, fmtPct, STATUS_HEX } from "../lib/format";
import { applyRecommendations, baselineFromLines, PLAN_PER_SHIFT, runScenario, type StageInput } from "../lib/whatif";

/** Узлы карты для сценария: метрики считаются из ползунков, оборудование не показываем (его в сценарии нет). */
export function scenarioNodes(base: FactoryNode[], stages: StageInput[], meta: Meta): FactoryNode[] {
  const th = meta.thresholds;
  return base.map((n) => {
    const s = stages.find((x) => x.id === n.id);
    if (!s || !n.metrics) return { ...n, equipment: [] };
    const completion = (s.pace / PLAN_PER_SHIFT) * 100;
    const statuses = {
      plan_completion: bandStatus(th.plan_completion_pct, completion),
      defect: bandStatus(th.defect_pct, Math.round(s.defectPct * 10) / 10),
      oee: "ok" as Status,
    };
    const order = { ok: 0, warning: 1, critical: 2, no_data: -1 };
    const status = (Object.values(statuses) as Status[]).reduce((a, b) => (order[b] > order[a] ? b : a), "ok" as Status);
    return {
      ...n, status, equipment: [],
      metrics: {
        plan: PLAN_PER_SHIFT, fact: Math.round(s.pace), plan_completion_pct: completion, load_pct: n.metrics.load_pct,
        oee_pct: NaN, defect_pct: s.defectPct, defect_norm_ratio: s.defectPct / meta.targets.defect_max_pct, statuses,
      },
    };
  });
}

function Slider({ label, value, min, max, step, unit, onChange, hint }: {
  label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void; hint?: string;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="num font-semibold text-slate-100">{step < 1 ? fmtPct(value) : value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[#ef3e36]" aria-label={label} />
      {hint && <div className="text-[10px] text-muted">{hint}</div>}
    </label>
  );
}

export default function WhatIf() {
  const { meta } = useApp();
  const ov = useApi(() => api.overview(meta?.dates[meta.dates.length - 1] ?? null), [meta]);
  const prod = useApi(() => api.production(meta?.dates[meta.dates.length - 1] ?? null), [meta]);
  const view = useViewMode();
  const base = useMemo(() => (prod.data ? baselineFromLines(prod.data.lines) : null), [prod.data]);
  const [stages, setStages] = useState<StageInput[] | null>(null);
  const [shiftsPerDay, setShifts] = useState(2);
  const [days, setDays] = useState(22);
  const [applied, setApplied] = useState(false);
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "sandbox" ? "sandbox" : "futures";

  if (!meta || !ov.data || !base) return <Loading error={ov.error ?? prod.error} />;
  const cur = stages ?? base;
  const target = meta.targets.monthly_output_min;
  const res = runScenario({ stages: cur, shiftsPerDay, workingDays: days }, target);
  const baseRes = runScenario({ stages: base, shiftsPerDay: 2, workingDays: 22 }, target);
  const nodes = scenarioNodes(ov.data.nodes, cur, meta);
  const set = (id: string, patch: Partial<StageInput>) => { setApplied(false); setStages(cur.map((s) => (s.id === id ? { ...s, ...patch } : s))); };
  const ok = res.gap >= 0;
  const maxGood = Math.max(...res.stages.map((s) => s.good), PLAN_PER_SHIFT);

  return (
    <>
      <PageTitle title="Что если — сценарии" subtitle="Двойник проигрывает решения до того, как их применят на заводе. Старт — состояние 02.10."
        extra={
          <div className="inline-flex rounded-lg border border-line bg-panel p-0.5" role="tablist">
            {([["futures", "Два будущих"], ["sandbox", "Песочница"]] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setParams(k === "sandbox" ? { tab: k } : {}, { replace: true })}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === k ? "bg-panel2 text-white" : "text-muted hover:text-white"}`}>{l}</button>
            ))}
          </div>
        } />
      {tab === "futures" ? <TwoFutures base={base} nodes={ov.data.nodes} meta={meta} /> : (
      <div className="grid items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card title="Параметры" extra={<CalcTag title="Сценарная модель баланса линии" />}>
          <div className="space-y-5">
            {cur.map((s) => (
              <div key={s.id} className={`rounded-lg border p-3 ${res.bottleneck.id === s.id ? "border-warn/60 bg-warn/5" : "border-line"}`}>
                <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                  {s.name}
                  {res.bottleneck.id === s.id && <span className="text-[10px] font-semibold uppercase tracking-wider text-warn">узкое место</span>}
                </div>
                <div className="space-y-2">
                  <Slider label="Темп, авто/смену" value={s.pace} min={95} max={135} step={1} unit="" onChange={(v) => set(s.id, { pace: v })} hint="план 120" />
                  <Slider label="Брак" value={s.defectPct} min={0} max={8} step={0.1} unit="%" onChange={(v) => set(s.id, { defectPct: v })} />
                </div>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-muted">Смен в сутки</div>
                <div className="mt-1 inline-flex rounded-lg border border-line p-0.5">
                  {[1, 2, 3].map((n) => (
                    <button key={n} onClick={() => setShifts(n)} className={`num rounded-md px-3 py-1 text-sm ${shiftsPerDay === n ? "bg-panel2 text-white" : "text-muted"}`}>{n}</button>
                  ))}
                </div>
              </div>
              <Slider label="Рабочих дней" value={days} min={18} max={26} step={1} unit="" onChange={setDays} />
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={() => { setStages(applyRecommendations(cur, meta.targets.defect_max_pct)); setApplied(true); }}
                className="rounded-lg bg-brand px-3 py-2.5 text-sm font-semibold text-white hover:brightness-110">
                ✦ Применить рекомендации AI
              </button>
              <button onClick={() => { setStages(null); setShifts(2); setDays(22); setApplied(false); }}
                className="rounded-lg border border-line px-3 py-2 text-sm text-muted hover:text-white">↺ Как 02.10</button>
            </div>
            <AnimatePresence>
              {applied && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-xs leading-relaxed text-slate-300">
                  Применено: темп Сварки восстановлен до плана (диагностика ABB-01, проверка ABB-04 после ТО), брак доведён до нормы ≤ {meta.targets.defect_max_pct}% (Камера-02, сварные точки).
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </Card>

        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-xl border bg-panel p-5" style={{ borderColor: (ok ? STATUS_HEX.ok : STATUS_HEX.critical) + "88" }}>
              <div className="text-xs text-muted">Устойчивый выпуск, авто/мес</div>
              <div className="mt-1 flex items-baseline gap-3">
                <motion.span key={res.monthly} initial={{ opacity: 0.4, y: 6 }} animate={{ opacity: 1, y: 0 }} className="num text-5xl font-bold"
                  style={{ color: ok ? STATUS_HEX.ok : STATUS_HEX.critical }}>{fmtInt(res.monthly)}</motion.span>
                <span className="text-sm text-muted">цель {fmtInt(target)}</span>
              </div>
              <div className={`num mt-1 text-sm font-semibold ${ok ? "text-ok" : "text-crit"}`}>
                {res.gap >= 0 ? "+" : ""}{fmtInt(res.gap)} к цели · {res.monthly - baseRes.monthly >= 0 ? "+" : ""}{fmtInt(res.monthly - baseRes.monthly)} к 02.10
              </div>
              <div className="mt-3 text-xs text-muted">{fmtPct(res.perShift)} годных/смену × {res.shifts} смен</div>
            </div>
            <div className="rounded-xl border border-line bg-panel p-5">
              <div className="text-xs text-muted">Годных за смену по участкам</div>
              <div className="mt-3 space-y-2.5">
                {res.stages.map((s) => (
                  <div key={s.id} className="text-xs">
                    <div className="flex justify-between">
                      <span className={s.bottleneck ? "font-semibold text-warn" : "text-slate-300"}>{s.bottleneck && "▶ "}{s.name}</span>
                      <span className="num text-muted">{fmtPct(s.good)}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-bg">
                      <motion.div className="h-2 rounded-full" animate={{ width: `${(s.good / maxGood) * 100}%` }} transition={{ type: "spring", stiffness: 160, damping: 22 }}
                        style={{ background: s.bottleneck ? STATUS_HEX.warning : "#3987e5" }} />
                    </div>
                  </div>
                ))}
              </div>
              {!ok && (
                <p className="mt-3 text-xs text-slate-300">
                  Для цели узкому месту ({res.bottleneck.name}) нужен темп ≈ <b className="num">{fmtPct(res.requiredPace)}</b> авто/смену при браке {fmtPct(res.bottleneck.defectPct)}%.
                </p>
              )}
            </div>
          </div>
          <Card title="Поток в сценарии" extra={<ViewToggle mode={view.mode} setMode={view.setMode} />}>
            <FlowView mode={view.mode} nodes={nodes} onSelect={() => {}} dateLabel="сценария" />
          </Card>
          <p className="text-[11px] leading-relaxed text-muted">
            Модель: устойчивый выпуск после исчерпания межоперационных буферов = min по участкам (темп × (1 − брак)) × смены. Факт Сборки 02.10 (119) выше оценки 02.10 ({fmtPct(baseRes.perShift)}) за счёт буферов. Сценарная оценка, не прогноз с заявленной точностью.
          </p>
        </div>
      </div>
      )}
    </>
  );
}
