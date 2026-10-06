import type { EChartsOption } from "echarts";
import { api, useApi } from "../api/client";
import { baseOption, Chart, DATE_COLORS } from "../components/Chart";
import { CalcTag, Card, Loading, PageTitle, StatusBadge } from "../components/ui";
import { useApp } from "../lib/context";
import { fmt, fmtDate, fmtDateShort, fmtPct, STATUS_HEX } from "../lib/format";

function declineNote(byDate: { date: string; lines: { line: string; fact: number; plan: number }[] }[]): string {
  if (byDate.length < 2) return "";
  const [a, b] = [byDate[0], byDate[byDate.length - 1]];
  const down = b.lines.filter((l) => l.fact < (a.lines.find((x) => x.line === l.line)?.fact ?? 0));
  if (!down.length) return "Снижения выпуска между датами нет.";
  return "Снижение выпуска: " + down.map((l) => `${l.line} ${a.lines.find((x) => x.line === l.line)!.fact} → ${l.fact} при плане ${l.plan}`).join("; ") + ".";
}

export default function Production() {
  const { date } = useApp();
  const { data, error } = useApi(() => api.production(date), [date]);
  if (!data) return <Loading error={error} />;

  const lines = data.lines;
  const option: EChartsOption = {
    ...baseOption(),
    tooltip: { ...(baseOption().tooltip as object), valueFormatter: (v) => `${Number(v) > 0 ? "+" : ""}${v} авто` },
    xAxis: { ...(baseOption().xAxis as object), type: "category", data: data.by_date[0].lines.map((l) => l.line),
      axisLine: { onZero: true, lineStyle: { color: "#475569" } }, axisLabel: { color: "#8696a8", fontSize: 11, margin: 40 } },
    yAxis: { ...(baseOption().yAxis as object), type: "value", min: -12, max: 4, interval: 4 },
    series: data.by_date.map((d, i) => ({
      name: fmtDateShort(d.date),
      type: "bar",
      barMaxWidth: 36,
      barGap: "8%",
      itemStyle: { color: DATE_COLORS[i], borderRadius: 4 },
      label: { show: true, color: "#cbd5e1", fontSize: 11, formatter: (p: { value: unknown }) => `${Number(p.value) > 0 ? "+" : ""}${p.value}` },
      data: d.lines.map((l) => ({ value: l.fact - l.plan, label: { position: l.fact - l.plan >= 0 ? "top" : "bottom" } })),
    })),
  };

  return (
    <>
      <PageTitle title="Производство" subtitle={`План и факт по линиям — ${date ? fmtDate(date) : "период 01–02.10.2026"}`} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card title="План / факт по линиям" extra={<span className="flex items-center gap-2 text-xs text-muted">OEE <CalcTag /></span>}>
          <div className="overflow-x-auto">
            <table className="num w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3">Участок</th><th className="pr-3 text-right">План</th><th className="pr-3 text-right">Факт</th>
                  <th className="pr-3 text-right">Выполнение</th><th className="pr-3 text-right">Время</th><th className="pr-3 text-right">Загрузка</th>
                  <th className="pr-3 text-right" title="Доступность × Производительность × Качество">OEE</th><th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.line} className="border-b border-line/60">
                    <td className="py-2.5 pr-3 font-medium">{l.line}</td>
                    <td className="pr-3 text-right">{l.plan}</td>
                    <td className="pr-3 text-right">{l.fact}</td>
                    <td className="pr-3 text-right" style={{ color: STATUS_HEX[l.statuses.plan_completion] }}>{fmt(l.plan_completion_pct)}%</td>
                    <td className="pr-3 text-right">{fmt(l.hours)} ч</td>
                    <td className="pr-3 text-right">{fmt(l.load_pct, 0)}%</td>
                    <td className="pr-3 text-right" style={{ color: STATUS_HEX[l.statuses.oee] }} title={`A ${fmt(l.availability_pct)}% × P ${fmt(l.performance_pct)}% × Q ${fmt(l.quality_pct)}%`}>{fmtPct(l.oee_pct)}%</td>
                    <td><StatusBadge status={l.statuses.plan_completion} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-muted">Разложение OEE</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            {lines.map((l) => (
              <div key={l.line} className="rounded-lg bg-panel2 p-3 text-xs">
                <div className="mb-2 flex justify-between font-medium"><span>{l.line}</span><span style={{ color: STATUS_HEX[l.statuses.oee] }}>{fmtPct(l.oee_pct)}%</span></div>
                {([["Доступность", l.availability_pct], ["Производительность", l.performance_pct], ["Качество", l.quality_pct]] as const).map(([k, v]) => (
                  <div key={k} className="mb-1.5">
                    <div className="flex justify-between text-muted"><span>{k}</span><span className="num text-slate-200">{fmt(v)}%</span></div>
                    <div className="mt-0.5 h-1.5 rounded-full bg-bg"><div className="h-1.5 rounded-full bg-[#3987e5]" style={{ width: `${Math.max(0, (v - 80) * 5)}%` }} /></div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted">Шкала полос — от 80% до 100%. Статус в таблице — по выполнению плана (≥98% норма, 95–98% внимание, &lt;95% критично).</p>
        </Card>
        <Card title="Отклонение факта от плана, авто/смену">
          <Chart option={option} height={320} />
          <p className="mt-2 text-xs text-muted">{declineNote(data.by_date)}</p>
        </Card>
      </div>
    </>
  );
}
