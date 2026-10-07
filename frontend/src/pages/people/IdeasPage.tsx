import { AnimatePresence, motion } from "framer-motion";
import { useState, type FormEvent } from "react";
import { useApi } from "../../api/client";
import { IdeaAiCard } from "../../components/IdeaAiCard";
import { Card, Loading, PageTitle } from "../../components/ui";
import { SECTION_NAME } from "../../lib/auth";
import { ideasApi, STATUS_IDEA, type Idea } from "../../lib/ideas";

/** «Мои идеи» — общая для обучающегося и сотрудника: подача с мгновенной AI-оценкой и список своих идей. */

const ANALYSIS_STEPS = ["Читаю идею", "Сопоставляю с данными завода", "Оцениваю эффект и риски", "Формирую рекомендацию"];

function NewIdea({ onCreated }: { onCreated: (i: Idea) => void }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [section, setSection] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setStep(0);
    const t = window.setInterval(() => setStep((x) => Math.min(x + 1, ANALYSIS_STEPS.length - 1)), 700);
    try {
      const idea = await ideasApi.create({ title, text, section_id: section || null });
      setTitle(""); setText(""); setSection("");
      onCreated(idea);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      window.clearInterval(t); setBusy(false);
    }
  };
  const input = "w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm focus:border-slate-400 focus:outline-none";
  return (
    <Card title="Новая идея">
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-xs text-muted">Название
          <input className={`${input} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="Например: датчик на фильтрах камеры окраски" />
        </label>
        <label className="block text-xs text-muted">Участок (необязательно — AI определит сам)
          <select className={`${input} mt-1`} value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="">— не выбран —</option>
            {Object.entries(SECTION_NAME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="block text-xs text-muted">Суть идеи: что изменить и зачем
          <textarea className={`${input} mt-1 min-h-[110px]`} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} />
        </label>
        {error && <p className="text-sm text-crit">{error}</p>}
        <button disabled={busy || title.trim().length < 3 || text.trim().length < 10}
          className="w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50">
          {busy ? "AI анализирует…" : "Отправить и получить AI-оценку"}
        </button>
        <AnimatePresence>
          {busy && (
            <motion.ol initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-1 text-xs">
              {ANALYSIS_STEPS.map((s, i) => (
                <li key={s} className={i < step ? "text-ok" : i === step ? "text-slate-100" : "text-muted"}>
                  {i < step ? "✓" : i === step ? "●" : "○"} {s}
                </li>
              ))}
            </motion.ol>
          )}
        </AnimatePresence>
      </form>
    </Card>
  );
}

export function IdeaRow({ idea, active, onClick }: { idea: Idea; active: boolean; onClick: () => void }) {
  const st = STATUS_IDEA[idea.status];
  return (
    <button onClick={onClick} className={`w-full rounded-lg border p-3 text-left transition ${active ? "border-brand/70 bg-panel2" : "border-line bg-panel hover:border-slate-500"}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-slate-100">{idea.title}</span>
        <span className="num shrink-0 text-lg font-semibold">{idea.final_score ?? "—"}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className="rounded px-1.5 py-px font-semibold" style={{ color: st.color, background: st.color + "22" }}>{st.label}</span>
        {idea.section_id && <span className="text-muted">{SECTION_NAME[idea.section_id]}</span>}
        <span className="text-muted">{new Date(idea.created_at).toLocaleDateString("ru-RU")}</span>
      </div>
    </button>
  );
}

export default function IdeasPage() {
  const list = useApi(ideasApi.mine, []);
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [fresh, setFresh] = useState<number | null>(null);
  const all = ideas ?? list.data;
  if (!all) return <Loading error={list.error} />;
  const cur = all.find((i) => i.id === selected) ?? all[0];
  const onCreated = (i: Idea) => { setIdeas([i, ...all]); setSelected(i.id); setFresh(i.id); };
  return (
    <>
      <PageTitle title="Мои идеи" subtitle="Предложите улучшение — AI сразу оценит его на данных завода; лучшие идеи участвуют в ALLUR IDEA GRANT" />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <NewIdea onCreated={onCreated} />
          <div className="space-y-2">
            {all.map((i) => <IdeaRow key={i.id} idea={i} active={cur?.id === i.id} onClick={() => setSelected(i.id)} />)}
            {!all.length && <p className="text-sm text-muted">Идей пока нет — предложите первую.</p>}
          </div>
        </div>
        {cur && (
          <motion.div key={cur.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <Card title={cur.title} extra={<span className="text-xs" style={{ color: STATUS_IDEA[cur.status].color }}>{STATUS_IDEA[cur.status].label}</span>}>
              <p className="whitespace-pre-line text-sm text-slate-300">{cur.text}</p>
              {cur.expert_score !== null && (
                <div className="mt-3 rounded-lg border border-line bg-panel2 p-3 text-sm">
                  <span className="text-muted">Оценка эксперта:</span> <b className="num">{cur.expert_score}/10</b>
                  {cur.expert_comment && <div className="mt-1 text-slate-300">{cur.expert_comment}</div>}
                </div>
              )}
            </Card>
            <IdeaAiCard idea={cur} animate={fresh === cur.id} />
          </motion.div>
        )}
      </div>
    </>
  );
}
