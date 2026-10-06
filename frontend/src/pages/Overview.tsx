import { api, useApi } from "../api/client";
import type { Overview as OverviewData } from "../api/types";
import { AttentionPanel } from "../components/Attention";
import { FlowView, useViewMode, ViewToggle } from "../components/FlowView";
import { useSearchParams } from "react-router-dom";
import { SectionDrawer } from "../components/SectionDrawer";
import { KpiBar } from "../components/KpiBar";
import { EventFeed, ReplayControls, useReplay } from "../components/Replay";
import { Card, Loading, PageTitle } from "../components/ui";
import { useApp } from "../lib/context";
import { fmtDate } from "../lib/format";
import { STATUS_HEX, STATUS_LABEL } from "../lib/format";

export default function Overview() {
  const { date } = useApp();
  const [params, setParams] = useSearchParams();
  const selected = params.get("section");
  const view = useViewMode();
  const setSelected = (id: string | null) => setParams(id ? { section: id } : {}, { replace: true });
  const ov = useApi(() => api.overview(date), [date]);
  const risk = useApi(api.risk, []);
  const forecast = useApi(() => api.forecast(), []);
  const replay = useApi(api.replay, []);
  const r = useReplay(replay.data?.steps ?? null);
  const { meta } = useApp();
  const byDate = useApi(
    () => Promise.all((meta?.dates ?? []).map((d) => api.overview(d).then((o) => [d, o] as const))).then((x) => Object.fromEntries(x) as Record<string, OverviewData>),
    [meta],
  );
  const replayOv = r.step ? byDate.data?.[r.step.date] : undefined;
  // Тренд к первой дате — только когда показан последний день
  const shownDate = r.step?.date ?? date;
  const firstDate = meta?.dates[0];
  const prevKpi = shownDate && firstDate && shownDate !== firstDate ? byDate.data?.[firstDate]?.kpi ?? null : null;

  if (!ov.data) return <Loading error={ov.error} />;
  return (
    <>
      <PageTitle
        title="Обзор завода"
        subtitle={r.step ? `Воспроизведение смены ${fmtDate(r.step.date)} — KPI по итогам смены` : date ? `Состояние за ${fmtDate(date)}` : "Состояние за весь период (01–02.10.2026)"}
      />
      <div data-tour="kpi"><KpiBar kpi={replayOv?.kpi ?? ov.data.kpi} prev={prevKpi} forecast={forecast.data} /></div>
      <div className="mt-4 grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div data-tour="flow">
        <Card
          title="Производственный поток"
          extra={
            <div className="flex items-center gap-4">
            <div className="hidden gap-3 text-[11px] text-muted lg:flex">
              {(["ok", "warning", "critical", "no_data"] as const).map((s) => (
                <span key={s} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: STATUS_HEX[s] }} />{STATUS_LABEL[s]}</span>
              ))}
            </div>
            <ViewToggle mode={view.mode} setMode={view.setMode} />
            {replay.data && <ReplayControls r={r} total={replay.data.total} />}
            </div>
          }
        >
          <FlowView mode={view.mode} nodes={replayOv?.nodes ?? ov.data.nodes} override={r.step?.nodes} highlight={r.step?.section_id}
            onSelect={setSelected} focusId={selected}
            event={r.step && r.step.section_id ? { index: r.step.index, section_id: r.step.section_id, severity: r.step.severity, text: r.step.text.replace(/^[^:]+:\s*/, "") } : null}
            dateLabel={r.step ? fmtDate(r.step.date) : date ? fmtDate(date) : "за период"} />
          {replay.data && r.index >= 0 ? (
            <EventFeed steps={replay.data.steps} index={r.index} />
          ) : (
            null
          )}
        </Card>
        </div>
        {risk.data ? <AttentionPanel risk={risk.data} forecast={forecast.data} /> : <Loading error={risk.error} />}
      </div>
      <SectionDrawer id={selected} onClose={() => setSelected(null)} />
    </>
  );
}
