import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { send, STATIC } from "../api/client";
import { assess, EFFECTS } from "../components/three/editorChecks";
import { ChangeResults, diffLayouts, itemName, KIND_LABEL } from "../components/ChangeResults";
import { baselineFromLines } from "../lib/whatif";
import { useSearchParams } from "react-router-dom";
import { api, useApi } from "../api/client";
import { Card, Loading, PageTitle } from "../components/ui";
import { ADDABLE, baseLayout, CATALOG, zoneAt, type Item, type ObjType } from "../components/three/editorModel";
import { SECTION_NAME } from "../lib/auth";
import { useApp } from "../lib/context";
import { fmt } from "../lib/format";

interface AiAssess { summary: string; risks: string[]; next_step: "pilot" | "fix_layout" | "expert" | "reject"; recommendation: string; source: "claude" | "rules"; model?: string }
interface SavedScenario { id: number; name: string; items: Item[]; created_at: string; author: { login: string } | null }
const NEXT: Record<AiAssess["next_step"], string> = { pilot: "Пилот на одной смене", fix_layout: "Исправить расстановку", expert: "Экспертная оценка", reject: "Не внедрять" };
import { hasWebGL } from "../lib/webgl";
import { ideasApi } from "../lib/ideas";
import { draftFromIdea } from "../components/three/ideaScenario";

const Factory3D = lazy(() => import("../components/three/Factory3D"));

let seq = 1;

export default function Editor() {
  const { meta } = useApp();
  const [params] = useSearchParams();
  const day = meta?.dates[meta.dates.length - 1] ?? null;
  const ov = useApi(() => api.overview(day), [day]);
  const base = useMemo(() => baseLayout(), []);
  const [items, setItems] = useState<Item[]>(base);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placing, setPlacing] = useState<ObjType | null>(null);
  // Идея → черновик расстановки (кнопка «Открыть в редакторе» на проверке идеи)
  const ideaId = params.get("idea");
  const [fromIdea, setFromIdea] = useState<{ id: number; title: string; message: string; section: string | null } | null>(null);
  useEffect(() => {
    if (!ideaId || STATIC) return;
    ideasApi.get(Number(ideaId)).then((i) => {
      const d = draftFromIdea(base, i.ai?.scenario ?? null);
      setItems(d.items);
      setSelectedId(d.focusId);
      setFromIdea({ id: i.id, title: i.title, message: d.message, section: i.ai?.scenario?.section_id ?? null });
    }).catch(() => null);
  }, [ideaId, base]);
  const focusSection = params.get("section") ?? fromIdea?.section ?? null;

  // Тестовый хук: текущие объекты редактора (для автотестов перетаскивания)
  useEffect(() => { (window as unknown as { __twinEditor?: unknown }).__twinEditor = { items }; }, [items]);
  const selected = items.find((i) => i.id === selectedId) ?? null;
  const changes = useMemo(() => diffLayouts(base, items), [base, items]);
  const prod = useApi(() => api.production(day), [day]);
  const baseline = useMemo(() => (prod.data ? baselineFromLines(prod.data.lines) : null), [prod.data]);
  const target = meta?.targets.monthly_output_min ?? 5500;
  const result = useMemo(() => (baseline ? assess(base, items, baseline, target) : null), [base, items, baseline, target]);
  const invalid = useMemo(() => new Set(result?.conflicts.map((c) => c.id) ?? []), [result]);
  const [ai, setAi] = useState<AiAssess | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  useEffect(() => setAi(null), [items]);
  const askAi = async () => {
    if (!result) return;
    const payload = {
      changes: changes.map((c) => `${KIND_LABEL[c.kind]}: ${itemName(c.item)}`),
      before: { monthly: result.before.monthly, bottleneck: result.before.bottleneck.name },
      after: { monthly: result.after.monthly, bottleneck: result.after.bottleneck.name },
      conflicts: result.conflicts.map((c) => c.with), consequences: result.consequences,
      assumptions: Object.values(EFFECTS).flatMap((z) => Object.values(z ?? {}).map((e) => e!.note)),
    };
    setAiBusy(true);
    try {
      setAi(STATIC ? localAssess(payload) : await send<AiAssess>("POST", "/editor/assess", payload));
    } catch { setAi(localAssess(payload)); } finally { setAiBusy(false); }
  };
  const [saved, setSaved] = useState<SavedScenario[]>([]);
  const [name, setName] = useState("");
  useEffect(() => { if (!STATIC) send<SavedScenario[]>("GET", "/scenarios").then(setSaved).catch(() => null); }, []);
  const save = async () => {
    if (!result || !name.trim()) return;
    const sc = await send<SavedScenario>("POST", "/scenarios", { name, items, summary: { before: result.before.monthly, after: result.after.monthly, bottleneck: [result.before.bottleneck.name, result.after.bottleneck.name], conflicts: result.conflicts.length, changes: changes.length } });
    setSaved([sc, ...saved]); setName("");
  };

  const update = useCallback((id: string, patch: Partial<Item>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x))), []);
  const remove = useCallback((id: string) => { setItems((xs) => xs.filter((x) => x.id !== id)); setSelectedId(null); }, []);
  const rotate = useCallback((id: string, d: number) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, rot: x.rot + d } : x))), []);
  const onPlace = (x: number, z: number) => {
    if (!placing) return;
    const id = `new-${placing}-${seq++}`;
    setItems((xs) => [...xs, { id, type: placing, x, z, rot: 0 }]);
    setSelectedId(id);
    setPlacing(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "Escape") { setPlacing(null); setSelectedId(null); }
      if (!selectedId) return;
      if (e.key === "Delete" || e.key === "Backspace") remove(selectedId);
      if (e.key.toLowerCase() === "r" || e.key.toLowerCase() === "к") rotate(selectedId, Math.PI / 2);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, remove, rotate]);

  if (!ov.data) return <Loading error={ov.error} />;
  if (!hasWebGL()) return <PageTitle title="Редактор цифрового двойника" subtitle="Нужен браузер с поддержкой WebGL" />;
  const zone = selected ? zoneAt(selected.x, selected.z) : null;

  return (
    <>
      <PageTitle title="Редактор цифрового двойника" subtitle="Моделирование изменений до внедрения: переместите, добавьте или уберите оборудование и посмотрите последствия" />
      {fromIdea && (
        <div className="mb-3 rounded-lg border border-brand/40 bg-brand/10 px-4 py-2 text-sm">
          <span className="text-muted">Из идеи: </span><b>«{fromIdea.title}»</b> · {fromIdea.message}
          <span className="text-muted"> — уточните расстановку и сравните последствия.</span>
        </div>
      )}
      <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="relative h-[68vh] min-h-[460px] overflow-hidden rounded-xl border border-line" data-testid="editor-3d" data-tour="editor"
          style={{ cursor: placing ? "crosshair" : undefined }}>
          <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted">Загрузка 3D…</div>}>
            <Factory3D nodes={ov.data.nodes} onSelect={() => {}} focusId={focusSection} motion
              editor={{ items, selectedId, invalid, placing, onSelect: setSelectedId, onMove: (id, x, z) => update(id, { x, z }), onPlace }} />
          </Suspense>
          <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-black/55 px-3 py-2 text-[11px] leading-relaxed text-slate-200">
            {placing ? <>Кликните по полу, чтобы поставить: <b>{CATALOG[placing].label}</b> · Esc — отмена</>
              : <>Клик — выбрать · перетаскивание — переместить · R — повернуть · Del — убрать · колесо/мышь — камера</>}
          </div>
        </div>

        <div className="space-y-4">
          <Card title="Каталог оборудования">
            <div className="grid grid-cols-2 gap-1.5">
              {ADDABLE.map((t) => (
                <button key={t} onClick={() => { setPlacing(placing === t ? null : t); setSelectedId(null); }}
                  title={CATALOG[t].desc}
                  className={`rounded-lg border px-2 py-2 text-left text-xs transition ${placing === t ? "border-brand bg-brand/15 text-white" : "border-line bg-panel2 text-slate-300 hover:border-slate-500"}`}>
                  {CATALOG[t].label}
                  <div className="text-[10px] text-muted">{fmt(CATALOG[t].w)}×{fmt(CATALOG[t].d)} м</div>
                </button>
              ))}
            </div>
          </Card>

          <Card title="Выбранный объект">
            {selected ? (
              <div className="space-y-2 text-sm">
                <div className="font-semibold">{itemName(selected)}</div>
                <div className="text-xs text-muted">{CATALOG[selected.type].desc}</div>
                <div className="num text-xs text-slate-300">
                  {zone ? `Участок: ${SECTION_NAME[zone]}` : "Вне участков"} · x {fmt(selected.x)} · z {fmt(selected.z)} · {Math.round(((selected.rot * 180) / Math.PI) % 360)}°
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button onClick={() => rotate(selected.id, -Math.PI / 2)} className="rounded-md border border-line px-2.5 py-1 text-xs hover:text-white">⟲ 90°</button>
                  <button onClick={() => rotate(selected.id, Math.PI / 2)} className="rounded-md border border-line px-2.5 py-1 text-xs hover:text-white">⟳ 90°</button>
                  <button onClick={() => remove(selected.id)} className="rounded-md border border-crit/60 px-2.5 py-1 text-xs text-crit">Убрать</button>
                </div>
              </div>
            ) : <p className="text-sm text-muted">Кликните по оборудованию в 3D или выберите позицию в каталоге.</p>}
          </Card>

          <Card title="Изменения" extra={changes.length > 0 && <button onClick={() => { setItems(base); setSelectedId(null); }} className="text-xs text-muted hover:text-white">↺ Сбросить</button>}>
            {!changes.length && <p className="text-sm text-muted">Изменений нет — расстановка совпадает с текущей.</p>}
            <ul className="space-y-1 text-sm">
              {changes.map((c) => (
                <li key={c.kind + c.item.id} className="flex justify-between gap-2">
                  <span className="text-slate-200">{KIND_LABEL[c.kind]}: {itemName(c.item)}</span>
                  {c.kind === "move" && c.from && <span className="num text-xs text-muted">{fmt(Math.hypot(c.item.x - c.from.x, c.item.z - c.from.z))} м</span>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      {result && (
        <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" data-testid="editor-results" data-tour="editor-results">
          <ChangeResults result={result} changes={changes} items={items} />

          <div className="space-y-4">
            <div data-tour="editor-ai"><Card title="AI-рекомендация" extra={ai && <span className="text-[10px] uppercase tracking-wider text-muted">{ai.source === "claude" ? `Claude · ${ai.model ?? ""}` : "правила · без LLM"}</span>}>
              {ai ? (
                <div className="space-y-2 text-sm">
                  <p className="text-slate-100">{ai.summary}</p>
                  <ul className="list-inside list-disc text-slate-300">{ai.risks.map((r) => <li key={r}>{r}</li>)}</ul>
                  <p><span className="text-muted">Следующий шаг: </span><b>{NEXT[ai.next_step]}</b></p>
                  <p className="text-slate-200">{ai.recommendation}</p>
                </div>
              ) : <p className="text-sm text-muted">{changes.length ? "Получите оценку рисков и следующего шага." : "Сначала внесите изменение."}</p>}
              <button disabled={!changes.length || aiBusy} onClick={askAi} data-tour-click="editor-ai"
                className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40">
                {aiBusy ? "AI анализирует…" : "✦ AI-оценка изменения"}
              </button>
            </Card></div>
            {!STATIC && (
              <Card title="Сценарии">
                <div className="flex gap-2">
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название сценария"
                    className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-sm focus:border-slate-400 focus:outline-none" />
                  <button disabled={!changes.length || name.trim().length < 2} onClick={save}
                    className="rounded-lg border border-line px-3 py-2 text-sm hover:text-white disabled:opacity-40">Сохранить</button>
                </div>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {saved.map((sc) => (
                    <li key={sc.id} className="flex items-center justify-between gap-2 rounded-lg bg-panel2 px-3 py-2">
                      <span className="truncate">{sc.name}</span>
                      <button onClick={() => { setItems(sc.items); setSelectedId(null); }} className="shrink-0 text-xs text-muted hover:text-white">Загрузить</button>
                    </li>
                  ))}
                  {!saved.length && <li className="text-xs text-muted">Сохранённых сценариев нет.</li>}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const CHANGE_RISKS: [RegExp, string][] = [
  [/робот/, "Робот: наладка программы и ограждение ячейки, простой участка на время монтажа"],
  [/кондуктор/, "Кондуктор: изготовление оснастки и проверка геометрии на первых кузовах"],
  [/рабоч\S* пост/, "Рабочий пост: нужен оператор на каждую смену"],
  [/датчик/, "Датчик: калибровка и ложные срабатывания; данные нужно завести в двойник"],
  [/буфер/, "Буфер: занимает площадь и проходы; сглаживает остановки, но не поднимает темп"],
  [/компрессор/, "Компрессорная: перенос магистралей требует остановки участка"],
  [/пост контроля|машинн/, "Пост контроля: ловит брак раньше, но не устраняет его причину"],
  [/андон/, "Андон: без регламента реакции сигнал игнорируют"],
];

/** Оценка правилами на клиенте (статическая сборка или сервер недоступен) — та же логика, что в services/layout_ai.py. */
function localAssess(p: { changes: string[]; before: { monthly: number; bottleneck: string }; after: { monthly: number; bottleneck: string }; conflicts: string[] }): AiAssess {
  const { before: b, after: a } = p;
  const dm = a.monthly - b.monthly;
  const conflicts = [...new Set(p.conflicts)].sort();
  const shift = b.bottleneck !== a.bottleneck;
  const risks: string[] = [];
  if (conflicts.length) risks.push("Пересечения габаритов: " + conflicts.join(", ").slice(0, 200));
  if (shift) risks.push(`Узкое место смещается: ${b.bottleneck} → ${a.bottleneck} — теперь выпуск ограничивает «${a.bottleneck}»`);
  const joined = p.changes.join(" ").toLowerCase();
  for (const [rx, text] of CHANGE_RISKS) if (rx.test(joined)) risks.push(text);
  if (p.changes.some((c) => c.toLowerCase().startsWith("убран"))) risks.push("Убранное оборудование выполняло работу — проверить, кто её возьмёт");
  risks.push("Влияние оборудования на темп — допущение модели; подтвердить пилотом или расчётом технолога");
  const head = p.changes.length ? p.changes.slice(0, 3).join("; ") + (p.changes.length > 3 ? ` и ещё ${p.changes.length - 3}` : "") : "Изменений нет";
  const summary = `${head}. Устойчивый выпуск ${b.monthly} → ${a.monthly} авто/мес (${dm > 0 ? "+" : ""}${dm})` +
    (shift ? `, узкое место смещается с «${b.bottleneck}» на «${a.bottleneck}».` : `, узкое место остаётся «${a.bottleneck}».`);
  let next_step: AiAssess["next_step"], recommendation: string;
  if (conflicts.length) { next_step = "fix_layout"; recommendation = `Сначала устранить пересечения (${conflicts.length}): переместить объект на свободное место участка и пересчитать.`; }
  else if (dm > 0) {
    next_step = "pilot";
    recommendation = `Проверить на одной смене: замерить темп участка и сравнить с моделью (+${dm} авто/мес).` + (shift ? ` После изменения выпуск ограничивает «${a.bottleneck}» — следующая мера должна быть там.` : "");
  } else if (dm < 0) { next_step = "reject"; recommendation = `Изменение снижает устойчивый выпуск на ${-dm} авто/мес — не внедрять без компенсации на участке «${a.bottleneck}».`; }
  else { next_step = "expert"; recommendation = "Выпуск в модели не меняется — эффект качественный (видимость, стабильность, логистика): оценить с технологом."; }
  return { summary, risks: risks.slice(0, 4), next_step, recommendation, source: "rules" };
}
