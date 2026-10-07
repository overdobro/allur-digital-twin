import { useState, type FormEvent } from "react";
import { useApi } from "../../api/client";
import { Card, Loading, PageTitle } from "../../components/ui";
import { dateTimeKz, peopleApi, type WorkItem } from "../../lib/people";

export default function WorkLog() {
  const list = useApi(peopleApi.work, []);
  const [items, setItems] = useState<WorkItem[] | null>(null);
  const [text, setText] = useState("");
  const [units, setUnits] = useState("");
  const [error, setError] = useState<string | null>(null);
  const all = items ?? list.data;
  if (!all) return <Loading error={list.error} />;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(null);
    try { const w = await peopleApi.addWork(text, units ? Number(units) : null); setItems([w, ...all]); setText(""); setUnits(""); }
    catch (err) { setError((err as Error).message); }
  };
  const input = "rounded-lg border border-line bg-bg px-3 py-2 text-sm focus:border-slate-400 focus:outline-none";
  return (
    <>
      <PageTitle title="Выполненная работа" subtitle="Фиксация операций за смену" />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card title="Добавить запись">
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-xs text-muted">Что сделано<input className={`${input} mt-1 w-full`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Например: заварено кузовов на посту 2" /></label>
            <label className="block text-xs text-muted">Количество (необязательно)<input className={`${input} mt-1 w-32`} inputMode="numeric" value={units} onChange={(e) => setUnits(e.target.value.replace(/\D/g, ""))} /></label>
            {error && <p className="text-sm text-crit">{error}</p>}
            <button disabled={text.trim().length < 3} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40">Записать</button>
          </form>
        </Card>
        <Card title="Журнал">
          {!all.length && <p className="text-sm text-muted">Записей пока нет.</p>}
          <ul className="divide-y divide-line text-sm">
            {all.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-slate-200">{w.text}</span>
                <span className="num shrink-0 text-xs text-muted">{w.units != null && <b className="mr-2 text-slate-200">{w.units} шт.</b>}{dateTimeKz(w.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
