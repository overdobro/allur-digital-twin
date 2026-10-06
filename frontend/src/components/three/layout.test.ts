import { describe, expect, it } from "vitest";
import { pointAt, poseAt, ROW, stageAt, TRACK_END, TURN, zoneById, ZONES } from "./layout";

describe("планировка цеха", () => {
  it("зоны идут по порядку данных и не пересекаются", () => {
    expect(ZONES.map((z) => z.id)).toEqual(["warehouse_in", "welding", "painting", "assembly", "qc", "warehouse_out"]);
    for (let i = 1; i < ZONES.length; i++) expect(ZONES[i].start).toBeGreaterThan(ZONES[i - 1].end);
  });

  it("путь непрерывен: соседние точки ближе шага (без скачков на стыках поворота)", () => {
    let prev = pointAt(0);
    for (let s = 0.25; s <= TRACK_END; s += 0.25) {
      const p = pointAt(s);
      expect(Math.hypot(p.x - prev.x, p.z - prev.z)).toBeLessThan(0.26);
      prev = p;
    }
  });

  it("верхний ряд — z = −ROW по +X, нижний — z = +ROW по −X", () => {
    expect(pointAt(zoneById("welding").start)).toMatchObject({ z: -ROW, heading: 0 });
    const a = pointAt(zoneById("qc").start);
    expect(a.z).toBe(ROW);
    expect(a.heading).toBeCloseTo(Math.PI);
    expect(pointAt((TURN.start + TURN.end) / 2).z).toBeCloseTo(0, 5);
  });

  it("кузов: сварка на полу, ванны — ныряет, сборка — на подвесе, после «свадьбы» — на колёсах", () => {
    const w = zoneById("welding"), p = zoneById("painting"), a = zoneById("assembly"), q = zoneById("qc");
    expect(poseAt((w.start + w.end) / 2).carry).toBe("floor");
    const dips = Array.from({ length: 200 }, (_, i) => poseAt(p.start + (p.end - p.start) * (0.03 + 0.37 * i / 199)).dip);
    expect(Math.max(...dips)).toBeGreaterThan(0.9);
    expect(poseAt(a.start + (a.end - a.start) * 0.5)).toMatchObject({ carry: "hanger" });
    expect(poseAt((q.start + q.end) / 2).carry).toBe("wheels");
  });

  it("стадии кузова: металл → грунт → цвет → собран", () => {
    const p = zoneById("painting"), a = zoneById("assembly");
    expect(stageAt(zoneById("welding").end)).toBe("biw");
    expect(stageAt(p.start + (p.end - p.start) * 0.45)).toBe("ecoat");
    expect(stageAt(p.end)).toBe("painted");
    expect(stageAt(a.end)).toBe("assembled");
  });
});
