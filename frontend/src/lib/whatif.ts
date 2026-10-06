/**
 * Сценарная модель «Что если» (баланс линии).
 * Устойчивый выпуск — после исчерпания межоперационных буферов: поток ограничен самым слабым участком,
 * годных за смену = min по участкам (темп × (1 − брак)). Факт 02.10 по Сборке (119) выше этой оценки
 * именно за счёт буферов — поэтому модель отвечает на вопрос «что будет, если так продолжится».
 */

export interface StageInput { id: string; name: string; pace: number; defectPct: number }
export interface Scenario { stages: StageInput[]; shiftsPerDay: number; workingDays: number }

export interface StageResult extends StageInput { good: number; bottleneck: boolean }
export interface ScenarioResult {
  stages: StageResult[]; perShift: number; shifts: number; monthly: number; target: number; gap: number;
  bottleneck: StageResult; requiredPace: number;
}

export const PLAN_PER_SHIFT = 120;

export function runScenario(s: Scenario, target: number): ScenarioResult {
  const goods = s.stages.map((st) => st.pace * (1 - st.defectPct / 100));
  const perShift = Math.min(...goods);
  const bi = goods.indexOf(perShift);
  const shifts = s.shiftsPerDay * s.workingDays;
  const monthly = Math.round(perShift * shifts);
  const stages = s.stages.map((st, i) => ({ ...st, good: goods[i], bottleneck: i === bi }));
  const b = stages[bi];
  return {
    stages, perShift, shifts, monthly, target, gap: monthly - target, bottleneck: b,
    // Какой темп нужен узкому месту (при его браке), чтобы выйти на цель
    requiredPace: target / shifts / (1 - b.defectPct / 100),
  };
}

/** Состояние 02.10 из данных: темп = факт смены, брак = % брака участка. */
export function baselineFromLines(lines: { section_id: string; section: string; fact: number; defect_pct: number }[]): StageInput[] {
  return lines.map((l) => ({ id: l.section_id, name: l.section, pace: l.fact, defectPct: l.defect_pct }));
}

/**
 * Рекомендации AI как изменения параметров: восстановить темп Сварки до плана (диагностика ABB-01, проверка ABB-04),
 * брак до нормы 2% там, где он выше (Камера-02 — Окраска, сварные точки — Сварка). Остальное — как есть.
 */
export function applyRecommendations(stages: StageInput[], normPct: number): StageInput[] {
  return stages.map((s) => ({
    ...s,
    pace: s.id === "welding" ? Math.max(s.pace, PLAN_PER_SHIFT) : s.pace,
    defectPct: Math.min(s.defectPct, normPct),
  }));
}
