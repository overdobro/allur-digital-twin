import { useState } from "react";
import { Link } from "react-router-dom";
import { api, useApi } from "../api/client";
import { CalcTag, Card, Dot, Loading, PageTitle, StatusBadge } from "../components/ui";
import { fmt, fmtDateShort, fmtInt, fmtPct, STATUS_HEX } from "../lib/format";

/** 9.2 Производственный план: модели, смена / день / месяц, план-факт, прогноз, зоны риска. */

type Horizon = "shift" | "day" | "month";
const H_LABEL: Record<Horizon, string> = { shift: "Смена", day: "День", month: "Месяц" };

export default function Plan() {
  const p = useApi(api.plan, []);
  const [h, setH] = useState<Horizon>("month");
  if (!p.data) return <Loading error={p.error} />;
  const d = p.data;
  const plan = (m: (typeof d.models)[number]) => (h === "shift" ? m.shift_plan : h === "day" ? m.day_plan : m.month_plan);
  const fact = (m: (typeof d.models)[number]) => (h === "shift" ? m.fact_last_shift : h === "day" ? m.fact_last_shift * d.shifts_per_day : m.forecast_month);
  const tiles: [string, string, string, string][] = [
    ["Цель кейса, авто/мес", fmtInt(d.target_month), "норматив", "#e2e8f0"],
    ["План по моделям, авто/мес", fmtInt(d.models_month_total), `${d.models_month_total < d.target_month ? "ниже цели на " + fmtInt(d.target_month - d.models_month_total) : ""}`, "#e2e8f0"],
    ["Прогноз месяца", fmtInt(d.forecast_month), d.forecast_formula, d.gap_target < 0 ? STATUS_HEX.critical : STATUS_HEX.ok],
    ["Факт за период", `${d.fact_period} / ${d.plan_period}`, `${d.shifts_in_data} смены в данных · ${fmtPct(d.completion_period_pct)}%`, "#e2e8f0"],
  ];
  return (
    <>
      <PageTitle title="Производственный план" subtitle="План по моделям, план-факт и прогноз выполнения; зоны риска невыполнения" />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([k, v, sub, c]) => (
          <div key={k} className="rounded-xl border border-line bg-panel p-4">
            <div className="text-xs text-muted">{k}</div>
            <div className="num mt-1 text-3xl font-semibold" style={{ color: c }}>{v}</div>
            <div className="mt-1 text-[11px] text-muted">{sub}</div>
          </div>
        ))}
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" data-tour="plan">
        <Card title={<span className="flex items-center gap-2">План по моделям <CalcTag title="Факт по моделям — расчётный (A9)" /></span>}
          extra={
            <div className="inline-flex rounded-lg border border-line bg-bg p-0.5">
              {(["shift", "day", "month"] as Horizon[]).map((x) => (
                <button key={x} onClick={() => setH(x)} className={`rounded-md px-2.5 py-1 text-xs ${h === x ? "bg-panel2 text-white" : "text-muted"}`}>{H_LABEL[x]}</button>
              ))}
            </div>
          }>
          <table className="num w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-line">
                <th className="py-2">Модель</th><th className="text-right">Доля</th><th className="text-right">План</th>
                <th className="text-right">{h === "month" ? "Прогноз" : "Факт (расч.)"}</th><th className="text-right">Откл.</th><th className="pr-2 text-right">%</th><th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {d.models.map((m) => {
                const pl = plan(m), f = fact(m), dev = f - pl, pct = (f / pl) * 100;
                const st = pct >= 100 ? "ok" : pct >= 95 ? "warning" : "critical";
                return (
                  <tr key={m.model} className="border-b border-line/60">
                    <td className="py-2.5 font-medium">{m.model}</td>
                    <td className="text-right text-muted">{fmtPct(m.share_pct)}%</td>
                    <td className="text-right">{fmt(pl)}</td>
                    <td className="text-right">{fmt(f)}</td>
                    <td className={`text-right ${dev < 0 ? "text-crit" : "text-ok"}`}>{dev > 0 ? "+" : ""}{fmt(dev)}</td>
                    <td className="pr-2 text-right">{fmtPct(pct)}%</td>
                    <td><StatusBadge status={st} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-muted">
            {h === "month" ? "Месяц: прогноз по текущему темпу Сборки × доля модели в плане." : "Смена/день: факт последней смены Сборки × доля модели в плане."} {d.note}
          </p>
          <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-muted">План-факт по сменам (Сборка, из данных)</h3>
          <div className="grid grid-cols-2 gap-2">
            {d.by_date.map((x) => (
              <div key={x.date} className="rounded-lg bg-panel2 p-3 text-sm">
                <div className="text-xs text-muted">{fmtDateShort(x.date)}</div>
                <div className="num mt-1"><b className="text-lg">{x.fact}</b> / {x.plan} · <span className={x.deviation < 0 ? "text-crit" : "text-ok"}>{x.deviation > 0 ? "+" : ""}{x.deviation}</span> · {fmtPct(x.completion_pct)}%</div>
              </div>
            ))}
          </div>
        </Card>
        <div className="space-y-4">
          <Card title="Вывод">
            <ul className="space-y-2 text-sm text-slate-200">
              <li>• План по моделям ({fmtInt(d.models_month_total)}) выполним при текущем темпе: прогноз {fmtInt(d.forecast_month)} (+{fmtInt(d.gap_models)}).</li>
              <li className="text-crit">• Цель {fmtInt(d.target_month)} — нет: не хватает {fmtInt(-d.gap_target)} авто; нужно ≈{fmt(d.required_per_shift)} авто/смену вместо {d.shift_plan}.</li>
              <li>• Сумма плана по моделям ниже цели кейса на {fmtInt(d.target_month - d.models_month_total)} — расхождение исходных данных.</li>
            </ul>
          </Card>
          <Card title="Зоны риска невыполнения плана">
            <ul className="space-y-2">
              {d.risks.map((r) => (
                <li key={r.section_id} className="rounded-lg border border-line bg-panel2 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-semibold"><Dot status={r.stage === "realized" ? "critical" : "warning"} pulse />{r.section}
                      {r.bottleneck && <span className="rounded bg-warn/15 px-1.5 py-px text-[10px] font-semibold text-warn">узкое место</span>}</span>
                    <span className="num text-xs text-muted">{r.fact}/{r.plan} · {fmtPct(r.plan_completion_pct)}%</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-300">{r.why}</p>
                  <div className="mt-2 flex gap-3 text-xs">
                    <Link to={`/?section=${r.section_id}`} className="text-muted underline decoration-dotted hover:text-white">Открыть участок</Link>
                    <Link to={`/editor?section=${r.section_id}`} className="text-brand underline decoration-dotted hover:brightness-125">Проверить изменение на 3D</Link>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
