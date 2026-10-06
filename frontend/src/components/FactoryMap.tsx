import { useNavigate } from "react-router-dom";
import type { FactoryNode, Status } from "../api/types";
import { fmtPct, STATUS_HEX, STATUS_LABEL } from "../lib/format";
import { Dot } from "./ui";

const ICONS: Record<string, string> = {
  warehouse_in: "M3 21V9l9-6 9 6v12M7 21v-6h10v6M7 12h10",
  welding: "M4 20l6-6M14 4l6 6-8 8-6-6zM16 14l2 2",
  painting: "M5 3h11v5H5zM10 8v3M8 11h4l-1 10H9z",
  assembly: "M3 17h18M5 17V9h4l2-3h4l2 3h2v8M7 20a1 1 0 100-2 1 1 0 000 2zM17 20a1 1 0 100-2 1 1 0 000 2z",
  qc: "M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  warehouse_out: "M3 21V9l9-6 9 6v12M8 21v-5h8v5M9 11l3 3 3-3",
};

function Connector({ from, to }: { from: Status; to: Status }) {
  const active = from !== "no_data" || to !== "no_data";
  return (
    <div className="relative hidden h-0.5 w-7 shrink-0 self-center xl:block">
      <div className="absolute inset-0 bg-line" />
      {active && <div className="flow-line absolute inset-0" />}
      <svg className="absolute -right-1 -top-[5px] h-3 w-3 text-line" viewBox="0 0 12 12"><path d="M2 1l7 5-7 5z" fill="currentColor" /></svg>
    </div>
  );
}

function NodeCard({ node, status, highlight }: { node: FactoryNode; status: Status; highlight: boolean }) {
  const nav = useNavigate();
  // В replay участок ещё «не дошёл» — цифры не раскрываем
  const m = status === "no_data" ? null : node.metrics;
  const color = STATUS_HEX[status];
  const clickable = node.line !== null;
  return (
    <button
      onClick={() => clickable && nav(`/sections/${node.id}`)}
      disabled={!clickable}
      className={`group relative flex w-full flex-col rounded-xl border bg-panel2 p-3 text-left transition xl:w-auto xl:min-w-0 xl:flex-1 ${
        clickable ? "cursor-pointer hover:-translate-y-0.5 hover:bg-[#1d2938]" : "cursor-default opacity-70"
      } ${highlight ? "ring-2 ring-offset-2 ring-offset-bg" : ""}`}
      style={{ borderColor: color + (status === "no_data" ? "55" : "aa"), boxShadow: status === "critical" ? `0 0 24px ${color}33` : undefined, ["--tw-ring-color" as string]: color }}
    >
      <div className="flex items-center justify-between">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d={ICONS[node.id]} />
        </svg>
        <Dot status={status} pulse />
      </div>
      <div className="mt-2 text-sm font-semibold leading-tight">{node.name}</div>
      <div className="text-[11px]" style={{ color }}>{STATUS_LABEL[status]}</div>
      {m ? (
        <dl className="num mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
          <dt className="text-muted">Факт/план</dt><dd className="text-right">{m.fact}/{m.plan}</dd>
          <dt className="text-muted">OEE</dt><dd className="text-right" style={{ color: STATUS_HEX[m.statuses.oee] }}>{fmtPct(m.oee_pct)}%</dd>
          <dt className="text-muted">Брак</dt><dd className="text-right" style={{ color: STATUS_HEX[m.statuses.defect] }}>{fmtPct(m.defect_pct)}%</dd>
        </dl>
      ) : (
        <div className="mt-2 text-[11px] text-muted">{node.metrics ? "Ожидание данных…" : "Данных в наборе нет"}</div>
      )}
      {node.equipment.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 border-t border-line pt-2">
          {node.equipment.map((e) => (
            <span key={e.name} className="inline-flex items-center gap-1 rounded bg-bg/60 px-1.5 py-0.5 text-[10px]" title={e.events.map((x) => `${x.reason}, ${x.minutes} мин`).join("; ") || "Без событий"}>
              <Dot status={e.status} size={6} />{e.name}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

export function FactoryMap({ nodes, override, highlight }: {
  nodes: FactoryNode[]; override?: Record<string, Status>; highlight?: string | null;
}) {
  const sorted = [...nodes].sort((a, b) => a.order - b.order);
  const st = (n: FactoryNode) => override?.[n.id] ?? n.status;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:flex xl:items-stretch xl:gap-0">
      {sorted.map((n, i) => (
        <div key={n.id} className="contents">
          <NodeCard node={n} status={st(n)} highlight={highlight === n.id} />
          {i < sorted.length - 1 && <Connector from={st(n)} to={st(sorted[i + 1])} />}
        </div>
      ))}
    </div>
  );
}
