import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { send, STATIC } from "../api/client";
import { assess, EFFECTS, NO_MODEL_EFFECT } from "../components/three/editorChecks";
import { baselineFromLines } from "../lib/whatif";
import { fmtInt, STATUS_HEX } from "../lib/format";
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

const Factory3D = lazy(() => import("../components/three/Factory3D"));

/** Изменение относительно исходной расстановки — основа для «Было → Изменение → Стало». */
export interface Change { kind: "add" | "move" | "remove" | "rotate"; item: Item; from?: Item }

export function diffLayouts(base: Item[], draft: Item[]): Change[] {
  const out: Change[] = [];
  const byId = new Map(draft.map((i) => [i.id, i]));
  for (const b of base) {
    const d = byId.get(b.id);
    if (!d) out.push({ kind: "remove", item: b });
    else if (Math.hypot(d.x - b.x, d.z - b.z) > 0.01) out.push({ kind: "move", item: d, from: b });
    else if (Math.abs(d.rot - b.rot) > 0.01) out.push({ kind: "rotate", item: d, from: b });
  }
  const baseIds = new Set(base.map((b) => b.id));
  for (const d of draft) if (!baseIds.has(d.id)) out.push({ kind: "add", item: d });
  return out;
}

const KIND_LABEL: Record<Change["kind"], string> = { add: "Добавлен", move: "Перемещён", remove: "Убран", rotate: "Повёрнут" };

export const itemName = (i: Item) => i.label ?? CATALOG[i.type].label;

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
  const focusSection = params.get("section");

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
      <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="relative h-[68vh] min-h-[460px] overflow-hidden rounded-xl border border-line" data-testid="editor-3d"
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
        <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" data-testid="editor-results">
          <Card title="Проверка изменений: было → изменение → стало" extra={<span className="text-xs text-muted">сценарная модель · допущения ниже</span>}>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg bg-panel2 p-3">
                <div className="text-[11px] uppercase tracking-wider text-muted">Было</div>
                <div className="num mt-1 text-2xl font-semibold">{fmtInt(result.before.monthly)}</div>
                <div className="text-xs text-muted">авто/мес · узкое место: <b className="text-warn">{result.before.bottleneck.name}</b></div>
              </div>
              <div className="rounded-lg bg-panel2 p-3">
                <div className="text-[11px] uppercase tracking-wider text-muted">Изменение</div>
                {changes.length ? <ul className="mt-1 space-y-0.5 text-xs text-slate-200">{changes.slice(0, 5).map((c) => <li key={c.kind + c.item.id}>{KIND_LABEL[c.kind]}: {itemName(c.item)}</li>)}{changes.length > 5 && <li className="text-muted">…ещё {changes.length - 5}</li>}</ul>
                  : <div className="mt-1 text-xs text-muted">нет</div>}
              </div>
              <div className="rounded-lg p-3" style={{ background: (result.conflicts.length ? STATUS_HEX.critical : result.after.monthly > result.before.monthly ? STATUS_HEX.ok : result.after.monthly < result.before.monthly ? STATUS_HEX.warning : "#18222f") + "22" }}>
                <div className="text-[11px] uppercase tracking-wider text-muted">Стало</div>
                <div className="num mt-1 text-2xl font-semibold">{fmtInt(result.after.monthly)}
                  <span className={`ml-2 text-sm ${result.after.monthly - result.before.monthly >= 0 ? "text-ok" : "text-crit"}`}>{result.after.monthly - result.before.monthly > 0 ? "+" : ""}{result.after.monthly - result.before.monthly}</span></div>
                <div className="text-xs text-muted">узкое место: <b className="text-warn">{result.after.bottleneck.name}</b></div>
              </div>
            </div>
            {result.conflicts.length > 0 && (
              <div className="mt-3 rounded-lg border border-crit/50 bg-crit/10 p-3 text-sm">
                <div className="font-semibold text-crit">Конфликты ({new Set(result.conflicts.map((c) => c.id)).size} объект.)</div>
                <ul className="mt-1 space-y-0.5 text-xs text-slate-200">
                  {[...new Map(result.conflicts.map((c) => [c.id + c.with, c])).values()].map((c) => <li key={c.id + c.with}>{itemName(items.find((i) => i.id === c.id)!)} ↔ {c.with}</li>)}
                </ul>
              </div>
            )}
            <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Последствия</h3>
            {result.consequences.length ? <ul className="list-inside list-disc space-y-1 text-sm text-slate-200">{result.consequences.map((c) => <li key={c}>{c}</li>)}</ul>
              : <p className="text-sm text-muted">Изменений нет.</p>}
            {Object.keys(result.free).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {Object.entries(result.free).map(([z, f]) => (
                  <span key={z} className="rounded-md bg-panel2 px-2 py-1 text-slate-300">свободно · {SECTION_NAME[z]}: <b className="num">{f.before}% → {f.after}%</b></span>
                ))}
              </div>
            )}
            <details className="mt-4 text-xs text-muted">
              <summary className="cursor-pointer hover:text-white">Допущения модели редактора</summary>
              <ul className="mt-2 list-inside list-disc space-y-0.5">
                {Object.values(EFFECTS).flatMap((z) => Object.values(z ?? {})).map((e) => <li key={e!.note}>{e!.note}</li>)}
                {Object.values(NO_MODEL_EFFECT).map((n) => <li key={n}>{n}</li>)}
                <li>Выпуск — устойчивый режим (после исчерпания буферов) по модели «Что если»; база — смена 02.10.</li>
                <li>Геометрия — по габаритам объектов в плане; несущие конструкции и коридор движения кузова не двигаются.</li>
              </ul>
            </details>
          </Card>

          <div className="space-y-4">
            <Card title="AI-рекомендация" extra={ai && <span className="text-[10px] uppercase tracking-wider text-muted">{ai.source === "claude" ? `Claude · ${ai.model ?? ""}` : "правила · без LLM"}</span>}>
              {ai ? (
                <div className="space-y-2 text-sm">
                  <p className="text-slate-100">{ai.summary}</p>
                  <ul className="list-inside list-disc text-slate-300">{ai.risks.map((r) => <li key={r}>{r}</li>)}</ul>
                  <p><span className="text-muted">Следующий шаг: </span><b>{NEXT[ai.next_step]}</b></p>
                  <p className="text-slate-200">{ai.recommendation}</p>
                </div>
              ) : <p className="text-sm text-muted">{changes.length ? "Получите оценку рисков и следующего шага." : "Сначала внесите изменение."}</p>}
              <button disabled={!changes.length || aiBusy} onClick={askAi}
                className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40">
                {aiBusy ? "AI анализирует…" : "✦ AI-оценка изменения"}
              </button>
            </Card>
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

/** Оценка правилами на клиенте (статическая сборка или сервер недоступен) — та же логика, что на сервере. */
function localAssess(p: { before: { monthly: number; bottleneck: string }; after: { monthly: number; bottleneck: string }; conflicts: string[] }): AiAssess {
  const risks: string[] = [];
  if (p.conflicts.length) risks.push("Пересечения габаритов: " + [...new Set(p.conflicts)].join(", "));
  if (p.before.bottleneck !== p.after.bottleneck) risks.push(`Узкое место смещается: ${p.before.bottleneck} → ${p.after.bottleneck} — проверить новый ограничивающий участок`);
  risks.push("Влияние оборудования на темп — допущение модели; нужно подтвердить пилотом или расчётом технолога");
  const dm = p.after.monthly - p.before.monthly;
  const [next_step, recommendation] = p.conflicts.length ? ["fix_layout", "Сначала устранить пересечения — переместить объект на свободное место участка."] as const
    : dm > 0 ? ["pilot", `Изменение даёт +${dm} авто/мес в сценарной модели — проверить на одной смене и сравнить факт.`] as const
    : dm < 0 ? ["reject", `Изменение снижает устойчивый выпуск на ${-dm} авто/мес — не рекомендуется без компенсации.`] as const
    : ["expert", "Выпуск в модели не меняется — оценить качественный эффект (безопасность, видимость, стабильность) с экспертом."] as const;
  return { summary: `Устойчивый выпуск ${p.before.monthly} → ${p.after.monthly} авто/мес.`, risks: risks.slice(0, 4), next_step, recommendation, source: "rules" };
}
