import { EFFECTS, NO_MODEL_EFFECT, type Assessment } from "./three/editorChecks";
import { CATALOG, type Item } from "./three/editorModel";
import { SECTION_NAME } from "../lib/auth";
import { fmtInt, STATUS_HEX } from "../lib/format";
import { Card } from "./ui";

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

export const KIND_LABEL: Record<Change["kind"], string> = { add: "Добавлен", move: "Перемещён", remove: "Убран", rotate: "Повёрнут" };

export const itemName = (i: Item) => i.label ?? CATALOG[i.type].label;

/** Блок «Проверка изменений: было → изменение → стало» — общий для редактора и проверки идеи. */
export function ChangeResults({ result, changes, items }: { result: Assessment; changes: Change[]; items: Item[] }) {
  return (
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
  );
}
