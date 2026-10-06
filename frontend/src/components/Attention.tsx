import { Link } from "react-router-dom";
import type { Forecast, RiskResponse, Status } from "../api/types";
import { fmtDateShort, fmtInt } from "../lib/format";
import { Card, Dot } from "./ui";

export const STAGE_LABEL = { realized: "Уже случилось", emerging: "Назревает" } as const;
export const KIND_LABEL = { quality: "Качество", throughput: "Пропускная способность", equipment: "Оборудование" } as const;

export const levelStatus = (code: "low" | "medium" | "high", stage: "realized" | "emerging"): Status =>
  stage === "realized" ? "critical" : code === "high" ? "warning" : code === "medium" ? "warning" : "ok";

export function AttentionPanel({ risk, forecast }: { risk: RiskResponse; forecast: Forecast | null }) {
  const b = risk.bottleneck;
  return (
    <Card
      title={<span className="flex items-center gap-2">Требует внимания <span className="rounded bg-brand/15 px-1.5 py-px text-[10px] font-semibold uppercase text-brand">AI Risk</span></span>}
      extra={<Link to="/ai" className="text-xs text-muted hover:text-white">Подробнее →</Link>}
    >
      <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-1">
        {risk.risks.map((r) => (
          <li key={r.section_id} className="min-w-0">
            <Link to="/ai" state={{ focus: r.section_id }} className="block rounded-lg border border-line bg-panel2 p-3 transition hover:border-slate-500">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Dot status={levelStatus(r.level.code, r.stage)} pulse />{r.section}
                </span>
                <span className="text-[11px] text-muted">{STAGE_LABEL[r.stage]} · риск {r.level.label.toLowerCase()}</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{r.factors[0]?.evidence}</p>
            </Link>
          </li>
        ))}
        {forecast && forecast.gap < 0 && (
          <li className="rounded-lg border border-line bg-panel2 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold"><Dot status="critical" />План месяца</div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
              Прогноз {fmtInt(forecast.forecast)} при цели {fmtInt(forecast.target)}. Даже при 100% сменного плана — {fmtInt(forecast.capacity_at_plan)}; нужно ≈{forecast.required_per_shift} авто/смену.
            </p>
          </li>
        )}
      </ul>
      <div className="mt-4 rounded-lg border border-dashed border-line p-3 text-xs leading-relaxed">
        <div className="mb-1 font-semibold text-slate-200">Bottleneck Detector</div>
        <span className="text-slate-300">
          Узкое место {fmtDateShort(b.current.date)} — <b className="text-warn">{b.current.section}</b> ({b.current.lost_units} ед. потерь)
          {b.shifted && b.previous && <>; {fmtDateShort(b.previous.date)} — {b.previous.section}. Узкое место смещается вверх по потоку.</>}
        </span>
      </div>
    </Card>
  );
}
