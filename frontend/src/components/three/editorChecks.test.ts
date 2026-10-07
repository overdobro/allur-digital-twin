import { describe, expect, it } from "vitest";
import type { StageInput } from "../../lib/whatif";
import { assess, conflicts, freeSpacePct, overlap, type Box } from "./editorChecks";
import { baseLayout, place, type Item } from "./editorModel";

const baseline: StageInput[] = [
  { id: "welding", name: "Сварка", pace: 111, defectPct: 2.7 },
  { id: "painting", name: "Окраска", pace: 116, defectPct: 5.2 },
  { id: "assembly", name: "Сборка", pace: 119, defectPct: 1.7 },
];

describe("геометрия", () => {
  it("пересечение повёрнутых прямоугольников", () => {
    const a: Box = { cx: 0, cz: 0, hw: 1, hd: 0.5, rot: 0, name: "a" };
    expect(overlap(a, { ...a, cx: 1.9 })).toBe(true);
    expect(overlap(a, { ...a, cx: 2.1 })).toBe(false);
    expect(overlap(a, { ...a, cx: 2.0 })).toBe(false); // касание
    // Повёрнутый на 45° квадрат рядом с углом: по AABB пересекались бы, по факту — нет
    expect(overlap({ cx: 0, cz: 0, hw: 0.5, hd: 0.5, rot: 0, name: "" }, { cx: 1.15, cz: 1.15, hw: 0.5, hd: 0.5, rot: Math.PI / 4, name: "" })).toBe(false);
  });

  it("базовая расстановка без конфликтов", () => {
    expect(conflicts(baseLayout())).toEqual([]);
  });

  it("робот на линии, в камере ЛКП и поверх другого робота — конфликты", () => {
    const base = baseLayout();
    const onLine: Item = { id: "x", type: "robot", ...place("welding", 0.3, 0, 0) };
    const inBooth: Item = { id: "y", type: "robot", ...place("painting", 0.75, 0, 1.2) };
    const abb = base.find((i) => i.id === "abb-01")!;
    const onRobot: Item = { id: "z", type: "robot", x: abb.x + 0.3, z: abb.z, rot: 0 };
    const c = conflicts([...base, onLine, inBooth, onRobot]);
    expect(c.find((x) => x.id === "x")?.with).toBe("коридор движения кузова");
    expect(c.some((x) => x.id === "y" && x.with.startsWith("Камера ЛКП"))).toBe(true);
    expect(c.some((x) => x.id === "z" && x.with === "ABB-01")).toBe(true);
  });

  it("арку контроля можно поставить над линией", () => {
    const arch: Item = { id: "a", type: "inspection", ...place("painting", 0.93, 0, 0) };
    expect(conflicts([...baseLayout(), arch]).filter((c) => c.id === "a")).toEqual([]);
  });

  it("свободное место уменьшается при добавлении оборудования", () => {
    const base = baseLayout();
    const extra: Item = { id: "b", type: "buffer", ...place("welding", 0.3, 0, 2.6) };
    expect(freeSpacePct("welding", [...base, extra])).toBeLessThan(freeSpacePct("welding", base));
  });
});

describe("было → стало", () => {
  it("третий робот на посту геометрии: Сварка +4, узкое место смещается на Окраску", () => {
    const base = baseLayout();
    const robot: Item = { id: "r", type: "robot", ...place("welding", 0.62, 0, 1.8) };
    const a = assess(base, [...base, robot], baseline, 5500);
    expect(a.conflicts).toEqual([]);
    expect(a.deltas.welding.pace).toBe(4);
    expect(a.before.monthly).toBe(4752);
    // 115 × 0,973 = 111,9 > Окраска 116 × 0,948 = 110,0 → узкое место — Окраска
    expect(a.after.bottleneck.id).toBe("painting");
    expect(a.consequences.some((c) => c.includes("Узкое место смещается: Сварка → Окраска"))).toBe(true);
    expect(Object.keys(a.free)).toEqual(["welding"]); // свободное место — только по затронутому участку
  });

  it("убрать ABB-01: Сварка −4, выпуск падает", () => {
    const base = baseLayout();
    const a = assess(base, base.filter((i) => i.id !== "abb-01"), baseline, 5500);
    expect(a.deltas.welding.pace).toBe(-4);
    expect(a.after.monthly).toBeLessThan(a.before.monthly);
  });

  it("датчик у Камеры-02 снижает брак окраски; буфер честно не меняет выпуск", () => {
    const base = baseLayout();
    const sensor: Item = { id: "s", type: "sensor", ...place("painting", 0.75, 0, 2.2) };
    const buf: Item = { id: "b", type: "buffer", ...place("assembly", 0.05, 0, -3.4) };
    const a = assess(base, [...base, sensor, buf], baseline, 5500);
    expect(a.deltas.painting.defect).toBe(-1);
    expect(a.consequences.some((c) => c.startsWith("Буфер в устойчивом режиме выпуск не меняет"))).toBe(true);
  });
});
