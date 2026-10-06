/**
 * Планировка цеха (типовая, условная): U-образный путь кузова.
 * Верхний ряд (z = −ROW) слева направо: склад → сварка → окраска; поворот — буфер окрашенных кузовов;
 * нижний ряд (z = +ROW) справа налево: сборка → тестовая линия → готовая продукция.
 * Координата s — расстояние вдоль пути; её использует общая симуляция flowSim.
 */

export const ROW = 6.5; // половина расстояния между рядами
export const GAP = 2.5; // буфер между цехами
export const CAR_LEN = 1.8;

/** Длины зон вдоль пути, порядок — как участки в данных. */
export const ZONE_LEN: Record<string, number> = {
  warehouse_in: 6, welding: 11, painting: 15, assembly: 13, qc: 9, warehouse_out: 6,
};
const TOP = ["warehouse_in", "welding", "painting"];
const BOTTOM = ["assembly", "qc", "warehouse_out"];

export interface PathPoint { x: number; z: number; heading: number }
export interface ZoneSpan { id: string; start: number; end: number; row: "top" | "bottom" }

function rowLength(ids: string[]) {
  return ids.reduce((a, id) => a + ZONE_LEN[id], 0) + GAP * (ids.length - 1);
}

export const TOP_LEN = rowLength(TOP);
export const BOTTOM_LEN = rowLength(BOTTOM);
const X_RIGHT = TOP_LEN / 2; // где ряды поворачивают
const X_LEFT = -TOP_LEN / 2;
const TURN_LEN = Math.PI * ROW; // полуокружность — буфер окрашенных кузовов
export const LEAD = 2; // подвод до первой зоны и вывод после последней

export const ZONES: ZoneSpan[] = (() => {
  const out: ZoneSpan[] = [];
  let s = 0;
  TOP.forEach((id, i) => { out.push({ id, start: s, end: s + ZONE_LEN[id], row: "top" }); s += ZONE_LEN[id] + (i < TOP.length - 1 ? GAP : 0); });
  s += TURN_LEN;
  BOTTOM.forEach((id, i) => { out.push({ id, start: s, end: s + ZONE_LEN[id], row: "bottom" }); s += ZONE_LEN[id] + (i < BOTTOM.length - 1 ? GAP : 0); });
  return out;
})();

export const TRACK_START = -LEAD;
export const TRACK_END = ZONES[ZONES.length - 1].end + LEAD;
export const TURN = { start: ZONES.find((z) => z.id === "painting")!.end, end: ZONES.find((z) => z.id === "assembly")!.start };

/** Точка пути по координате s. heading — угол поворота вокруг Y, кузов «смотрит» по ходу движения (+X при heading 0). */
export function pointAt(s: number): PathPoint {
  if (s <= TURN.start) return { x: X_LEFT + s, z: -ROW, heading: 0 };
  if (s < TURN.end) {
    const a = (s - TURN.start) / ROW; // 0..π
    return { x: X_RIGHT + Math.sin(a) * ROW, z: -Math.cos(a) * ROW, heading: -a };
  }
  return { x: X_RIGHT - (s - TURN.end), z: ROW, heading: Math.PI };
}

export const zoneById = (id: string) => ZONES.find((z) => z.id === id)!;
export const zoneCenter = (id: string): PathPoint => { const z = zoneById(id); return pointAt((z.start + z.end) / 2); };

/** Как кузов перемещается в зоне: по полу на роликах/скиде, на подвесе, погружением в ванну. */
export type Carry = "floor" | "hanger" | "wheels";

export interface BodyPose { y: number; carry: Carry; dip: number }

/** Доля пути внутри зоны 0..1 (вне зоны — обрезается). */
export const localT = (s: number, id: string) => { const z = zoneById(id); return Math.min(1, Math.max(0, (s - z.start) / (z.end - z.start))); };

// Участки внутри окраски (доли длины зоны): ванны КТЛ, печь, герметизация, камера ЛКП, полировка
// 13 ванн показываются 4 погружениями: иначе на коротком отрезке кузов «мелькал» бы (подпись на сцене — «13 ванн»)
export const PAINT = { tanks: [0.03, 0.4], oven: [0.42, 0.55], sealing: [0.57, 0.63], booth: [0.65, 0.86], polish: [0.88, 0.98] } as const;
export const DIPS = 4;
// Сборка: подвесной конвейер до «свадьбы» в конце зоны
export const ASSEMBLY_MARRIAGE = 0.8;

const FLOOR_Y = 0.42; // кузов на скиде/роликах
const HANG_Y = 1.75; // низ кузова на подвесе сборки (рабочие под кузовом)
const DIP_TOP = 1.55;
const WHEELS_Y = 0.06; // колёса (центр 0,1 при радиусе 0,15 от низа кузова) касаются пола

/** Положение кузова по высоте в точке s. */
export function poseAt(s: number): BodyPose {
  const paint = zoneById("painting"), asm = zoneById("assembly"), qc = zoneById("qc");
  if (s >= paint.start && s <= paint.end) {
    const t = localT(s, "painting");
    if (t >= PAINT.tanks[0] && t <= PAINT.tanks[1]) {
      // 13 ванн: кузов на подвесе ныряет в каждую
      const u = (t - PAINT.tanks[0]) / (PAINT.tanks[1] - PAINT.tanks[0]);
      const dip = Math.max(0, Math.sin(u * Math.PI * DIPS)) ** 0.6;
      return { y: DIP_TOP - dip * 1.15, carry: "hanger", dip };
    }
    return { y: t < PAINT.oven[0] ? DIP_TOP : FLOOR_Y, carry: t < PAINT.oven[0] ? "hanger" : "floor", dip: 0 };
  }
  if (s >= asm.start && s <= asm.end) {
    const t = localT(s, "assembly");
    if (t < 0.12) return { y: FLOOR_Y + (HANG_Y - FLOOR_Y) * (t / 0.12), carry: "hanger", dip: 0 }; // подъём на подвес
    if (t < ASSEMBLY_MARRIAGE) return { y: HANG_Y, carry: "hanger", dip: 0 };
    const k = Math.min(1, (t - ASSEMBLY_MARRIAGE) / 0.15); // опускание на колёса
    return { y: HANG_Y - (HANG_Y - WHEELS_Y) * k, carry: k >= 1 ? "wheels" : "hanger", dip: 0 };
  }
  if (s > asm.end || s >= qc.start) return { y: WHEELS_Y, carry: "wheels", dip: 0 };
  return { y: FLOOR_Y, carry: "floor", dip: 0 };
}

/** Стадия кузова для внешнего вида. */
export type BodyStage = "biw" | "ecoat" | "painted" | "assembled";
export function stageAt(s: number): BodyStage {
  const paint = zoneById("painting"), asm = zoneById("assembly");
  if (s < paint.start + (paint.end - paint.start) * PAINT.tanks[1]) return "biw";
  if (s < paint.start + (paint.end - paint.start) * PAINT.booth[0] + 1) return "ecoat";
  if (s < asm.start + (asm.end - asm.start) * ASSEMBLY_MARRIAGE) return "painted";
  return "assembled";
}
