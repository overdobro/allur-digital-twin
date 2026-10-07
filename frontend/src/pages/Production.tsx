import type { EChartsOption } from "echarts";
import { api, useApi } from "../api/client";
import { baseOption, Chart, DATE_COLORS } from "../components/Chart";
import { LineCards } from "../components/LineCards";
import { Card, Loading, PageTitle } from "../components/ui";
import { useApp } from "../lib/context";
import { fmtDate, fmtDateShort } from "../lib/format";

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
      <PageTitle title="Производственные линии" subtitle={`Карточки линий — ${date ? fmtDate(date) : "период 01–02.10.2026"}`} />
      <LineCards date={date} lines={lines} byDate={data.by_date} />
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)]">
        <Card title="Отклонение факта от плана, авто/смену">
          <Chart option={option} height={320} />
          <p className="mt-2 text-xs text-muted">{declineNote(data.by_date)}</p>
        </Card>
      </div>
    </>
  );
}
