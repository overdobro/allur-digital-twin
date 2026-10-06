import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { effectCalc, type EffectInputs } from "./effect";

// Эталон выгружает `python -m app.export_static <dir>`; путь задаёт STATIC_API_DIR
const dir = process.env.STATIC_API_DIR ?? "public/static-api";
const inputs = JSON.parse(readFileSync(`${dir}/effect-inputs.json`, "utf-8")) as EffectInputs;
const cases = JSON.parse(readFileSync(`${dir}/effect-cases.json`, "utf-8")) as {
  params: { working_days: number; defect_target_pct: number; downtime_cut_pct: number; margin_per_car: number | null };
  result: unknown;
}[];

describe("effectCalc совпадает с Python effect_calc", () => {
  it.each(cases.map((c) => [JSON.stringify(c.params), c] as const))("%s", (_, c) => {
    const p = c.params;
    expect(effectCalc(inputs, p.working_days, p.defect_target_pct, p.downtime_cut_pct, p.margin_per_car)).toEqual(c.result);
  });
});
