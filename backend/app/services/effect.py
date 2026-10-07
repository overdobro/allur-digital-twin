"""Прогноз выпуска за месяц и оценка бизнес-эффекта. Каждая цифра сопровождается формулой."""
import math

from app.repository import Repository
from app.services.kpi import downtime_metrics, line_metrics, r1


def _avg_per_shift(repo: Repository, section_id: str) -> dict:
    m = next(x for x in line_metrics(repo) if x["section_id"] == section_id)
    return {"plan": m["plan"] / m["shifts"], "fact": m["fact"] / m["shifts"], "defects": m["defects"] / m["shifts"],
            "defect_pct": m["defects"] / m["fact"] * 100}


def monthly_forecast(repo: Repository, working_days: int) -> dict:
    t = repo.targets
    shifts = t["shifts_per_day"] * working_days
    final = _avg_per_shift(repo, "assembly")  # A3
    forecast = final["fact"] * shifts
    capacity_at_plan = final["plan"] * shifts
    models_total = sum(m["plan"] for m in repo.monthly_plan)
    required_per_shift = t["monthly_output_min"] / shifts
    return {
        "working_days": working_days,
        "shifts": shifts,
        "avg_output_per_shift": r1(final["fact"]),
        "forecast": round(forecast),
        "forecast_formula": f"{_n(final['fact'])} авто/смену × {t['shifts_per_day']} смены × {working_days} раб. дней",
        "target": t["monthly_output_min"],
        "gap": round(forecast - t["monthly_output_min"]),
        "capacity_at_plan": round(capacity_at_plan),
        "capacity_formula": f"сменный план {_n(final['plan'])} × {shifts} смен",
        "required_per_shift": r1(required_per_shift),
        "models_plan_total": models_total,
        "models_plan": repo.monthly_plan,
        "models_gap": models_total - t["monthly_output_min"],
        "status": "ok" if forecast >= t["monthly_output_min"] else "critical",
        "calculated": True,
    }


def _n(x: float) -> str:
    return f"{x:g}".replace(".", ",")


def rnd(x: float) -> int:
    """Округление half-up — как Math.round во фронтенде (статический режим считает эффект в браузере)."""
    return math.floor(x + 0.5)


def effect_inputs(repo: Repository) -> dict:
    """Величины из данных, от которых зависит эффект. В статическом режиме выгружаются в JSON."""
    t = repo.targets
    paint = _avg_per_shift(repo, "painting")
    last_weld = next(m for m in line_metrics(repo, repo.dates[-1]) if m["section_id"] == "welding")
    down = downtime_metrics(repo)
    return {
        "shifts_per_day": t["shifts_per_day"],
        "monthly_output_min": t["monthly_output_min"],
        "paint_fact": paint["fact"],
        "paint_defect_pct": paint["defect_pct"],
        "weld_last_fact": last_weld["fact"],
        "last_date": repo.dates[-1],
        "unplanned_per_day": down["unplanned_min"] / len(repo.dates),
        "rate_per_min": _avg_per_shift(repo, "assembly")["plan"] / (t["shift_hours"] * 60),
    }


def effect_calc(i: dict, working_days: int, defect_target_pct: float, downtime_cut_pct: float,
                margin_per_car: float | None) -> dict:
    """Чистая арифметика сценариев. Её копия — frontend/src/lib/effect.ts (сверяется тестом)."""
    shifts = i["shifts_per_day"] * working_days
    saved_per_shift = max(i["paint_fact"] * (i["paint_defect_pct"] - defect_target_pct) / 100, 0)
    capped = i["weld_last_fact"] * shifts
    freed = i["unplanned_per_day"] * working_days * downtime_cut_pct / 100 * i["rate_per_min"]
    scenarios = [
        {
            "id": "painting_quality",
            "title": f"Брак Окраски {_n(r1(i['paint_defect_pct']))}% → {_n(defect_target_pct)}%",
            "units": rnd(saved_per_shift * shifts),
            "unit_label": "кузовов/мес без переделки",
            "formula": f"{_n(r1(i['paint_fact']))} кузовов/смену × ({_n(r1(i['paint_defect_pct']))}% − {_n(defect_target_pct)}%) × {shifts} смен",
        },
        {
            "id": "welding_inaction",
            "title": f"Если не восстановить Сварку (темп {i['weld_last_fact']}/смену, {i['last_date'][8:]}.10)",
            "units": rnd(capped - i["monthly_output_min"]),
            "unit_label": "авто/мес к цели 5 500",
            "formula": f"{i['weld_last_fact']} × {shifts} смен = {rnd(capped)} — Сварка первая в потоке и ограничивает выпуск после исчерпания буферов",
            "negative": True,
        },
        {
            "id": "downtime_cut",
            "title": f"Сокращение аварийных простоев на {_n(downtime_cut_pct)}% (предиктивное ТО)",
            "units": rnd(freed),
            "unit_label": "авто/мес высвобожденной мощности",
            "formula": f"{_n(r1(i['unplanned_per_day']))} мин/сутки × {working_days} дн × {_n(downtime_cut_pct)}% × {_n(round(i['rate_per_min'], 2))} авто/мин",
        },
    ]
    for s in scenarios:
        s["money"] = rnd(s["units"] * margin_per_car) if margin_per_car else None
    return {
        "working_days": working_days,
        "margin_per_car": margin_per_car,
        "scenarios": scenarios,
        "note": "Оценка расчётная, на 2 днях данных. Денежный эффект считается только при вводе маржи на автомобиль — в тестовых данных её нет.",
    }


def effect(repo: Repository, working_days: int, defect_target_pct: float, downtime_cut_pct: float,
           margin_per_car: float | None) -> dict:
    return effect_calc(effect_inputs(repo), working_days, defect_target_pct, downtime_cut_pct, margin_per_car)
