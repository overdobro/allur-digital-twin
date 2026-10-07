import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useApi } from "../../api/client";
import { IdeaAiCard } from "../../components/IdeaAiCard";
import { Card, Loading, PageTitle } from "../../components/ui";
import { SECTION_NAME } from "../../lib/auth";
import { GRANT_CHAIN, ideasApi, STATUS_IDEA, type Idea, type IdeaStatus } from "../../lib/ideas";
import { IdeaRow } from "./IdeasPage";

/** Руководитель / эксперт: отбор идей, оценка 1–10, шорт-лист → финал → победитель гранта. */

const FILTERS: { key: "all" | IdeaStatus; label: string }[] = [
  { key: "all", label: "Все" }, { key: "submitted", label: "Новые" }, { key: "shortlisted", label: "Шорт-лист" },
  { key: "finalist", label: "Финал" }, { key: "winner", label: "Победители" }, { key: "rejected", label: "Отклонённые" },
];

function Review({ idea, onSaved }: { idea: Idea; onSaved: (i: Idea) => void }) {
  const [score, setScore] = useState<number>(idea.expert_score ?? 7);
  const [comment, setComment] = useState(idea.expert_comment ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setScore(idea.expert_score ?? 7); setComment(idea.expert_comment ?? ""); setError(null); }, [idea.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (status: IdeaStatus) => {
    setBusy(status); setError(null);
    try { onSaved(await ideasApi.review(idea.id, { status, expert_score: score, expert_comment: comment || null })); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };
  const reeval = async () => {
    setBusy("ai"); setError(null);
    try { onSaved(await ideasApi.reevaluate(idea.id)); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  const btn = "rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-40";
  return (
    <Card title="Решение эксперта" extra={<span className="text-xs text-muted">AI не принимает решение о гранте</span>}>
      <label className="block text-xs text-muted">
        Оценка эксперта: <b className="num text-base text-slate-100">{score}/10</b>
        <input type="range" min={1} max={10} value={score} onChange={(e) => setScore(Number(e.target.value))} className="mt-1 w-full accent-[#ef3e36]" />
      </label>
      <label className="mt-2 block text-xs text-muted">Комментарий
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000}
          className="mt-1 min-h-[70px] w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm focus:border-slate-400 focus:outline-none" />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={!!busy} onClick={() => act("shortlisted")} className={`${btn} border border-[#7aa6e8]/60 text-[#7aa6e8]`}>В шорт-лист</button>
        <button disabled={!!busy} onClick={() => act("finalist")} className={`${btn} bg-warn/20 text-warn`}>Финалист</button>
        <button disabled={!!busy || !["finalist", "winner"].includes(idea.status)} onClick={() => act("winner")}
          title={idea.status !== "finalist" ? "Победителем может стать только финалист" : undefined} className={`${btn} bg-ok/20 text-ok`}>🏆 Победитель гранта</button>
        <button disabled={!!busy} onClick={() => act("rejected")} className={`${btn} border border-line text-muted`}>Отклонить</button>
        <button disabled={!!busy} onClick={reeval} className={`${btn} ml-auto border border-line text-muted`}>{busy === "ai" ? "AI…" : "↻ Переоценить AI"}</button>
      </div>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
    </Card>
  );
}

export default function ManagerIdeas() {
  const r = useApi(ideasApi.rating, []);
  const [list, setList] = useState<Idea[] | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [params] = useSearchParams();
  const [selected, setSelected] = useState<number | null>(params.get("idea") ? Number(params.get("idea")) : null);
  const all = list ?? r.data;
  const shown = useMemo(() => (all ?? []).filter((i) => filter === "all" || i.status === filter), [all, filter]);
  if (!all) return <Loading error={r.error} />;
  const cur = all.find((i) => i.id === selected) ?? shown[0];
  const count = (s: IdeaStatus) => all.filter((i) => i.status === s).length;
  const onSaved = (i: Idea) => setList(all.map((x) => (x.id === i.id ? i : x)));
  return (
    <>
      <PageTitle title="Идеи сотрудников и обучающихся" subtitle="Отбор для ALLUR IDEA GRANT: AI даёт предварительный анализ, решение — за экспертом" />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[["Всего идей", all.length], ["Новые", count("submitted")], ["Шорт-лист", count("shortlisted")], ["Финалисты", count("finalist")], ["Победители", count("winner")]].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line bg-panel p-3"><div className="text-xs text-muted">{k}</div><div className="num mt-1 text-2xl font-semibold">{v}</div></div>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-1 text-[11px] text-muted">
        {GRANT_CHAIN.map((s, i) => <span key={s} className="rounded-md border border-line bg-panel px-2 py-1">{s}{i < GRANT_CHAIN.length - 1 && " →"}</span>)}
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div>
          <div className="mb-2 flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`rounded-md px-2.5 py-1 text-xs ${filter === f.key ? "bg-panel2 text-white" : "text-muted hover:text-white"}`}>{f.label}</button>
            ))}
          </div>
          <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
            {shown.map((i) => <IdeaRow key={i.id} idea={i} active={cur?.id === i.id} onClick={() => setSelected(i.id)} />)}
            {!shown.length && <p className="text-sm text-muted">В этой категории идей нет.</p>}
          </div>
        </div>
        {cur && (
          <motion.div key={cur.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4" data-tour="ideas">
            <Card title={cur.title} extra={<span className="text-xs font-semibold" style={{ color: STATUS_IDEA[cur.status].color }}>{STATUS_IDEA[cur.status].label}</span>}>
              <div className="mb-2 text-xs text-muted">
                <span className="font-mono">{cur.author?.login}</span> · {cur.author?.role === "student" ? `обучающийся, ${cur.author.course} курс` : cur.author?.title}
                {cur.section_id && <> · {SECTION_NAME[cur.section_id]}</>}
                {" · итоговый балл "}<b className="num text-slate-200">{cur.final_score ?? "—"}</b>
              </div>
              <p className="whitespace-pre-line text-sm text-slate-300">{cur.text}</p>
            </Card>
            <Review idea={cur} onSaved={onSaved} />
            <IdeaAiCard idea={cur} />
          </motion.div>
        )}
      </div>
    </>
  );
}
