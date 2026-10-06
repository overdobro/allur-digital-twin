import type { EChartsOption } from "echarts";
import { api, useApi } from "../api/client";
import { baseOption, Chart, MUTED_MARK, NORM_COLOR, SERIES_BLUE } from "../components/Chart";
import { Card, Loading, PageTitle, StatusBadge } from "../components/ui";
import { useApp } from "../lib/context";
import { fmt, fmtDate, fmtDateShort } from "../lib/format";

export default function Downtime() {
  const { date } = useApp();
  const { data, error } = useApi(() => api.downtime(date), [date]);
  const meta = useApp().meta;
  if (!data) return <Loading error={error} />;
  const limit = meta?.targets.critical_downtime_max_min_per_day ?? 60;
  const ev = [...data.events].sort((a, b) => a.minutes - b.minutes);
  const longest = data.longest;

  const option: EChartsOption = {
    ...baseOption(),
    legend: { show: false },
    grid: { left: 24, right: 56, top: 36, bottom: 8, containLabel: true },
    tooltip: { ...(baseOption().tooltip as object), valueFormatter: (v) => `${v} мин` },
    yAxis: { type: "category", data: ev.map((e) => `${e.equipment} · ${fmtDateShort(e.date)}`), axisLine: { lineStyle: { color: "#243244" } }, axisTick: { show: false }, axisLabel: { color: "#cbd5e1", fontSize: 12 } },
    xAxis: { type: "value", max: 70, axisLabel: { color: "#8696a8", formatter: "{value} мин" }, splitLine: { lineStyle: { color: "#1c2735" } } },
    series: [{
      type: "bar", name: "Простой", barMaxWidth: 22,
      data: ev.map((e) => ({ value: e.minutes, itemStyle: { color: e.planned ? MUTED_MARK : SERIES_BLUE, borderRadius: [0, 4, 4, 0] } })),
      label: { show: true, position: "right", color: "#cbd5e1", formatter: (p) => `${p.value} мин${ev[p.dataIndex].planned ? " (ТО)" : ""}` },
      markLine: {
        symbol: "none", silent: true, lineStyle: { color: NORM_COLOR, type: "dashed", width: 1.5 },
        label: { formatter: `Норма ${limit} мин`, color: NORM_COLOR, position: "end", rotate: 0 }, data: [{ xAxis: limit }],
      },
    }],
  };

  return (
    <>
      <PageTitle title="Простои и инциденты" subtitle={`Журнал простоев оборудования — ${date ? fmtDate(date) : "период"}`} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Всего простоев", `${data.total_min} мин`],
          ["Аварийные", `${data.unplanned_min} мин · ${data.incidents} шт.`],
          ["Плановое ТО", `${data.planned_min} мин`],
          ["Суммарно по заводу", Object.entries(data.factory_per_day_min).map(([d, m]) => `${fmtDateShort(d)}: ${m}`).join(" · ") + " мин"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line bg-panel p-4">
            <div className="text-xs text-muted">{k}</div>
            <div className="num mt-1 text-lg font-semibold">{v}</div>
          </div>
        ))}
      </div>
      {longest && (
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-warn/50 bg-warn/10 px-5 py-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-warn">Самый длительный простой</div>
            <div className="text-lg font-semibold">{longest.equipment} · {longest.section}</div>
          </div>
          <div className="num text-4xl font-bold text-warn">{longest.minutes} мин</div>
          <div className="text-sm text-slate-200">{longest.reason}, {fmtDate(longest.date)}<div className="text-muted">{fmt(longest.limit_usage_pct)}% от суточной нормы {limit} мин</div></div>
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Журнал">
          <table className="num w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-line"><th className="py-2">Дата</th><th>Участок</th><th>Оборудование</th><th>Причина</th><th className="pr-4 text-right">Простой</th><th>Статус</th></tr>
            </thead>
            <tbody>
              {data.events.map((e) => (
                <tr key={e.date + e.equipment} className={`border-b border-line/60 ${e === longest ? "bg-warn/10" : ""}`}>
                  <td className="py-2.5">{fmtDateShort(e.date)}</td>
                  <td>{e.section}</td>
                  <td className="font-medium">{e.equipment}</td>
                  <td>{e.reason}</td>
                  <td className="pr-4 text-right font-semibold">{e.minutes} мин</td>
                  <td>{e.planned ? <StatusBadge status="no_data" label="Плановое" /> : <StatusBadge status={e.status} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-muted">Норма 60 мин/сутки применяется к единице оборудования; плановое ТО не считается аварийным простоем (допущение A5).</p>
        </Card>
        <Card title="Длительность простоев">
          <Chart option={option} height={260} />
          <div className="mt-2 flex gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES_BLUE }} />Аварийный</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: MUTED_MARK }} />Плановое ТО</span>
          </div>
        </Card>
      </div>
    </>
  );
}
