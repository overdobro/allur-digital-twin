/**
 * «Проверь идею в 3D»: сценарий из AI-оценки идеи (добавить / переместить / убрать объект на участке)
 * превращается в черновик расстановки. Место подбирается автоматически — первое свободное без конфликтов;
 * это ориентировочная позиция, уточнить её можно в редакторе.
 */
import { conflicts } from "./editorChecks";
import { CATALOG, place, zoneAt, type Item, type ObjType } from "./editorModel";
import { zoneById } from "./layout";

export interface IdeaScenario { action: "add" | "move" | "remove"; object: string; section_id: string; note: string }

export interface IdeaDraft {
  items: Item[];
  /** Объект, который добавлен/перемещён (подсвечивается); для «убрать» — null */
  focusId: string | null;
  ok: boolean;
  message: string;
}

/** Предпочтительная доля участка для типа объекта (робот — у поста геометрии, датчик — у камеры и т. п.). */
const HINT_T: Partial<Record<ObjType, Partial<Record<string, number>>>> = {
  robot: { welding: 0.62, assembly: 0.5 },
  sensor: { painting: 0.75, assembly: 0.5 },
  inspection: { painting: 0.93, qc: 0.3 },
  andon: { welding: 0.4 },
};

/** Кандидаты мест на участке: ближе к подсказке — раньше; сначала сторона «от камеры». */
function candidates(type: ObjType, zone: string): { x: number; z: number; rot: number }[] {
  const hint = HINT_T[type]?.[zone] ?? 0.5;
  const ts = Array.from({ length: 21 }, (_, k) => k / 20).sort((a, b) => Math.abs(a - hint) - Math.abs(b - hint));
  const back = zoneById(zone).row === "top" ? -1 : 1;
  const c = CATALOG[type];
  const off = c.d / 2 + 0.9; // от оси линии: половина глубины + коридор
  const dzs = c.spansLine ? [0] : [off, off + 0.8, off + 1.6, off + 2.4].flatMap((d) => [-back * d, back * d]);
  return ts.flatMap((t) => dzs.map((dz) => place(zone, t, 0, dz)));
}

function freeSpot(type: ObjType, zone: string, others: Item[], id: string) {
  for (const p of candidates(type, zone)) {
    const it: Item = { id, type, ...p };
    if (!conflicts([...others, it]).some((c) => c.id === id)) return p;
  }
  return null;
}

const isType = (o: string): o is ObjType => o in CATALOG;

export function draftFromIdea(base: Item[], sc: IdeaScenario | null): IdeaDraft {
  const fail = (message: string): IdeaDraft => ({ items: base, focusId: null, ok: false, message });
  if (!sc) return fail("AI не предложил изменения расстановки для этой идеи — её эффект проверяется не в 3D, а пилотом или экспертом.");
  if (!isType(sc.object)) return fail(`Объект «${sc.object}» пока нет в каталоге 3D-редактора.`);
  const type = sc.object;
  const label = CATALOG[type].label.toLowerCase();
  // Существующий объект этого типа на участке (для «переместить» и «убрать»)
  const existing = base.find((i) => i.type === type && zoneAt(i.x, i.z) === sc.section_id);

  if (sc.action === "remove") {
    if (!existing) return fail(`На участке нет объекта «${label}», убирать нечего.`);
    return { items: base.filter((i) => i !== existing), focusId: null, ok: true, message: `Убран: ${existing.label ?? CATALOG[type].label}` };
  }
  if (sc.action === "move" && existing) {
    const others = base.filter((i) => i !== existing);
    const p = freeSpot(type, sc.section_id, others, existing.id);
    // Новое место должно отличаться от текущего
    const moved = p && Math.hypot(p.x - existing.x, p.z - existing.z) > 1 ? p
      : candidates(type, sc.section_id).reverse().find((q) => !conflicts([...others, { id: existing.id, type, ...q }]).some((c) => c.id === existing.id));
    if (!moved) return fail("Свободного места на участке не нашлось.");
    return { items: [...others, { ...existing, ...moved }], focusId: existing.id, ok: true, message: `Перемещён: ${existing.label ?? CATALOG[type].label} (позиция ориентировочная)` };
  }
  const id = `idea-${type}`;
  const p = freeSpot(type, sc.section_id, base, id);
  if (!p) return fail("Свободного места на участке не нашлось — нужен перенос другого оборудования.");
  const note = sc.action === "move" ? " (на участке такого объекта нет — проверяем добавление)" : "";
  return { items: [...base, { id, type, ...p }], focusId: id, ok: true, message: `Добавлен: ${CATALOG[type].label}${note}` };
}
