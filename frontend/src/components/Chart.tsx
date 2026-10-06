import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";

/** Палитра проверена валидатором (dark, surface #121a24): одна шкала синего для дат — ordinal, ALL PASS. */
export const DATE_COLORS = ["#2f6fcc", "#7aa6e8"];
export const SERIES_BLUE = "#3987e5";
export const MUTED_MARK = "#64748b";
export const NORM_COLOR = "#ef4444";

const AXIS = { color: "#8696a8", fontSize: 11 };

export const baseOption = (): EChartsOption => ({
  backgroundColor: "transparent",
  textStyle: { fontFamily: "Inter, system-ui, sans-serif", color: "#cbd5e1" },
  grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
  legend: { top: 0, left: 0, textStyle: { color: "#cbd5e1", fontSize: 12 }, itemWidth: 12, itemHeight: 12, icon: "roundRect" },
  tooltip: {
    trigger: "axis",
    axisPointer: { type: "shadow", shadowStyle: { color: "rgba(148,163,184,0.08)" } },
    backgroundColor: "#0b1017", borderColor: "#243244", textStyle: { color: "#e2e8f0", fontSize: 12 },
  },
  xAxis: { axisLine: { lineStyle: { color: "#243244" } }, axisTick: { show: false }, axisLabel: AXIS, splitLine: { show: false } },
  yAxis: { axisLine: { show: false }, axisLabel: AXIS, splitLine: { lineStyle: { color: "#1c2735" } } },
});

export function Chart({ option, height = 280 }: { option: EChartsOption; height?: number }) {
  return <ReactECharts option={option} style={{ height }} notMerge opts={{ renderer: "svg" }} />;
}
