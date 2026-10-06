import { describe, expect, it } from "vitest";
import { applyRecommendations, runScenario, type StageInput } from "./whatif";

// 02.10 из тестовых данных
const base: StageInput[] = [
  { id: "welding", name: "Сварка", pace: 111, defectPct: 2.7 },
  { id: "painting", name: "Окраска", pace: 116, defectPct: 5.2 },
  { id: "assembly", name: "Сборка", pace: 119, defectPct: 1.7 },
];

describe("сценарная модель", () => {
  it("02.10: узкое место — Сварка, 111 × 0,973 = 108,0 годных/смену → 4 752 за 44 смены", () => {
    const r = runScenario({ stages: base, shiftsPerDay: 2, workingDays: 22 }, 5500);
    expect(r.bottleneck.id).toBe("welding");
    expect(r.perShift).toBeCloseTo(108.003, 3);
    expect(r.monthly).toBe(4752);
    expect(r.gap).toBe(-748);
  });

  it("рекомендации AI: Сварка 120 и брак ≤ 2% → узкое место смещается на Окраску (116 × 0,98 = 113,7) → 5 002", () => {
    const rec = applyRecommendations(base, 2);
    expect(rec.find((s) => s.id === "welding")).toMatchObject({ pace: 120, defectPct: 2 });
    expect(rec.find((s) => s.id === "assembly")!.defectPct).toBe(1.7); // уже в норме — не трогаем
    const r = runScenario({ stages: rec, shiftsPerDay: 2, workingDays: 22 }, 5500);
    expect(r.bottleneck.id).toBe("painting");
    expect(r.monthly).toBe(5002);
  });

  it("для цели 5 500 узкому месту нужен темп ≈127,6 при браке 2%", () => {
    const r = runScenario({ stages: applyRecommendations(base, 2), shiftsPerDay: 2, workingDays: 22 }, 5500);
    expect(r.requiredPace).toBeCloseTo(5500 / 44 / 0.98, 6);
    expect(r.requiredPace).toBeCloseTo(127.55, 2);
  });

  it("третья смена закрывает цель даже без изменения темпа", () => {
    const r = runScenario({ stages: base, shiftsPerDay: 3, workingDays: 22 }, 5500);
    expect(r.monthly).toBe(7128);
    expect(r.gap).toBeGreaterThan(0);
  });
});
