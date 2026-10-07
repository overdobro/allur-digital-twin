import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useState } from "react";
import { AiPipeline } from "../components/AiPipeline";

const reveal = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.45 } } };
import { useLocation } from "react-router-dom";
import { api, useApi } from "../api/client";
import type { Advice, Recommendation, Risk, RiskResponse } from "../api/types";
import { KIND_LABEL, levelStatus, STAGE_LABEL } from "../components/Attention";
import { Card, Dot, Loading, PageTitle } from "../components/ui";
import { fmt, fmtDateShort, STATUS_HEX } from "../lib/format";

const FACTOR_LABEL: Record<string, string> = {
  defect_gap: "Брак выше нормы", defect_trend: "Рост брака", oee_gap: "OEE ниже цели",
  oee_trend: "Падение OEE", output_gap: "Недовыпуск", downtime: "Простои оборудования",
};

export function AdviceSource({ advice }: { advice: Advice }) {
  return advice.source === "claude" ? (
    <span className="rounded bg-[#d97757]/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-[#e8a184]">Claude · {advice.model}</span>
  ) : (
    <span className="rounded bg-slate-500/20 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-slate-300"
      title={advice.fallback_reason ? `LLM недоступна (${advice.fallback_reason}) — шаблонные рекомендации` : "LLM не настроена — шаблонные рекомендации"}>
      Правила · офлайн
    </span>
  );
}

function RiskCard({ risk, rec, focused, expanded = false }: { risk: Risk; rec: Recommendation; focused: boolean; expanded?: boolean }) {
  const st = levelStatus(risk.level.code, risk.stage);
  const max = Math.max(...risk.factors.map((f) => f.contribution), 1);
  const [open, setOpen] = useState(focused || expanded);
  const evidence = new Set(risk.factors.map((f) => f.evidence));
  const extraWhy = rec.why.filter((w) => !evidence.has(w));
  return (
    <section className={`rounded-xl border bg-panel ${focused ? "ring-2 ring-brand" : ""}`} style={{ borderColor: STATUS_HEX[st] + "88" }}>
      {/* Свёрнутое резюме: кто, что случилось, главное действие */}
      <button onClick={() => setOpen(!open)} className="grid w-full gap-4 px-5 py-4 text-left md:grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center" aria-expanded={open}>
        <div className="flex items-center gap-3">
          <Dot status={st} pulse size={12} />
          <div>
            <div className="text-lg font-semibold">{risk.section}</div>
            <div className="text-xs text-muted">{STAGE_LABEL[risk.stage]} · {KIND_LABEL[risk.kind]}</div>
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-brand">Что случилось</div>
          <div className="mt-0.5 text-sm text-slate-100">{rec.what}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ok">Главное действие</div>
          <div className="mt-0.5 text-sm text-slate-100">{rec.actions[0]}</div>
        </div>
        <div className="flex items-center gap-4 md:justify-end">
          <div className="text-right">
            <div className="num text-2xl font-semibold" style={{ color: STATUS_HEX[st] }}>{fmt(risk.risk_index)}</div>
            <div className="text-[10px] text-muted">риск · {risk.level.label.toLowerCase()}</div>
          </div>
          <motion.span animate={{ rotate: open ? 180 : 0 }} className="text-muted">▾</motion.span>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }} className="overflow-hidden">
            <div className="grid gap-5 border-t border-line p-5 lg:grid-cols-2">
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-brand">AI Prediction · риск</h3>
                <p className="mt-1 text-sm text-slate-100">{rec.risk}</p>
                <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-brand">Why · факторы модели</h3>
                <ul className="mt-2 space-y-2">
                  {risk.factors.map((f, i) => (
                    <li key={f.key} className="text-xs">
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-300">{FACTOR_LABEL[f.key] ?? f.key}</span>
                        <span className="num text-muted">+{fmt(f.contribution)}</span>
                      </div>
                      <div className="mt-0.5 h-1.5 rounded-full bg-bg">
                        <motion.div className="h-1.5 rounded-full bg-[#3987e5]" initial={{ width: 0 }}
                          animate={{ width: `${(f.contribution / max) * 100}%` }} transition={{ duration: 0.6, delay: 0.05 * i }} />
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted">{f.evidence}</div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-line bg-panel2 p-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ok">Recommendation · что сделать</h3>
                <ol className="mt-2 space-y-2">
                  {rec.actions.map((a, i) => (
                    <li key={a} className="flex gap-2.5 text-sm text-slate-100">
                      <span className="num mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ok/20 text-[11px] font-semibold text-ok">{i + 1}</span>
                      <span>{a}</span>
                    </li>
                  ))}
                </ol>
                {extraWhy.length > 0 && (
                  <>
                    <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted">Обоснование</h3>
                    <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-slate-400">
                      {extraWhy.map((w) => <li key={w}>{w}</li>)}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function Bottleneck({ b }: { b: RiskResponse["bottleneck"] }) {
  const max = Math.max(...b.by_date.flatMap((d) => d.ranking.map((r) => r.lost_units)));
  return (
    <Card title="Bottleneck Detector" extra={<span className="text-xs text-muted">потери годных к плану, ед./смену</span>}>
      <div className="grid gap-5 sm:grid-cols-2">
        {b.by_date.map((d) => (
          <div key={d.date}>
            <div className="mb-2 text-xs font-semibold text-muted">{fmtDateShort(d.date)}</div>
            {d.ranking.map((r, i) => (
              <div key={r.section_id} className="mb-2 text-xs">
                <div className="flex justify-between">
                  <span className={i === 0 ? "font-semibold text-warn" : "text-slate-300"}>{i === 0 && "▶ "}{r.section}</span>
                  <span className="num text-muted">{r.lost_units} = {r.underproduction} недовыпуск + {r.defects} брак</span>
                </div>
                <div className="mt-1 flex h-2 gap-[2px] overflow-hidden rounded-full bg-bg">
                  <div className="h-2 rounded-l-full bg-[#3987e5]" style={{ width: `${(r.underproduction / max) * 100}%` }} title="Недовыпуск" />
                  <div className="h-2 rounded-r-full bg-[#7aa6e8]" style={{ width: `${(r.defects / max) * 100}%` }} title="Брак" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#3987e5]" />Недовыпуск</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#7aa6e8]" />Брак</span>
      </div>
      {b.shifted && b.previous && (
        <div className="mt-4 rounded-lg bg-warn/10 px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-muted">Узкое место смещается вверх по потоку</div>
          <div className="mt-2 flex items-center gap-3">
            <span className="rounded-md border border-line bg-panel px-3 py-1.5 text-sm">
              <span className="text-muted">{fmtDateShort(b.previous.date)}</span> <b>{b.previous.section}</b>
            </span>
            <div className="relative h-0.5 flex-1 overflow-hidden bg-line">
              <motion.div className="absolute inset-y-0 left-0 bg-warn" initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ duration: 1.2, delay: 0.3 }} />
            </div>
            <motion.span className="rounded-md border border-warn bg-warn/15 px-3 py-1.5 text-sm text-warn"
              initial={{ opacity: 0.3, scale: 0.9 }} animate={{ opacity: 1, scale: [0.9, 1.08, 1] }} transition={{ duration: 0.6, delay: 1.4 }}>
              <span className="text-muted">{fmtDateShort(b.current.date)}</span> <b>{b.current.section}</b>
            </motion.span>
          </div>
          <div className="mt-2 text-xs text-slate-300">За период в целом — {b.period.section} ({b.period.lost_units} ед. потерь).</div>
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted">{b.method}</p>
    </Card>
  );
}

export default function AiRisk() {
  const loc = useLocation();
  const focus = (loc.state as { focus?: string } | null)?.focus;
  const expand = new URLSearchParams(loc.search).get("open"); // ?open=painting — раскрыть карточку (режим презентации)
  const risk = useApi(api.risk, []);
  const advice = useApi(() => api.advice(), []);
  const [done, setDone] = useState(false);
  const onDone = useCallback(() => setDone(true), []);
  if (!risk.data) return <Loading error={risk.error} />;
  const recFor = (r: Risk): Recommendation => advice.data?.items.find((i) => i.section_id === r.section_id) ?? r.recommendation;

  return (
    <>
      <PageTitle title="AI Risk · Bottleneck Detector" subtitle="Прогноз рисков простоя и отклонений, поиск узкого места, рекомендации до следующей смены" />
      <div className="mb-4" data-tour="ai-pipeline"><AiPipeline risk={risk.data} advice={advice.data} onDone={onDone} /></div>
      {done && (
      <motion.div initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12 } } }}>
      <motion.div variants={reveal} className="mb-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div data-tour="bottleneck"><Bottleneck b={risk.data.bottleneck} /></div>
        <Card title="Как работает модель">
          <p className="text-sm text-slate-300">{risk.data.model.type}.</p>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {Object.entries(risk.data.model.weights).map(([k, v]) => (
              <li key={k} className="flex justify-between text-slate-300"><span>{FACTOR_LABEL[k]}</span><span className="num text-muted">до {v}</span></li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-muted">{risk.data.model.limitations} Тексты рекомендаций формулирует LLM (Claude) строго по рассчитанным факторам; без сети — шаблоны правил.</p>
        </Card>
      </motion.div>
      <div className="space-y-4">
        {risk.data.risks.map((r, k) => (
          <motion.div key={r.section_id} variants={reveal} data-tour={k === 0 ? "ai-advice" : undefined}>
            <RiskCard key={expand === r.section_id ? "open" : "closed"} risk={r} rec={recFor(r)} focused={focus === r.section_id} expanded={expand === r.section_id} />
          </motion.div>
        ))}
      </div>
      </motion.div>
      )}
    </>
  );
}
