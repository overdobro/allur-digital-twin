/**
 * Модель редактора цифрового двойника: редактируемые объекты как данные.
 * Базовая расстановка повторяет текущую 3D-модель (те же места, что были в коде); несущие конструкции
 * (ванны, печь, камера ЛКП, портал конвейера, стенды) не редактируются в MVP — их габариты используются при проверке столкновений.
 */
import { pointAt, zoneById, ZONES } from "./layout";

export type ObjType = "robot" | "jig" | "compressor" | "andon" | "sensor" | "buffer" | "workstation" | "inspection";

export interface Item {
  id: string;
  type: ObjType;
  x: number;
  z: number;
  rot: number; // радианы вокруг Y
  label?: string; // имя оборудования (ABB-01…), если есть в данных
  base?: boolean; // из исходной расстановки
}

export interface CatalogEntry {
  label: string; w: number; d: number; desc: string;
  /** Может стоять поперёк линии (арка/пост контроля над конвейером) */
  spansLine?: boolean;
}

export const CATALOG: Record<ObjType, CatalogEntry> = {
  robot: { label: "Робот (6 осей)", w: 1.0, d: 1.0, desc: "Сварочный/монтажный робот на посту" },
  jig: { label: "Кондуктор", w: 2.4, d: 1.4, desc: "Сварочная оснастка подсборок" },
  compressor: { label: "Компрессорная станция", w: 3.9, d: 1.1, desc: "Компрессоры и ресиверы сжатого воздуха" },
  andon: { label: "Андон-колонна", w: 0.35, d: 0.35, desc: "Сигнальная колонна статуса участка" },
  sensor: { label: "Датчик / шкаф контроля", w: 0.45, d: 0.35, desc: "Датчик (давление, вибрация, климат) с передачей в двойник" },
  buffer: { label: "Буфер кузовов", w: 2.3, d: 1.3, desc: "Стеллаж-накопитель на 2 кузова" },
  workstation: { label: "Рабочий пост", w: 1.5, d: 0.9, desc: "Верстак и место оператора" },
  inspection: { label: "Пост контроля (машинное зрение)", w: 0.6, d: 2.5, desc: "Арка с камерами над линией", spansLine: true },
};

export const ADDABLE: ObjType[] = ["robot", "sensor", "buffer", "workstation", "inspection", "compressor", "andon", "jig"];

/** Точка в системе участка: доля длины t, сдвиг вдоль пути dx, поперёк dz (локально). */
export function place(zone: string, t: number, dx: number, dz: number, extraRot = 0): { x: number; z: number; rot: number } {
  const zn = zoneById(zone);
  const p = pointAt(zn.start + (zn.end - zn.start) * t);
  const c = Math.cos(p.heading), s = Math.sin(p.heading);
  // локальный (dx, dz) → мировой: x' = dx·cos + dz·sin, z' = −dx·sin + dz·cos
  return { x: p.x + dx * c + dz * s, z: p.z - dx * s + dz * c, rot: p.heading + extraRot };
}

/** Посты подсборок вдоль Сварки: шаг 2,53 м > ширины кондуктора 2,4 м, до поста геометрии 2,2 м (раньше 1,98 м — кондукторы перекрывались). */
export const JIG_T = [0.06, 0.29, 0.52];

/** Сторона «от камеры» (как в equipment.tsx): верхний ряд −1, нижний +1. */
const back = (zone: string) => (zoneById(zone).row === "top" ? -1 : 1);

export function baseLayout(): Item[] {
  const items: Item[] = [];
  const add = (id: string, type: ObjType, pos: { x: number; z: number; rot: number }, label?: string) => items.push({ id, type, ...pos, label, base: true });
  const bw = back("welding");
  JIG_T.forEach((t, i) => add(`jig-${i + 1}`, "jig", place("welding", t, 0, bw * 2.4), `Кондуктор ${i + 1}`));
  add("abb-01", "robot", place("welding", 0.72, 0, -1.25), "ABB-01");
  add("abb-04", "robot", place("welding", 0.72, 0.4, 1.25, Math.PI), "ABB-04");
  add("compressors", "compressor", place("painting", 0.78, 0, back("painting") * 3.3), "Компрессорная");
  for (const z of ["welding", "painting", "assembly", "qc"]) add(`andon-${z}`, "andon", place(z, 0.97, 0, -back(z) * 2.3), `Андон · ${z}`);
  return items;
}

/** Ближайший участок к точке (по проекции на путь кузова), для подсказки «объект в зоне …». */
export function zoneAt(x: number, z: number): string | null {
  let best: { id: string; d: number } | null = null;
  for (const zn of ZONES) {
    for (let k = 0; k <= 10; k++) {
      const p = pointAt(zn.start + (zn.end - zn.start) * (k / 10));
      const d = Math.hypot(p.x - x, p.z - z);
      if (!best || d < best.d) best = { id: zn.id, d };
    }
  }
  return best && best.d < 6 ? best.id : null;
}

export const snap = (v: number, step = 0.25) => Math.round(v / step) * step;
