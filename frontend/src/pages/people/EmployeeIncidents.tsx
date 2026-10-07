import { useState, type FormEvent } from "react";
import { api, useApi } from "../../api/client";
import { Card, Loading, PageTitle } from "../../components/ui";
import { SECTION_NAME, useAuth } from "../../lib/auth";
import { dateTimeKz, INCIDENT_STATUS, peopleApi, type Incident } from "../../lib/people";

/** Сообщение о проблеме: сразу попадает в ленту руководителя («Простои и инциденты»). */
export default function EmployeeIncidents() {
  const { user } = useAuth();
  const list = useApi(peopleApi.incidents, []);
  const [items, setItems] = useState<Incident[] | null>(null);
  const [section, setSection] = useState(user?.section_id ?? "welding");
  const sec = useApi(() => api.section(section, null), [section]);
  const [equipment, setEquipment] = useState("");
  const [text, setText] = useState("");
  const [severity, setSeverity] = useState<"warning" | "critical">("warning");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const all = items ?? list.data;
  if (!all) return <Loading error={list.error} />;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(null);
    try {
      const inc = await peopleApi.report({ section_id: section, equipment: equipment || null, text, severity });
      setItems([inc, ...all]); setText(""); setSent(true); window.setTimeout(() => setSent(false), 3000);
    } catch (err) { setError((err as Error).message); }
  };
  const input = "w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm focus:border-slate-400 focus:outline-none";
  return (
    <>
      <PageTitle title="Сообщить о проблеме" subtitle="Сообщение сразу видит руководитель" />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card title="Новое сообщение">
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-xs text-muted">Участок
              <select className={`${input} mt-1`} value={section} onChange={(e) => { setSection(e.target.value); setEquipment(""); }}>
                {Object.entries(SECTION_NAME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="block text-xs text-muted">Оборудование (необязательно)
              <select className={`${input} mt-1`} value={equipment} onChange={(e) => setEquipment(e.target.value)}>
                <option value="">— не указано —</option>
                {sec.data?.equipment.map((e) => <option key={e.name} value={e.name}>{e.name}</option>)}
              </select>
            </label>
            <label className="block text-xs text-muted">Что случилось<textarea className={`${input} mt-1 min-h-[90px]`} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} /></label>
            <div className="flex gap-2 text-sm">
              {(["warning", "critical"] as const).map((s) => (
                <button type="button" key={s} onClick={() => setSeverity(s)}
                  className={`rounded-lg border px-3 py-1.5 ${severity === s ? (s === "critical" ? "border-crit bg-crit/15 text-crit" : "border-warn bg-warn/15 text-warn") : "border-line text-muted"}`}>
                  {s === "critical" ? "Критично — линия стоит" : "Внимание"}
                </button>
              ))}
            </div>
            {error && <p className="text-sm text-crit">{error}</p>}
            {sent && <p className="text-sm text-ok">Отправлено руководителю ✓</p>}
            <button disabled={text.trim().length < 5} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40">Отправить</button>
          </form>
        </Card>
        <Card title="Мои сообщения">
          {!all.length && <p className="text-sm text-muted">Сообщений пока нет.</p>}
          <ul className="space-y-2">
            {all.map((i) => (
              <li key={i.id} className="rounded-lg border border-line bg-panel2 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{SECTION_NAME[i.section_id]}{i.equipment && ` · ${i.equipment}`}</span>
                  <span className="text-[11px] font-semibold" style={{ color: INCIDENT_STATUS[i.status].color }}>{INCIDENT_STATUS[i.status].label}</span>
                </div>
                <p className="mt-1 text-slate-300">{i.text}</p>
                <div className="mt-1 text-[11px] text-muted">{dateTimeKz(i.created_at)} · {i.severity === "critical" ? "критично" : "внимание"}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
