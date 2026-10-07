import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { api, useApi } from "../api/client";
import type { LineMetrics, Status } from "../api/types";
import { useApp } from "../lib/context";
import { fmt, fmtDate, fmtDateShort, fmtPct, STATUS_HEX } from "../lib/format";
import { STAGE_LABEL } from "./Attention";
import { PROCESS } from "../lib/process";
import { Dot, Loading, StatusBadge } from "./ui";

type Row = { key: keyof LineMetrics; label: string; pct?: boolean; better: "up" | "down"; status?: keyof LineMetrics["statuses"] };
const ROWS: Row[] = [
  { key: "fact", label: "Выпуск, авто", better: "up" },
  { key: "plan_completion_pct", label: "Выполнение плана", pct: true, better: "up", status: "plan_completion" },
  { key: "oee_pct", label: "OEE (расчётный)", pct: true, better: "up", status: "oee" },
  { key: "defect_pct", label: "Брак", pct: true, better: "down", status: "defect" },
];

function Body({ id }: { id: string }) {
  const { date } = useApp();
  const sec = useApi(() => api.section(id, date), [id, date]);
  const hist = useApi(() => api.section(id, null), [id]);
  const risk = useApi(api.risk, []);
  if (!sec.data) return <Loading error={sec.error} />;
  const s = sec.data;
  // Участок без данных в наборе (склады, ОТК) — показывать нечего, кроме этого факта
  if (!s.trend.length) {
    return (
      <div>
        <h2 className="text-2xl font-semibold">{s.name}</h2>
        <p className="mt-3 text-sm text-muted">По этому участку в тестовых данных кейса нет записей — статус «нет данных» (допущение A8).</p>
      </div>
    );
  }
  const r = risk.data?.risks.find((x) => x.section_id === id);
  const [a, b] = [s.trend[0], s.trend[s.trend.length - 1]];
  // Инциденты оборудования за весь период (для подсветки этапа техпроцесса)
  const hist2 = (name: string) => hist.data?.equipment.find((e) => e.name === name)?.events ?? [];
  const v = (m: LineMetrics, row: Row) => (row.pct ? `${fmtPct(m[row.key] as number)}%` : fmt(m[row.key] as number));
  const st = (m: LineMetrics, row: Row): Status | undefined => (row.status ? m.statuses[row.status] : undefined);
  const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
  const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5">
      <motion.div variants={item}>
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold">{s.name}</h2>
          <StatusBadge status={s.status} />
        </div>
        <div className="mt-0.5 text-sm text-muted">{s.line} · {date ? fmtDate(date) : "период"}</div>
      </motion.div>

      {r && (
        <motion.div variants={item} className="rounded-xl border p-4" style={{ borderColor: STATUS_HEX[r.stage === "realized" ? "critical" : "warning"] + "88" }}>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-brand">AI · {STAGE_LABEL[r.stage]}</div>
          <p className="mt-1 text-base text-slate-100">{r.recommendation.what}</p>
          <p className="mt-1 text-sm text-slate-400">{r.recommendation.risk}</p>
        </motion.div>
      )}

      {PROCESS[id] && (
        <motion.div variants={item}>
          <div className="mb-2 text-xs text-muted">{PROCESS[id].title}</div>
          <ol className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {PROCESS[id].steps.map((st, i) => {
              // Этап с оборудованием из данных окрашивается статусом этого оборудования
              const eqs = (st.equipment ?? []).map((n) => s.equipment.find((e) => e.name === n)).filter(Boolean);
              const hist = (st.equipment ?? []).flatMap((n) => hist2(n));
              const worstSt = hist.some((e) => e.status === "critical") ? "critical" : hist.some((e) => e.status === "warning") ? "warning" : hist.length ? "info" : null;
              const col = worstSt === "critical" ? STATUS_HEX.critical : worstSt === "warning" ? STATUS_HEX.warning : worstSt === "info" ? "#60a5fa" : undefined;
              return (
                <li key={st.name} className="flex items-center gap-1.5">
                  <span className="rounded-md border px-2 py-1" style={{ borderColor: col ?? "#243244", color: col ?? "#cbd5e1", background: col ? col + "1a" : undefined }}
                    title={eqs.length ? `Оборудование из данных: ${st.equipment!.join(", ")}` : undefined}>
                    {st.name}{st.equipment && <span className="ml-1 opacity-80">· {st.equipment.join(", ")}</span>}
                  </span>
                  {i < PROCESS[id].steps.length - 1 && <span className="text-muted">→</span>}
                </li>
              );
            })}
          </ol>
        </motion.div>
      )}

      <motion.div variants={item}>
        <div className="mb-2 flex justify-between text-xs text-muted"><span>Динамика</span><span>{fmtDateShort(a.date)} → {fmtDateShort(b.date)}</span></div>
        <div className="grid grid-cols-2 gap-2">
          {ROWS.map((row) => {
            const delta = (b[row.key] as number) - (a[row.key] as number);
            const worse = row.better === "up" ? delta < 0 : delta > 0;
            const sb = st(b, row);
            return (
              <div key={row.key} className="rounded-lg bg-panel2 p-3">
                <div className="text-[11px] text-muted">{row.label}</div>
                <div className="num mt-1 flex items-baseline gap-2">
                  <span className="text-xs text-muted">{v(a, row)} →</span>
                  <span className="text-xl font-semibold" style={{ color: sb && sb !== "ok" ? STATUS_HEX[sb] : undefined }}>{v(b, row)}</span>
                </div>
                {delta !== 0 && (
                  <div className={`num text-[11px] ${worse ? "text-crit" : "text-ok"}`}>
                    {delta > 0 ? "▲ +" : "▼ "}{fmt(delta)}{row.pct ? " п.п." : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>

      <motion.div variants={item}><PlanLink id={id} /></motion.div>

      <motion.div variants={item} data-tour="drawer-equipment">
        <div className="mb-2 text-xs text-muted">Оборудование · инциденты за период</div>
        {s.equipment.length === 0 && <p className="text-sm text-muted">Событий по оборудованию в данных нет.</p>}
        <ul className="space-y-2">
          {s.equipment.map((e) => {
            const events = hist.data?.equipment.find((h) => h.name === e.name)?.events ?? e.events;
            return (
              <li key={e.name} className="rounded-lg border border-line bg-panel2 px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-semibold"><Dot status={e.status} pulse />{e.name}</span>
                </div>
                {events.map((ev) => (
                  <div key={ev.date} className="mt-1 flex justify-between text-sm text-slate-300">
                    <span>{fmtDateShort(ev.date)} · {ev.reason}</span><span className="num font-medium">{ev.minutes} мин</span>
                  </div>
                ))}
              </li>
            );
          })}
        </ul>
      </motion.div>

      {r && (
        <motion.div variants={item}>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-ok">Что сделать</div>
          <ol className="space-y-2">
            {r.recommendation.actions.map((x, i) => (
              <li key={x} className="flex gap-2.5 text-sm text-slate-100">
                <span className="num mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ok/20 text-[11px] font-semibold text-ok">{i + 1}</span>{x}
              </li>
            ))}
          </ol>
        </motion.div>
      )}

      <motion.div variants={item}>
        <Link to={`/sections/${id}`} className="text-xs text-muted underline decoration-dotted hover:text-white">Полная детализация участка →</Link>
      </motion.div>
    </motion.div>
  );
}

/** 9.4: участок → его линия → план/факт → простой → AI-риск невыполнения плана → проверка изменения на 3D. */
function PlanLink({ id }: { id: string }) {
  const plan = useApi(api.plan, []);
  const down = useApi(() => api.downtime(null), []);
  if (!plan.data) return null;
  const r = plan.data.risks.find((x) => x.section_id === id);
  const mins = (down.data?.events ?? []).filter((e) => e.section_id === id).reduce((a, e) => a + e.minutes, 0);
  return (
    <div className="rounded-xl border border-line bg-panel2 p-4">
      <div className="text-xs text-muted">Линия участка и план</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        {r && <span>план-факт <b className="num">{r.fact}/{r.plan}</b> ({fmtPct(r.plan_completion_pct)}%)</span>}
        <span>простои за период <b className="num">{mins} мин</b></span>
      </div>
      <p className="mt-2 text-sm" style={{ color: r ? STATUS_HEX[r.stage === "realized" ? "critical" : "warning"] : STATUS_HEX.ok }}>
        {r ? `AI: риск невыполнения плана${r.bottleneck ? " — узкое место завода" : ""}. ${r.why}` : "AI: риска невыполнения плана по участку не видно."}
      </p>
      <div className="mt-3 flex gap-3 text-xs">
        <Link to="/production" className="text-muted underline decoration-dotted hover:text-white">Карточка линии</Link>
        <Link to="/plan" className="text-muted underline decoration-dotted hover:text-white">План</Link>
        <Link to={`/editor?section=${id}`} className="font-semibold text-brand underline decoration-dotted hover:brightness-125">Проверить изменение на 3D-модели →</Link>
      </div>
    </div>
  );
}

export function SectionDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <AnimatePresence>
      {id && (
        <>
          <motion.div key="backdrop" className="fixed inset-0 z-40 bg-black/40" onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.aside key="drawer" role="dialog" data-tour="drawer" aria-label="Детализация участка"
            className="fixed inset-y-0 right-0 z-50 w-full max-w-[480px] overflow-y-auto border-l border-line bg-panel p-6 shadow-2xl"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 260 }}>
            <button onClick={onClose} aria-label="Закрыть" className="absolute right-4 top-4 rounded-md px-2 py-1 text-muted hover:bg-panel2 hover:text-white">✕</button>
            <Body key={id} id={id} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
