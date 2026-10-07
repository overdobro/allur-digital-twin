import { useState } from "react";
import { Link } from "react-router-dom";
import { api, useApi } from "../../api/client";
import { Card, Dot, Loading, PageTitle, StatusBadge } from "../../components/ui";
import { SECTION_NAME, useAuth } from "../../lib/auth";
import { useApp } from "../../lib/context";
import { fmtDate, fmtPct, STATUS_HEX } from "../../lib/format";
import { peopleApi, timeKz, type Attendance } from "../../lib/people";

/** «Моя смена»: отметка выхода, задание участка по тестовым данным, оборудование, подсказка AI для участка. */
export default function EmployeeShift() {
  const { user } = useAuth();
  const { meta } = useApp();
  const day = meta?.dates[meta.dates.length - 1] ?? null;
  const sec = useApi(() => (user?.section_id && day ? api.section(user.section_id, day) : Promise.resolve(null)), [user?.section_id, day]);
  const risk = useApi(api.risk, []);
  const att = useApi(peopleApi.attendance, []);
  const [today, setToday] = useState<Attendance | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user || !sec.data || !att.data) return <Loading error={sec.error ?? att.error} />;
  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Qostanay" });
  const rec = today !== undefined ? today : att.data.find((a) => a.day === todayStr) ?? null;
  const s = sec.data;
  const m = s.metrics;
  const r = risk.data?.risks.find((x) => x.section_id === user.section_id);
  const act = async (fn: () => Promise<Attendance>) => {
    setBusy(true); setError(null);
    try { setToday(await fn()); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <>
      <PageTitle title="Моя смена" subtitle={`${user.title} · ${SECTION_NAME[user.section_id ?? ""] ?? ""} · ${user.login}`} />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-4">
          <Card title="Посещаемость">
            {rec ? (
              <div className="text-sm">
                <div className="flex items-center gap-2"><Dot status="ok" /> Вышел на смену в <b className="num">{timeKz(rec.check_in)}</b></div>
                {rec.check_out && <div className="mt-1 flex items-center gap-2"><Dot status="no_data" /> Смена завершена в <b className="num">{timeKz(rec.check_out)}</b></div>}
              </div>
            ) : <p className="text-sm text-muted">Сегодня вы ещё не отметились.</p>}
            <div className="mt-3 flex gap-2">
              <button disabled={busy || !!rec} onClick={() => act(peopleApi.checkIn)} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40">Отметить выход на смену</button>
              <button disabled={busy || !rec || !!rec.check_out} onClick={() => act(peopleApi.checkOut)} className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-white disabled:opacity-40">Завершить смену</button>
            </div>
            {error && <p className="mt-2 text-sm text-crit">{error}</p>}
            <p className="mt-3 text-[11px] text-muted">
              Отметок в истории: {att.data.length + (rec && !att.data.some((a) => a.id === rec.id) ? 1 : 0)} (последние 30).
            </p>
          </Card>
          <Card title="Быстрые действия">
            <div className="grid gap-2 sm:grid-cols-3">
              <Link to="/work" className="rounded-lg border border-line bg-panel2 p-3 text-sm hover:border-slate-400">✅ Зафиксировать работу</Link>
              <Link to="/incidents" className="rounded-lg border border-line bg-panel2 p-3 text-sm hover:border-slate-400">⚠️ Сообщить о проблеме</Link>
              <Link to="/ideas" className="rounded-lg border border-line bg-panel2 p-3 text-sm hover:border-slate-400">💡 Предложить идею</Link>
            </div>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title={`Участок «${s.name}»`} extra={<StatusBadge status={s.status} />}>
            {m ? (
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                {[["План смены", m.plan], ["Факт", m.fact], ["Выполнение", `${fmtPct(m.plan_completion_pct)}%`], ["Брак", `${fmtPct(m.defect_pct)}%`]].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-panel2 p-3"><div className="text-[11px] text-muted">{k}</div><div className="num mt-1 text-lg font-semibold">{v}</div></div>
                ))}
              </div>
            ) : <p className="text-sm text-muted">По участку нет данных в тестовом наборе.</p>}
            <p className="mt-2 text-[11px] text-muted">Последняя смена в тестовых данных — {day ? fmtDate(day) : "—"}.</p>
            {s.equipment.length > 0 && (
              <ul className="mt-3 space-y-1.5 text-sm">
                {s.equipment.map((e) => (
                  <li key={e.name} className="flex items-center justify-between rounded-lg bg-panel2 px-3 py-2">
                    <span className="flex items-center gap-2"><Dot status={e.status} pulse />{e.name}</span>
                    <span className="text-xs text-muted">{e.events.length ? e.events.map((x) => `${x.reason}, ${x.minutes} мин`).join("; ") : "без событий за смену"}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {r && (
            <Card title="Подсказка AI для участка">
              <p className="text-sm text-slate-200">{r.recommendation.what}</p>
              <ul className="mt-2 list-inside list-disc text-sm text-slate-300">{r.recommendation.actions.slice(0, 2).map((a) => <li key={a}>{a}</li>)}</ul>
              <p className="mt-2 text-[11px]" style={{ color: STATUS_HEX[r.stage === "realized" ? "critical" : "warning"] }}>{r.stage === "realized" ? "Проблема уже есть" : "Риск назревает"} · индекс {fmtPct(r.risk_index)}</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
