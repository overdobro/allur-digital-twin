/**
 * Проверка изменений в редакторе: столкновения, свободное пространство, «было → стало» по выпуску и узкому месту.
 * Геометрия — честная (габариты в плане). Влияние объектов на темп и брак — сценарные ДОПУЩЕНИЯ (таблица EFFECTS),
 * они показываются на экране; это оценка «что если», а не прогноз с заявленной точностью.
 */
import { runScenario, type StageInput } from "../../lib/whatif";
import { CATALOG, zoneAt, type Item, type ObjType } from "./editorModel";
import { PAINT, pointAt, ROW, TRACK_END, TRACK_START, zoneById, ZONES } from "./layout";

// ---------- геометрия ----------

export interface Box { cx: number; cz: number; hw: number; hd: number; rot: number; name: string }

export function boxOf(it: Item): Box {
  const c = CATALOG[it.type];
  return { cx: it.x, cz: it.z, hw: c.w / 2, hd: c.d / 2, rot: it.rot, name: it.label ?? c.label };
}

/** Пересечение двух повёрнутых прямоугольников (теорема о разделяющей оси). Касание не считается. */
export function overlap(a: Box, b: Box, margin = 0): boolean {
  const axes = [a.rot, a.rot + Math.PI / 2, b.rot, b.rot + Math.PI / 2].map((r) => [Math.cos(r), -Math.sin(r)] as const);
  const corners = (q: Box) => {
    const c = Math.cos(q.rot), s = Math.sin(q.rot);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
      const lx = u * (q.hw + margin / 2), lz = v * (q.hd + margin / 2);
      return [q.cx + lx * c + lz * s, q.cz - lx * s + lz * c] as const;
    });
  };
  const ca = corners(a), cb = corners(b);
  for (const [ax, az] of axes) {
    const pa = ca.map(([x, z]) => x * ax + z * az), pb = cb.map(([x, z]) => x * ax + z * az);
    if (Math.max(...pa) <= Math.min(...pb) + 1e-6 || Math.max(...pb) <= Math.min(...pa) + 1e-6) return false;
  }
  return true;
}

/** Локальный прямоугольник участка (вдоль пути t0..t1, поперёк dz ± d/2) → мировой Box. */
function zoneBox(zone: string, t0: number, t1: number, dz: number, depth: number, name: string): Box {
  const z = zoneById(zone);
  const s0 = z.start + (z.end - z.start) * t0, s1 = z.start + (z.end - z.start) * t1;
  const p = pointAt((s0 + s1) / 2);
  return { cx: p.x + dz * Math.sin(p.heading), cz: p.z + dz * Math.cos(p.heading), hw: (s1 - s0) / 2, hd: depth / 2, rot: p.heading, name };
}

/** Несущие конструкции, которые редактор не двигает (их габариты участвуют в проверке). */
export function fixedObstacles(): Box[] {
  const back = (zone: string) => (zoneById(zone).row === "top" ? -1 : 1);
  return [
    zoneBox("painting", PAINT.tanks[0], PAINT.tanks[1], 0, 1.6, "Ванны КТЛ"),
    zoneBox("painting", PAINT.oven[0], PAINT.oven[1], 0, 1.8, "Печь сушки"),
    zoneBox("painting", PAINT.booth[0], PAINT.booth[1], 0, 3.3, "Камера ЛКП (Камера-02)"),
    zoneBox("assembly", 0.0, 1.0, -1.15, 0.3, "Стойки подвесного конвейера"),
    zoneBox("assembly", 0.0, 1.0, 1.15, 0.3, "Стойки подвесного конвейера"),
    zoneBox("assembly", 0.15, 0.85, back("assembly") * 2.7, 0.9, "Стеллажи комплектующих сборки"),
    zoneBox("warehouse_in", 0.0, 1.0, back("warehouse_in") * 2.1, 0.9, "Стеллажи склада"),
    zoneBox("qc", 0.47, 0.73, 0, 2.5, "Кабина Water Test"),
    zoneBox("warehouse_out", 0.0, 1.0, back("warehouse_out") * 3.1, 4.3, "Стоянка готовой продукции"),
  ];
}

/** Коридор движения кузова (лента/подвес) — короткие отрезки вдоль пути. */
export function corridor(width = 1.3, step = 0.6): Box[] {
  const out: Box[] = [];
  for (let s = TRACK_START; s < TRACK_END; s += step) {
    const p = pointAt(s + step / 2);
    out.push({ cx: p.x, cz: p.z, hw: step / 2, hd: width / 2, rot: p.heading, name: "Коридор движения кузова" });
  }
  return out;
}

const HALL = { minX: -18.5 - ROW - 6, maxX: 18.5 + ROW + 6, minZ: -ROW - 7.5, maxZ: ROW + 7.5 };

export interface Conflict { id: string; with: string }

export function conflicts(items: Item[], fixed = fixedObstacles(), road = corridor()): Conflict[] {
  const out: Conflict[] = [];
  const boxes = items.map((it) => ({ it, b: boxOf(it) }));
  for (const { it, b } of boxes) {
    if (b.cx - b.hw < HALL.minX || b.cx + b.hw > HALL.maxX || b.cz - b.hd < HALL.minZ || b.cz + b.hd > HALL.maxZ) out.push({ id: it.id, with: "граница цеха" });
    for (const f of fixed) if (overlap(b, f)) { out.push({ id: it.id, with: f.name }); break; }
    if (!CATALOG[it.type].spansLine && road.some((r) => overlap(b, r))) out.push({ id: it.id, with: "коридор движения кузова" });
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    if (overlap(boxes[i].b, boxes[j].b, 0.1)) {
      out.push({ id: boxes[i].it.id, with: boxes[j].b.name });
      out.push({ id: boxes[j].it.id, with: boxes[i].b.name });
    }
  }
  return out;
}

/** Свободная площадь участка, % (сетка 0,5 м в полосе ±4 м от линии). */
export function freeSpacePct(zone: string, items: Item[], fixed = fixedObstacles()): number {
  const z = zoneById(zone);
  const occ = [...fixed, ...corridor(), ...items.map(boxOf)];
  let total = 0, busy = 0;
  for (let s = z.start; s <= z.end; s += 0.5) {
    const p = pointAt(s);
    for (let dz = -4; dz <= 4; dz += 0.5) {
      const x = p.x + dz * Math.sin(p.heading), zz = p.z + dz * Math.cos(p.heading);
      total++;
      const pt: Box = { cx: x, cz: zz, hw: 0.01, hd: 0.01, rot: 0, name: "" };
      if (occ.some((b) => overlap(pt, b))) busy++;
    }
  }
  return Math.round(((total - busy) / total) * 100);
}

// ---------- влияние на выпуск (допущения) ----------

export interface Effect { pace?: number; defect?: number; note: string }

/** Сценарные допущения: влияние одной единицы оборудования на участке. Показываются на экране. */
export const EFFECTS: Partial<Record<ObjType, Partial<Record<string, Effect>>>> = {
  robot: {
    welding: { pace: 4, note: "робот на посту геометрии: ±4 авто/смену темпа Сварки" },
    painting: { pace: 2, note: "робот ЛКП: ±2 авто/смену темпа Окраски" },
    assembly: { pace: 2, note: "монтажный робот: ±2 авто/смену темпа Сборки" },
  },
  jig: { welding: { pace: 3, note: "кондуктор подсборок: ±3 авто/смену темпа Сварки" } },
  workstation: {
    welding: { pace: 2, note: "доп. рабочий пост: ±2 авто/смену" }, painting: { pace: 1, note: "доп. пост: ±1 авто/смену" },
    assembly: { pace: 2, note: "доп. пост сборки: ±2 авто/смену" },
  },
  sensor: {
    painting: { defect: -1, note: "датчик фильтров/климата у Камеры-02: брак окраски −1 п.п." },
    assembly: { pace: 1, note: "датчик вибрации Конвейера-03: меньше внезапных остановов, +1 авто/смену" },
    welding: { pace: 1, note: "датчик на посту сварки: раннее обнаружение ошибок, +1 авто/смену" },
  },
};

export const NO_MODEL_EFFECT: Partial<Record<ObjType, string>> = {
  buffer: "буфер в устойчивом режиме выпуск не меняет — сглаживает кратковременные простои",
  inspection: "пост контроля не снижает брак, а ловит его раньше — меньше переделок после сборки",
  compressor: "компрессорная влияет на стабильность давления; в модели не учитывается",
  andon: "андон повышает видимость проблем; в модели не учитывается",
};

const STAGES = ["welding", "painting", "assembly"] as const;

export interface Assessment {
  before: ReturnType<typeof runScenario>;
  after: ReturnType<typeof runScenario>;
  deltas: Record<string, { pace: number; defect: number; notes: string[] }>;
  conflicts: Conflict[];
  free: Record<string, { before: number; after: number }>;
  consequences: string[];
}

/** Темп/брак участков по количеству оборудования в зоне: (черновик − база) × влияние единицы. */
export function assess(base: Item[], draft: Item[], baseline: StageInput[], target: number): Assessment {
  const count = (items: Item[]) => {
    const m = new Map<string, number>();
    for (const it of items) { const z = zoneAt(it.x, it.z); if (z) m.set(`${it.type}|${z}`, (m.get(`${it.type}|${z}`) ?? 0) + 1); }
    return m;
  };
  const cb = count(base), cd = count(draft);
  const keys = new Set([...cb.keys(), ...cd.keys()]);
  const deltas: Assessment["deltas"] = Object.fromEntries(STAGES.map((s) => [s, { pace: 0, defect: 0, notes: [] as string[] }]));
  const notes = new Set<string>();
  for (const k of keys) {
    const [type, zone] = k.split("|") as [ObjType, string];
    const n = (cd.get(k) ?? 0) - (cb.get(k) ?? 0);
    if (!n) continue;
    const e = EFFECTS[type]?.[zone];
    if (e && deltas[zone]) {
      deltas[zone].pace += (e.pace ?? 0) * n;
      deltas[zone].defect += (e.defect ?? 0) * n;
      deltas[zone].notes.push(`${n > 0 ? "+" : ""}${n} × ${e.note}`);
    } else if (NO_MODEL_EFFECT[type]) notes.add(NO_MODEL_EFFECT[type]!);
  }
  const after = baseline.map((s) => ({
    ...s, pace: Math.max(0, s.pace + (deltas[s.id]?.pace ?? 0)), defectPct: Math.max(0, s.defectPct + (deltas[s.id]?.defect ?? 0)),
  }));
  const rb = runScenario({ stages: baseline, shiftsPerDay: 2, workingDays: 22 }, target);
  const ra = runScenario({ stages: after, shiftsPerDay: 2, workingDays: 22 }, target);
  const conf = conflicts(draft);
  // Свободное место — только по участкам, где что-то изменилось (иначе это шум)
  const baseById = new Map(base.map((b) => [b.id, b]));
  const draftIds = new Set(draft.map((d) => d.id));
  const changed = [
    ...draft.filter((d) => { const b = baseById.get(d.id); return !b || b.x !== d.x || b.z !== d.z || b.rot !== d.rot; }),
    ...base.filter((b) => !draftIds.has(b.id)),
    ...base.filter((b) => { const d = draft.find((x) => x.id === b.id); return d && (d.x !== b.x || d.z !== b.z); }),
  ];
  const touched = new Set(changed.map((i) => zoneAt(i.x, i.z)).filter(Boolean) as string[]);
  const free = Object.fromEntries([...touched].filter((z) => ZONES.some((x) => x.id === z)).map((z) => [z, { before: freeSpacePct(z, base), after: freeSpacePct(z, draft) }]));

  const cons: string[] = [];
  if (conf.length) cons.push(`Пересечения: ${[...new Set(conf.map((c) => c.with))].join(", ")} — изменение в таком виде не внедрить.`);
  for (const s of STAGES) {
    const d = deltas[s];
    if (d.pace) cons.push(`Темп участка «${zoneById(s) && baseline.find((b) => b.id === s)?.name}» ${d.pace > 0 ? "+" : ""}${d.pace} авто/смену (допущение).`);
    if (d.defect) cons.push(`Брак участка «${baseline.find((b) => b.id === s)?.name}» ${d.defect > 0 ? "+" : ""}${d.defect} п.п. (допущение).`);
  }
  if (rb.bottleneck.id !== ra.bottleneck.id) cons.push(`Узкое место смещается: ${rb.bottleneck.name} → ${ra.bottleneck.name}.`);
  const dm = ra.monthly - rb.monthly;
  if (dm) cons.push(`Устойчивый выпуск ${dm > 0 ? "+" : ""}${dm} авто/мес (${rb.monthly} → ${ra.monthly}).`);
  for (const [z, f] of Object.entries(free)) if (f.after < f.before - 2) cons.push(`Свободное место на участке «${zoneById(z) ? baseline.find((b) => b.id === z)?.name ?? z : z}» ${f.before}% → ${f.after}%.`);
  // Перемещение внутри участка не меняет число единиц оборудования — в модели выпуска эффекта нет, говорим об этом прямо
  for (const d of draft) {
    const b = baseById.get(d.id);
    if (!b || (b.x === d.x && b.z === d.z)) continue;
    const zb = zoneAt(b.x, b.z), zd = zoneAt(d.x, d.z);
    if (zb && zb === zd) {
      cons.push(`${d.label ?? CATALOG[d.type].label}: перемещение в пределах участка «${baseline.find((x) => x.id === zb)?.name ?? zb}» — выпуск в модели не меняется; эффект (длина магистралей, проходы, логистика) оценивает технолог.`);
      if (NO_MODEL_EFFECT[d.type]) notes.add(NO_MODEL_EFFECT[d.type]!);
    }
  }
  notes.forEach((n) => cons.push(n[0].toUpperCase() + n.slice(1) + "."));
  return { before: rb, after: ra, deltas, conflicts: conf, free, consequences: cons };
}
