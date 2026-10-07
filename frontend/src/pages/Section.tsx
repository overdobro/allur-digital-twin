import { Link, useParams } from "react-router-dom";
import { api, useApi } from "../api/client";
import type { LineMetrics, Status } from "../api/types";
import { KIND_LABEL, STAGE_LABEL } from "../components/Attention";
import { CalcTag, Card, Dot, Loading, PageTitle, StatusBadge } from "../components/ui";
import { useApp } from "../lib/context";
import { fmt, fmtDate, fmtDateShort, STATUS_HEX } from "../lib/format";

type Row = { key: keyof LineMetrics; label: string; unit: string; better: "up" | "down"; status?: keyof LineMetrics["statuses"]; calc?: boolean };

const ROWS: Row[] = [
  { key: "fact", label: "Факт (план 120)", unit: "", better: "up" },
  { key: "plan_completion_pct", label: "Выполнение плана", unit: "%", better: "up", status: "plan_completion" },
  { key: "hours", label: "Время работы", unit: " ч", better: "up" },
  { key: "load_pct", label: "Загрузка", unit: "%", better: "up" },
  { key: "oee_pct", label: "OEE", unit: "%", better: "up", status: "oee", calc: true },
  { key: "defects", label: "Брак, шт.", unit: "", better: "down" },
  { key: "defect_pct", label: "Брак, %", unit: "%", better: "down", status: "defect" },
];

export default function Section() {
  const { id = "" } = useParams();
  const { date } = useApp();
  const sec = useApi(() => api.section(id, date), [id, date]);
  const history = useApi(() => api.section(id, null), [id]);
  const risk = useApi(api.risk, []);
  if (!sec.data) return <Loading error={sec.error} />;
  const s = sec.data;
  if (!s.trend.length) {
    return <PageTitle title={s.name} subtitle="По этому участку в тестовых данных нет записей — статус «нет данных» (допущение A8)." />;
  }
  const r = risk.data?.risks.find((x) => x.section_id === id);
  const [a, b] = [s.trend[0], s.trend[s.trend.length - 1]];

  return (
    <>
      <div className="mb-2 text-xs text-muted"><Link to="/" className="hover:text-white">Завод</Link> / {s.name}</div>
      <PageTitle
        title={`${s.name} · ${s.line}`}
        subtitle={date ? `Состояние за ${fmtDate(date)}` : "Состояние за период"}
        extra={<StatusBadge status={s.status} />}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Динамика показателей" extra={<span className="text-xs text-muted">{fmtDateShort(a.date)} → {fmtDateShort(b.date)}</span>}>
          <table className="num w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-line"><th className="py-2">Показатель</th><th className="text-right">{fmtDateShort(a.date)}</th><th className="text-right">{fmtDateShort(b.date)}</th><th className="text-right">Изменение</th></tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const va = a[row.key] as number, vb = b[row.key] as number;
                const delta = vb - va;
                const worse = row.better === "up" ? delta < 0 : delta > 0;
                const st = (m: LineMetrics): Status | undefined => (row.status ? m.statuses[row.status] : undefined);
                return (
                  <tr key={row.key} className="border-b border-line/60">
                    <td className="py-2.5"><span className="flex items-center gap-2">{row.label}{row.calc && <CalcTag />}</span></td>
                    <td className="text-right" style={{ color: st(a) && STATUS_HEX[st(a)!] }}>{fmt(va)}{row.unit}</td>
                    <td className="text-right font-semibold" style={{ color: st(b) && STATUS_HEX[st(b)!] }}>{fmt(vb)}{row.unit}</td>
                    <td className={`text-right ${delta === 0 ? "text-muted" : worse ? "text-crit" : "text-ok"}`}>
                      {delta === 0 ? "—" : `${delta > 0 ? "▲ +" : "▼ "}${fmt(delta)}${row.unit === "%" ? " п.п." : row.unit}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <div className="flex flex-col gap-4">
          <Card title="Оборудование и инциденты" extra={<span className="text-xs text-muted">история за весь период</span>}>
            {s.equipment.length === 0 && <p className="text-sm text-muted">По оборудованию участка событий в данных нет.</p>}
            <ul className="space-y-2">
              {s.equipment.map((e) => ({ ...e, history: history.data?.equipment.find((h) => h.name === e.name)?.events ?? e.events })).map((e) => (
                <li key={e.name} className="rounded-lg border border-line bg-panel2 p-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-semibold"><Dot status={e.status} pulse />{e.name}</span>
                    <span className="text-xs text-muted">{e.events.length ? `${e.downtime_min} мин простоя ${date ? "за дату" : "за период"}` : "за выбранную дату событий нет"}</span>
                  </div>
                  {e.history.map((ev) => (
                    <div key={ev.date} className="mt-1.5 flex justify-between text-xs text-slate-300">
                      <span>{fmtDateShort(ev.date)} · {ev.reason}</span><span className="num">{ev.minutes} мин</span>
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          </Card>

          {r && (
            <Card title={<span className="flex items-center gap-2">AI Risk <span className="text-xs font-normal text-muted">{STAGE_LABEL[r.stage]} · {KIND_LABEL[r.kind]}</span></span>}
              extra={<Link to="/ai" className="text-xs text-muted hover:text-white">Все риски →</Link>}>
              <div className="flex items-baseline gap-3">
                <span className="num text-3xl font-semibold">{fmt(r.risk_index)}</span>
                <span className="text-sm text-muted">индекс риска · {r.level.label}</span>
              </div>
              <p className="mt-3 text-sm text-slate-200">{r.recommendation.risk}</p>
              <h4 className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted">Что сделать</h4>
              <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-slate-300">
                {r.recommendation.actions.map((x) => <li key={x}>{x}</li>)}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
