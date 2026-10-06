import { motion } from "framer-motion";
import type { FactoryNode, Meta } from "../api/types";
import { fmtInt, fmtPct, STATUS_HEX } from "../lib/format";
import { applyRecommendations, runScenario, type StageInput } from "../lib/whatif";
import { scenarioNodes } from "../pages/WhatIf";
import { FactoryFlow } from "./FactoryFlow";

/** Два будущих на одном экране: продолжить как 02.10 или применить рекомендации AI. Одна и та же модель. */
export function TwoFutures({ base, nodes, meta }: { base: StageInput[]; nodes: FactoryNode[]; meta: Meta }) {
  const target = meta.targets.monthly_output_min;
  const rec = applyRecommendations(base, meta.targets.defect_max_pct);
  const a = runScenario({ stages: base, shiftsPerDay: 2, workingDays: 22 }, target);
  const b = runScenario({ stages: rec, shiftsPerDay: 2, workingDays: 22 }, target);
  const rows = [
    { key: "a", title: "Без действий", sub: "темп и брак как 02.10", r: a, stages: base, color: STATUS_HEX.critical },
    { key: "b", title: "С рекомендациями AI", sub: "Сварка до плана, брак ≤ 2%", r: b, stages: rec, color: STATUS_HEX.warning },
  ];
  return (
    <div className="space-y-3" data-tour="two-futures">
      {rows.map((row, i) => (
        <motion.div key={row.key} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.25 }}
          className="grid items-center gap-4 rounded-xl border bg-panel p-4 lg:grid-cols-[220px_minmax(0,1fr)]" style={{ borderColor: row.color + "77" }}>
          <div>
            <div className="text-xs uppercase tracking-wider" style={{ color: row.color }}>{row.title}</div>
            <div className="text-[11px] text-muted">{row.sub}</div>
            <div className="num mt-2 text-4xl font-bold" style={{ color: row.color }}>{fmtInt(row.r.monthly)}</div>
            <div className="text-xs text-muted">авто/мес · цель {fmtInt(target)}</div>
            <div className="mt-2 text-xs text-slate-300">узкое место: <b className="text-warn">{row.r.bottleneck.name}</b> · {fmtPct(row.r.perShift)}/смену</div>
          </div>
          <FactoryFlow nodes={scenarioNodes(nodes, row.stages, meta)} onSelect={() => {}} interactive={false} dateLabel={`сценария «${row.title}»`} />
        </motion.div>
      ))}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
        className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-line bg-panel2 px-5 py-4">
        <div className="num text-3xl font-bold text-ok">+{fmtInt(b.monthly - a.monthly)}</div>
        <div className="text-sm text-slate-200">авто в месяц дают рекомендации AI — узкое место смещается со Сварки на Окраску.</div>
        <div className="text-sm text-slate-300">
          До цели ещё <b className="num text-crit">{fmtInt(-b.gap)}</b>: нужен темп Окраски ≈ <b className="num">{fmtPct(b.requiredPace)}</b>/смену или дополнительные смены.
        </div>
      </motion.div>
    </div>
  );
}
