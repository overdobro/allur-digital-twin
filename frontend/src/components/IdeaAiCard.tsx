import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { SECTION_NAME } from "../lib/auth";
import { STATUS_HEX } from "../lib/format";
import { LEVEL_LABEL, levelStatus, NEXT_STEP, OBJECT_LABEL, type Idea } from "../lib/ideas";

/** AI-ответ на идею: параметры из плана функционала + балл + кнопка проверки на 3D-модели. */
export function IdeaAiCard({ idea, animate = false }: { idea: Idea; animate?: boolean }) {
  const ai = idea.ai;
  if (!ai) return null;
  const rows: { k: string; v: React.ReactNode }[] = [
    ...(["realism", "effect", "complexity"] as const).map((kind) => ({
      k: { realism: "Реалистичность", effect: "Потенциальный эффект", complexity: "Сложность внедрения" }[kind],
      v: <span style={{ color: STATUS_HEX[levelStatus(kind, ai[kind])] }} className="font-semibold">{LEVEL_LABEL[kind][ai[kind]]}</span>,
    })),
    { k: "Риски", v: <ul className="list-inside list-disc">{ai.risks.map((r) => <li key={r}>{r}</li>)}</ul> },
    { k: "Что проверить", v: <ul className="list-inside list-disc">{ai.checks.map((r) => <li key={r}>{r}</li>)}</ul> },
    { k: "Следующий шаг", v: <span className="font-semibold text-slate-100">{NEXT_STEP[ai.next_step]}</span> },
  ];
  const item = { hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0 } };
  return (
    <div className="rounded-xl border border-brand/40 bg-gradient-to-br from-brand/10 via-panel to-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand">
          AI-анализ идеи
          <span className={`rounded px-1.5 py-px text-[10px] ${ai.source === "claude" ? "bg-[#d97757]/15 text-[#e8a184]" : "bg-slate-500/20 text-slate-300"}`}
            title={ai.source === "rules" ? "Без LLM: прозрачные правила по тексту идеи и данным завода" : undefined}>
            {ai.source === "claude" ? `Claude · ${ai.model ?? ""}` : "правила · без LLM"}
          </span>
        </div>
        <div className="text-right" title="Балл: эффект 50%, реалистичность 30%, простота 20% (90 баллов) + конкретность (10). Считается кодом.">
          <span className="num text-3xl font-bold text-slate-100">{ai.score}</span><span className="text-sm text-muted">/100</span>
        </div>
      </div>
      <p className="mt-2 text-sm text-slate-200">{ai.summary}</p>
      <motion.dl className="mt-4 divide-y divide-line" initial={animate ? "hidden" : false} animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.18 } } }}>
        {rows.map((r) => (
          <motion.div key={r.k} variants={item} className="grid grid-cols-[150px_1fr] gap-3 py-2 text-sm">
            <dt className="text-muted">{r.k}</dt><dd className="text-slate-300">{r.v}</dd>
          </motion.div>
        ))}
      </motion.dl>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link to={`/check3d?idea=${idea.id}`}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${ai.scenario ? "bg-brand text-white hover:brightness-110" : "border border-line text-muted hover:text-white"}`}>
          🧩 {idea.check3d ? "Открыть проверку на 3D" : "Проверить идею на 3D-модели"}
        </Link>
        {idea.check3d && (
          <span className="rounded-md bg-ok/15 px-2 py-1 text-xs text-ok" data-testid="check3d-badge">
            ✓ Проверено в 3D: {idea.check3d.before} → {idea.check3d.after} авто/мес{idea.check3d.conflicts.length ? ` · конфликтов ${idea.check3d.conflicts.length}` : ""}
          </span>
        )}
        {ai.scenario && !idea.check3d && (
          <span className="text-xs text-muted">
            Предложено: {{ add: "добавить", move: "переместить", remove: "убрать" }[ai.scenario.action]} «{OBJECT_LABEL[ai.scenario.object] ?? ai.scenario.object}» · {SECTION_NAME[ai.scenario.section_id]}
          </span>
        )}
      </div>
      <p className="mt-3 text-[11px] text-muted">AI даёт предварительный анализ. Решение о гранте принимает экспертная комиссия АЛЛЮР.</p>
    </div>
  );
}
