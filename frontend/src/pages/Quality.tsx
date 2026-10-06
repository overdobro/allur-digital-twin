import type { EChartsOption } from "echarts";
import { api, useApi } from "../api/client";
import { baseOption, Chart, DATE_COLORS, NORM_COLOR } from "../components/Chart";
import { Card, Loading, PageTitle, StatusBadge } from "../components/ui";
import { useApp } from "../lib/context";
import { fmt, fmtDate, fmtDateShort, STATUS_HEX } from "../lib/format";

const QUALITY_LABEL = { ok: "Норма", warning: "Выше нормы", critical: "Критично", no_data: "—" } as const;

export default function Quality() {
  const { date } = useApp();
  const all = useApi(() => api.quality(null), []);
  if (!all.data) return <Loading error={all.error} />;
  const { rows, norm_pct } = all.data;
  const shown = date ? rows.filter((r) => r.date === date) : rows;
  const dates = [...new Set(rows.map((r) => r.date))];
  const sections = [...new Set(rows.map((r) => r.section))];
  const worst = shown.reduce((a, b) => (b.defect_pct > a.defect_pct ? b : a), shown[0]);

  const option: EChartsOption = {
    ...baseOption(),
    tooltip: { ...(baseOption().tooltip as object), valueFormatter: (v) => `${fmt(Number(v))}%` },
    xAxis: { ...(baseOption().xAxis as object), type: "category", data: sections },
    yAxis: { ...(baseOption().yAxis as object), type: "value", max: 6, axisLabel: { color: "#8696a8", formatter: "{value}%" } },
    series: dates.map((d, i) => ({
      name: fmtDateShort(d),
      type: "bar",
      barMaxWidth: 40,
      barGap: "8%",
      itemStyle: { color: DATE_COLORS[i], borderRadius: [4, 4, 0, 0] },
      label: { show: true, position: "top", color: "#cbd5e1", fontSize: 11, formatter: (p) => `${fmt(Number(p.value))}%` },
      data: sections.map((s) => rows.find((r) => r.date === d && r.section === s)!.defect_pct),
      markLine: i === 0 ? {
        symbol: "none", silent: true,
        lineStyle: { color: NORM_COLOR, type: "dashed", width: 1.5 },
        label: { show: false },
        data: [{ yAxis: norm_pct }],
      } : undefined,
    })),
  };

  return (
    <>
      <PageTitle title="Качество" subtitle={`Доля брака по участкам и норматив ≤ ${norm_pct}% — ${date ? fmtDate(date) : "период"}`} />
      {worst && worst.status !== "ok" && (
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-crit/50 bg-crit/10 px-5 py-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-crit">Критичная зона</div>
            <div className="text-lg font-semibold">{worst.section} · {fmtDate(worst.date)}</div>
          </div>
          <div className="num text-4xl font-bold text-crit">{fmt(worst.defect_pct)}%</div>
          <div className="text-sm leading-relaxed text-slate-200">
            <div>Норма ≤ {norm_pct}%</div>
            <div className="font-semibold text-crit">Превышение в {fmt(worst.norm_ratio)} раза</div>
          </div>
          <div className="text-sm text-muted">{worst.defects} брак. из {worst.produced} выпущенных</div>
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Брак по участкам">
          <table className="num w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-line"><th className="py-2">Дата</th><th>Участок</th><th className="text-right">Выпущено</th><th className="text-right">Брак</th><th className="pr-4 text-right">% брака</th><th>Оценка</th></tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.date + r.section} className={`border-b border-line/60 ${r === worst && r.status === "critical" ? "bg-crit/10" : ""}`}>
                  <td className="py-2.5">{fmtDateShort(r.date)}</td>
                  <td className="font-medium">{r.section}</td>
                  <td className="text-right">{r.produced}</td>
                  <td className="text-right">{r.defects}</td>
                  <td className="pr-4 text-right font-semibold" style={{ color: STATUS_HEX[r.status] }}>
                    {fmt(r.defect_pct)}%
                    {r.norm_ratio > 1 && <div className="text-[10px] font-normal text-muted">×{fmt(r.norm_ratio)} к норме</div>}
                  </td>
                  <td><StatusBadge status={r.status} label={QUALITY_LABEL[r.status]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Динамика брака, %">
          <Chart option={option} height={300} />
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: NORM_COLOR }} />
            <span style={{ color: NORM_COLOR }}>Норма ≤ {norm_pct}%</span>
            <span>· пороги: ≤2% — норма, 2–3% — выше нормы, &gt;3% — критично</span>
          </p>
        </Card>
      </div>
    </>
  );
}
