import { useState } from "react";
import { STATIC, useApi } from "../api/client";
import { SECTION_NAME } from "../lib/auth";
import { dateTimeKz, INCIDENT_STATUS, peopleApi, type Incident } from "../lib/people";
import { Card, Dot } from "./ui";

/** Лента сообщений сотрудников для руководителя: принять в работу / закрыть. */
export function StaffIncidents() {
  const list = useApi(() => (STATIC ? Promise.resolve([] as Incident[]) : peopleApi.incidents()), []);
  const [items, setItems] = useState<Incident[] | null>(null);
  const all = items ?? list.data;
  if (STATIC || !all) return null;
  const set = async (i: Incident, status: Incident["status"]) => {
    const upd = await peopleApi.setIncident(i.id, status);
    setItems(all.map((x) => (x.id === i.id ? { ...x, ...upd } : x)));
  };
  const open = all.filter((i) => i.status !== "closed");
  return (
    <Card title={<span className="flex items-center gap-2">Сообщения с участков {open.length > 0 && <span className="rounded-full bg-crit px-2 py-px text-[11px] text-white">{open.length}</span>}</span>}
      extra={<span className="text-xs text-muted">от сотрудников, в реальном времени</span>}>
      {!all.length && <p className="text-sm text-muted">Сообщений нет.</p>}
      <ul className="space-y-2">
        {all.slice(0, 8).map((i) => (
          <li key={i.id} className={`rounded-lg border p-3 text-sm ${i.status === "closed" ? "border-line/50 opacity-60" : "border-line bg-panel2"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-medium">
                <Dot status={i.severity === "critical" ? "critical" : "warning"} pulse={i.status === "open"} />
                {SECTION_NAME[i.section_id]}{i.equipment && ` · ${i.equipment}`}
              </span>
              <span className="text-[11px] font-semibold" style={{ color: INCIDENT_STATUS[i.status].color }}>{INCIDENT_STATUS[i.status].label}</span>
            </div>
            <p className="mt-1 text-slate-300">{i.text}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <span className="font-mono">{i.author?.login}</span>· {i.author?.title} · {dateTimeKz(i.created_at)}
              <span className="ml-auto flex gap-1.5">
                {i.status === "open" && <button onClick={() => set(i, "ack")} className="rounded-md border border-warn/60 px-2 py-0.5 text-warn">Принять в работу</button>}
                {i.status !== "closed" && <button onClick={() => set(i, "closed")} className="rounded-md border border-line px-2 py-0.5 hover:text-white">Закрыть</button>}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Число открытых сообщений — для блока «Требует внимания». */
export function useOpenIncidents(): number {
  const list = useApi(() => (STATIC ? Promise.resolve([] as Incident[]) : peopleApi.incidents()), []);
  return (list.data ?? []).filter((i) => i.status === "open").length;
}
