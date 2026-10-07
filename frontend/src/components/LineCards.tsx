import { Link } from "react-router-dom";
import { api, useApi } from "../api/client";
import type { LineMetrics } from "../api/types";
import { fmtDateShort, fmtPct, STATUS_HEX } from "../lib/format";
import { CalcTag, Dot, StatusBadge } from "./ui";

/** 9.3 Карточка производственной линии: план/факт, загрузка, время, простои, брак, статус, история, AI-риск. */
export function LineCards({ date, lines, byDate }: { date: string | null; lines: LineMetrics[]; byDate: { date: string; lines: LineMetrics[] }[] }) {
  const down = useApi(() => api.downtime(date), [date]);
  const risk = useApi(api.risk, []);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {lines.map((l) => {
        const ev = (down.data?.events ?? []).filter((e) => e.section_id === l.section_id);
        const unplanned = ev.filter((e) => !e.planned);
        const r = risk.data?.risks.find((x) => x.section_id === l.section_id);
        const hist = byDate.map((d) => ({ date: d.date, m: d.lines.find((x) => x.line === l.line)! }));
        return (
          <section key={l.line} className="rounded-xl border bg-panel" style={{ borderColor: STATUS_HEX[l.status] + "77" }}>
            <header className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <div className="text-base font-semibold">{l.line}</div>
                <div className="text-[11px] text-muted">участок «{l.section}»</div>
              </div>
              <StatusBadge status={l.status} />
            </header>
            <div className="grid grid-cols-3 gap-2 p-4 text-sm">
              {[
                ["План / факт", `${l.fact}/${l.plan}`, l.statuses.plan_completion],
                ["Выполнение", `${fmtPct(l.plan_completion_pct)}%`, l.statuses.plan_completion],
                ["Загрузка", `${fmtPct(l.load_pct)}%`, undefined],
                ["Время работы", `${fmtPct(l.hours)} ч`, undefined],
                ["Простои", `${ev.reduce((a, e) => a + e.minutes, 0)} мин`, unplanned.some((e) => e.status !== "ok") ? "warning" : undefined],
                ["Брак", `${l.defects} · ${fmtPct(l.defect_pct)}%`, l.statuses.defect],
              ].map(([k, v, st]) => (
                <div key={k as string} className="rounded-lg bg-panel2 p-2.5">
                  <div className="text-[10px] text-muted">{k}</div>
                  <div className="num mt-0.5 font-semibold" style={{ color: st && st !== "ok" ? STATUS_HEX[st as keyof typeof STATUS_HEX] : undefined }}>{v}</div>
                </div>
              ))}
            </div>
            {ev.length > 0 && (
              <ul className="mx-4 mb-3 space-y-1 text-xs text-slate-300">
                {ev.map((e) => <li key={e.date + e.equipment} className="flex items-center gap-2"><Dot status={e.planned ? "no_data" : e.status} size={7} />{fmtDateShort(e.date)} · {e.equipment} · {e.reason} · {e.minutes} мин</li>)}
              </ul>
            )}
            <div className="mx-4 mb-3">
              <div className="mb-1 flex items-center gap-2 text-[11px] text-muted">История <CalcTag title="OEE — расчётный" /></div>
              <table className="num w-full text-xs">
                <tbody>
                  {hist.map(({ date: d, m }) => (
                    <tr key={d} className="border-b border-line/50">
                      <td className="py-1 text-muted">{fmtDateShort(d)}</td><td>{m.fact}/{m.plan}</td>
                      <td style={{ color: STATUS_HEX[m.statuses.oee] }}>OEE {fmtPct(m.oee_pct)}%</td>
                      <td className="text-right" style={{ color: STATUS_HEX[m.statuses.defect] }}>брак {fmtPct(m.defect_pct)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {r && (
              <div className="mx-4 mb-3 rounded-lg border border-brand/30 bg-brand/5 p-2.5 text-xs">
                <div className="flex justify-between font-semibold"><span className="text-brand">AI-риск {r.stage === "realized" ? "· уже случилось" : "· назревает"}</span><span className="num">{fmtPct(r.risk_index)}</span></div>
                <p className="mt-1 text-slate-300">{r.factors[0]?.evidence}</p>
              </div>
            )}
            <footer className="flex gap-3 border-t border-line px-4 py-2.5 text-xs">
              <Link to={`/?section=${l.section_id}`} className="text-muted underline decoration-dotted hover:text-white">На 3D-модели</Link>
              <Link to={`/editor?section=${l.section_id}`} className="text-brand underline decoration-dotted hover:brightness-125">Проверить изменение</Link>
            </footer>
          </section>
        );
      })}
    </div>
  );
}
