import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, useApi } from "../../api/client";
import { ChangeResults, diffLayouts } from "../../components/ChangeResults";
import { assess } from "../../components/three/editorChecks";
import { baseLayout } from "../../components/three/editorModel";
import { draftFromIdea } from "../../components/three/ideaScenario";
import { Card, Loading, PageTitle } from "../../components/ui";
import { SECTION_NAME, useAuth } from "../../lib/auth";
import { useApp } from "../../lib/context";
import { GRANT_CHAIN, ideasApi, OBJECT_LABEL, type Idea } from "../../lib/ideas";
import { baselineFromLines } from "../../lib/whatif";
import { hasWebGL } from "../../lib/webgl";

const Factory3D = lazy(() => import("../../components/three/Factory3D"));
const ACTION = { add: "добавить", move: "переместить", remove: "убрать" } as const;

/** «Проверь в 3D»: изменение из идеи применяется к цифровому двойнику, считаются последствия; автор сохраняет итог проверки. */
export default function Check3D() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { meta } = useApp();
  const param = params.get("idea") ?? "";
  const [idea, setIdea] = useState<Idea | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { ideasApi.find(param).then(setIdea).catch((e) => setError(String(e.message ?? e))); }, [param]);

  const day = meta?.dates[meta.dates.length - 1] ?? null;
  const ov = useApi(() => api.overview(day), [day]);
  const prod = useApi(() => api.production(day), [day]);
  const base = useMemo(() => baseLayout(), []);
  const sc = idea?.ai?.scenario ?? null;
  const draft = useMemo(() => draftFromIdea(base, sc), [base, sc]);
  const changes = useMemo(() => diffLayouts(base, draft.items), [base, draft]);
  const baseline = useMemo(() => (prod.data ? baselineFromLines(prod.data.lines) : null), [prod.data]);
  const result = useMemo(() => (baseline && draft.ok ? assess(base, draft.items, baseline, meta?.targets.monthly_output_min ?? 5500) : null), [base, draft, baseline, meta]);

  if (error) return <Loading error={error} />;
  if (!idea || !ov.data) return <Loading />;
  const canSave = !!result && (user?.role === "manager" || user?.id === idea.author_id);
  const saveCheck = async () => {
    if (!result) return;
    setSaving(true);
    try {
      setIdea(await ideasApi.check3d(idea.id, {
        changes: draft.message ? [draft.message] : [], before: result.before.monthly, after: result.after.monthly,
        bottleneck_before: result.before.bottleneck.name, bottleneck_after: result.after.bottleneck.name,
        conflicts: [...new Set(result.conflicts.map((c) => c.with))], consequences: result.consequences.slice(0, 20),
      }));
    } finally { setSaving(false); }
  };

  return (
    <>
      <PageTitle title="Проверка идеи на 3D-модели" subtitle={`«${idea.title}» — изменение применяется к цифровому двойнику, последствия считаются той же моделью, что в редакторе`} />
      <div className="mb-4 flex flex-wrap items-center gap-1.5 text-xs" data-testid="grant-chain">
        {GRANT_CHAIN.map((s, k) => (
          <span key={s} className={`rounded-full px-2.5 py-1 ${k === 2 ? "bg-brand text-white" : k < 2 ? "bg-ok/20 text-ok" : "bg-panel2 text-muted"}`}>{k + 1}. {s}</span>
        ))}
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]" data-tour="check3d">
        <div className="relative h-[56vh] min-h-[400px] overflow-hidden rounded-xl border border-line" data-testid="check3d-3d">
          {hasWebGL() ? (
            <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted">Загрузка 3D…</div>}>
              <Factory3D nodes={ov.data.nodes} onSelect={() => {}} focusId={sc?.section_id ?? null} motion
                editor={{ items: draft.items, selectedId: draft.focusId, invalid: new Set(result?.conflicts.map((c) => c.id) ?? []), placing: null, onSelect: () => {}, onMove: () => {}, onPlace: () => {} }} />
            </Suspense>
          ) : <div className="flex h-full items-center justify-center text-sm text-muted">Нужен браузер с поддержкой WebGL</div>}
          <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-black/55 px-3 py-2 text-[11px] text-slate-200">
            Предпросмотр · изменение из идеи выделено жёлтым · колесо/мышь — камера
          </div>
        </div>
        <div className="space-y-4">
          <Card title="Что предлагает идея">
            <p className="text-sm text-slate-200">{idea.text}</p>
            {sc ? (
              <p className="mt-3 text-sm"><span className="text-muted">Изменение в 3D: </span>
                <b>{ACTION[sc.action]} «{OBJECT_LABEL[sc.object] ?? sc.object}»</b> · {SECTION_NAME[sc.section_id]}</p>
            ) : null}
            <p className={`mt-2 text-sm ${draft.ok ? "text-slate-300" : "text-warn"}`} data-testid="check3d-message">{draft.message}</p>
            {draft.ok && <p className="mt-1 text-[11px] text-muted">Место подобрано автоматически — первое свободное без пересечений; точную позицию уточняет технолог.</p>}
          </Card>
          {result && (
            <Card title="Итог проверки">
              {idea.check3d ? (
                <p className="text-sm text-ok" data-testid="check3d-saved">✓ Проверено {new Date(idea.check3d.checked_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}: {idea.check3d.before} → {idea.check3d.after} авто/мес</p>
              ) : <p className="text-sm text-muted">Сохраните результат — он появится в карточке идеи и будет виден комиссии.</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {canSave && (
                  <button onClick={saveCheck} disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40">
                    {saving ? "Сохранение…" : idea.check3d ? "Обновить итог" : "Сохранить результат проверки"}
                  </button>
                )}
                {user?.role === "manager" && (
                  <Link to={`/editor?idea=${idea.id}`} className="rounded-lg border border-line px-4 py-2 text-sm hover:text-white">Открыть в редакторе →</Link>
                )}
              </div>
            </Card>
          )}
          <Link to="/ideas" className="inline-block text-sm text-muted hover:text-white">← К идеям</Link>
        </div>
      </div>
      {result && <div className="mt-4"><ChangeResults result={result} changes={changes} items={draft.items} /></div>}
    </>
  );
}
