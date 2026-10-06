import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, useApi } from "../api/client";
import type { Forecast, LineMetrics } from "../api/types";
import { CalcTag, Card, Dot, Loading, PageTitle } from "../components/ui";
import { fmt, fmtDateShort, fmtInt } from "../lib/format";
import { AdviceSource } from "./AiRisk";

function PlanBar({ f }: { f: Forecast }) {
  const max = Math.max(f.target, f.forecast, f.models_plan_total) * 1.05;
  const rows = [
    { label: "Цель кейса", v: f.target, color: "#e2e8f0", note: "≥ 5 500 авто/мес" },
    { label: "Прогноз по текущему темпу", v: f.forecast, color: "#3987e5", note: f.forecast_formula },
    { label: "Потолок при 100% сменного плана", v: f.capacity_at_plan, color: "#2f6fcc", note: f.capacity_formula },
    { label: "Сумма плана по моделям", v: f.models_plan_total, color: "#64748b", note: f.models_plan.map((m) => `${m.model.replace("Chevrolet ", "")} ${fmtInt(m.plan)}`).join(" + ") },
  ];
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex justify-between text-sm"><span className="text-slate-300">{r.label}</span><span className="num font-semibold">{fmtInt(r.v)}</span></div>
          <div className="relative mt-1 h-2.5 rounded-full bg-bg">
            <div className="h-2.5 rounded-full" style={{ width: `${(r.v / max) * 100}%`, background: r.color }} />
            <div className="absolute -top-1 h-4.5 w-px bg-crit" style={{ left: `${(f.target / max) * 100}%`, height: 18 }} />
          </div>
          <div className="mt-0.5 text-[11px] text-muted">{r.note}</div>
        </div>
      ))}
      <p className="rounded-lg bg-crit/10 px-3 py-2 text-sm text-slate-200">
        Цель 5 500 недостижима даже при идеальном выполнении сменного плана: нужно <b>≈{fmt(f.required_per_shift)} авто/смену</b> вместо 120
        (или дополнительные смены). План по моделям расходится с целью на {fmtInt(Math.abs(f.models_gap))} авто.
      </p>
    </div>
  );
}

function EffectCalc({ defaultDays }: { defaultDays: number }) {
  const [days, setDays] = useState(defaultDays);
  const [defect, setDefect] = useState(2);
  const [cut, setCut] = useState(50);
  const [margin, setMargin] = useState("");
  const m = Number(margin.replace(/\s/g, "")) || null;
  const e = useApi(() => api.effect({ working_days: days, defect_target_pct: defect, downtime_cut_pct: cut, margin_per_car: m }), [days, defect, cut, m]);
  const input = "w-full rounded-md border border-line bg-bg px-2 py-1.5 text-sm num focus:border-slate-400 focus:outline-none";
  return (
    <Card title={<span className="flex items-center gap-2">Оценка бизнес-эффекта <CalcTag /></span>}>
      <div className="grid grid-cols-2 items-end gap-3 md:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-muted">Рабочих дней<input type="number" min={1} max={31} value={days} onChange={(x) => setDays(Number(x.target.value) || 1)} className={input} /></label>
        <label className="flex flex-col gap-1 text-xs text-muted">Цель брака Окраски, %<input type="number" min={0} max={5} step={0.5} value={defect} onChange={(x) => setDefect(Number(x.target.value))} className={input} /></label>
        <label className="flex flex-col gap-1 text-xs text-muted">Снижение простоев, %<input type="number" min={0} max={100} step={10} value={cut} onChange={(x) => setCut(Number(x.target.value))} className={input} /></label>
        <label className="flex flex-col gap-1 text-xs text-muted">Маржа на авто, ₸ (опц.)<input inputMode="numeric" placeholder="не задана" value={margin} onChange={(x) => setMargin(x.target.value)} className={input} /></label>
      </div>
      {e.data && (
        <ul className="mt-4 space-y-3">
          {e.data.scenarios.map((s) => (
            <li key={s.id} className="rounded-lg border border-line bg-panel2 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm text-slate-200">{s.title}</span>
                <span className={`num text-xl font-semibold ${s.negative ? "text-crit" : "text-ok"}`}>
                  {s.units > 0 ? "+" : ""}{fmtInt(s.units)} <span className="text-xs font-normal text-muted">{s.unit_label}</span>
                </span>
              </div>
              {s.money !== null && <div className={`num mt-1 text-right text-sm ${s.negative ? "text-crit" : "text-ok"}`}>{s.money > 0 ? "+" : ""}{fmtInt(s.money)} ₸/мес</div>}
              <div className="mt-1 text-[11px] text-muted">{s.formula}</div>
            </li>
          ))}
        </ul>
      )}
      {e.data && <p className="mt-3 text-[11px] text-muted">{e.data.note}</p>}
    </Card>
  );
}

export default function Executive() {
  const meta = useApi(api.meta, []);
  const risk = useApi(api.risk, []);
  const forecast = useApi(() => api.forecast(), []);
  const prod = useApi(() => api.production(null), []);
  const [params] = useSearchParams();
  const [open, setOpen] = useState(params.get("ai") === "1");
  useEffect(() => { if (params.get("ai") === "1") setOpen(true); }, [params]);
  const advice = useApi(() => (open ? api.advice() : Promise.resolve(null)), [open]);

  if (!risk.data || !forecast.data || !prod.data) return <Loading error={risk.error ?? forecast.error ?? prod.error} />;
  const last = prod.data.by_date[prod.data.by_date.length - 1];
  const realized = risk.data.risks.filter((r) => r.stage === "realized");
  const emerging = risk.data.risks.filter((r) => r.stage === "emerging");
  const good = last.lines.filter((l: LineMetrics) => Object.values(l.statuses).every((s) => s === "ok"));

  const lines = [
    ...realized.map((r) => ({ status: "critical" as const, label: "Требует внимания", section: r.section, text: r.factors[0].evidence })),
    ...emerging.map((r) => {
      // Риск оборудования называем по оборудованию, чтобы не спорить со статусом линии участка
      const eq = r.kind === "equipment" ? r.downtime_events.filter((e) => !e.planned).sort((a, b) => b.minutes - a.minutes)[0] : undefined;
      return eq
        ? { status: "warning" as const, label: "Риск", section: `${eq.equipment} (${r.section})`, text: `${eq.reason.toLowerCase()}, простой ${eq.minutes} мин (${fmtDateShort(eq.date)}) — ${Math.round(eq.minutes / 60 * 100)}% суточной нормы` }
        : { status: "warning" as const, label: "Риск", section: r.section, text: r.factors[0].evidence };
    }),
    ...good.map((l) => ({ status: "ok" as const, label: "Хорошо", section: l.section,
      text: `факт ${l.fact}, загрузка ${fmt(l.load_pct, 0)}%, брак ${fmt(l.defect_pct)}% (${fmtDateShort(last.date)})` })),
  ];

  return (
    <>
      <PageTitle title="Экран руководителя" subtitle={`Приоритеты на следующую смену — по данным на ${fmtDateShort(last.date)}`} />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div data-tour="exec-priorities"><Card>
            <ul className="divide-y divide-line">
              {lines.map((l) => (
                <li key={l.label + l.section} className="flex items-start gap-4 py-3.5 first:pt-0 last:pb-0">
                  <span className="mt-1.5"><Dot status={l.status} pulse size={14} /></span>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted">{l.label}</div>
                    <div className="text-lg"><b>{l.section}</b> — <span className="text-slate-300">{l.text}</span></div>
                  </div>
                </li>
              ))}
            </ul>
            <button onClick={() => setOpen(!open)}
              className="mt-5 w-full rounded-lg bg-brand px-4 py-3 text-sm font-semibold uppercase tracking-wider text-white shadow-lg shadow-brand/20 transition hover:brightness-110">
              {open ? "Скрыть AI рекомендации" : "AI рекомендации"}
            </button>
            {open && (
              <div className="mt-4 rounded-lg border border-line bg-panel2 p-4">
                {!advice.data ? <Loading error={advice.error} /> : (
                  <>
                    <div className="mb-2"><AdviceSource advice={advice.data} /></div>
                    <p className="text-sm leading-relaxed text-slate-100">{advice.data.summary}</p>
                    <ul className="mt-3 space-y-2">
                      {advice.data.items.map((i) => {
                        const r = risk.data!.risks.find((x) => x.section_id === i.section_id);
                        return (
                          <li key={i.section_id} className="flex gap-3 text-sm">
                            <span className="w-20 shrink-0 font-semibold">{r?.section}</span>
                            <span className="text-slate-200">→ {i.actions[0]}{i.actions.length > 1 && <span className="text-muted"> (+{i.actions.length - 1})</span>}</span>
                          </li>
                        );
                      })}
                    </ul>
                    <Link to="/ai" className="mt-3 inline-block text-xs text-muted hover:text-white">Все действия, факторы и обоснование →</Link>
                  </>
                )}
              </div>
            )}
          </Card></div>
          <Card title={<span className="flex items-center gap-2">План месяца <CalcTag /></span>}>
            <PlanBar f={forecast.data} />
          </Card>
        </div>
        <div data-tour="exec-effect"><EffectCalc defaultDays={forecast.data.working_days} /></div>
      </div>
      {meta.data && <p className="mt-4 text-[11px] text-muted">Расчёты — на тестовых данных кейса за 2 дня; допущения: <Link to="/assumptions" className="underline">A1–A8</Link>.</p>}
    </>
  );
}
