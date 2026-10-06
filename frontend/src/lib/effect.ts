import type { Effect } from "../api/types";

/**
 * Копия backend/app/services/effect.py → effect_calc для статического режима (хостинг без сервера).
 * Совпадение с Python проверяется тестом effect.test.ts на эталонных случаях из экспорта.
 */
export interface EffectInputs {
  shifts_per_day: number; monthly_output_min: number; paint_fact: number; paint_defect_pct: number;
  weld_last_fact: number; last_date: string; unplanned_per_day: number; rate_per_min: number;
}

/** Python round(x, n) для отображения: до n знаков, как f"{x:g}" без лишних нулей. */
const r = (x: number, n: number) => Math.round(x * 10 ** n) / 10 ** n;
const n = (x: number) => String(x).replace(".", ",");
const rnd = (x: number) => Math.floor(x + 0.5);

export function effectCalc(i: EffectInputs, workingDays: number, defectTargetPct: number, downtimeCutPct: number,
  marginPerCar: number | null): Effect {
  const shifts = i.shifts_per_day * workingDays;
  const savedPerShift = Math.max(i.paint_fact * (i.paint_defect_pct - defectTargetPct) / 100, 0);
  const capped = i.weld_last_fact * shifts;
  const freed = i.unplanned_per_day * workingDays * downtimeCutPct / 100 * i.rate_per_min;
  const scenarios: Effect["scenarios"] = [
    {
      id: "painting_quality",
      title: `Брак Окраски ${n(r(i.paint_defect_pct, 1))}% → ${n(defectTargetPct)}%`,
      units: rnd(savedPerShift * shifts),
      unit_label: "кузовов/мес без переделки",
      formula: `${n(r(i.paint_fact, 1))} кузовов/смену × (${n(r(i.paint_defect_pct, 1))}% − ${n(defectTargetPct)}%) × ${shifts} смен`,
      money: null,
    },
    {
      id: "welding_inaction",
      title: `Если не восстановить Сварку (темп ${i.weld_last_fact}/смену, ${i.last_date.slice(8)}.10)`,
      units: rnd(capped - i.monthly_output_min),
      unit_label: "авто/мес к цели 5 500",
      formula: `${i.weld_last_fact} × ${shifts} смен = ${rnd(capped)} — Сварка первая в потоке и ограничивает выпуск после исчерпания буферов`,
      negative: true,
      money: null,
    },
    {
      id: "downtime_cut",
      title: `Сокращение аварийных простоев на ${n(downtimeCutPct)}% (предиктивное ТО)`,
      units: rnd(freed),
      unit_label: "авто/мес высвобожденной мощности",
      formula: `${n(r(i.unplanned_per_day, 1))} мин/сутки × ${workingDays} дн × ${n(downtimeCutPct)}% × ${n(r(i.rate_per_min, 2))} авто/мин`,
      money: null,
    },
  ];
  for (const s of scenarios) s.money = marginPerCar ? rnd(s.units * marginPerCar) : null;
  return {
    working_days: workingDays,
    margin_per_car: marginPerCar,
    scenarios,
    note: "Оценка расчётная, на 2 днях данных. Денежный эффект считается только при вводе маржи на автомобиль — в данных кейса её нет.",
  };
}
