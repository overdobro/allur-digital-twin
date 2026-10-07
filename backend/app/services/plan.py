"""Производственный план (п. 9.2): по моделям, день / смена / месяц, план-факт, прогноз, зоны риска.

Факт по моделям в данных кейса отсутствует — он расчётный (допущение A9): выпуск Сборки × доля модели в плане.
Общий факт (выпуск Сборки) — из данных.
"""
from app.repository import Repository
from app.services.effect import monthly_forecast
from app.services.kpi import line_metrics, r1
from app.services.risk import bottleneck, section_risks


def production_plan(repo: Repository, working_days: int) -> dict:
    t = repo.targets
    total_models = sum(m["plan"] for m in repo.monthly_plan)
    fc = monthly_forecast(repo, working_days)
    asm_by_date = {d: next(m for m in line_metrics(repo, d) if m["section_id"] == "assembly") for d in repo.dates}
    shift_plan = next(iter(asm_by_date.values()))["plan"]  # сменный план линии
    fact_period = sum(m["fact"] for m in asm_by_date.values())
    plan_period = sum(m["plan"] for m in asm_by_date.values())
    last = asm_by_date[repo.dates[-1]]

    models = []
    for mp in repo.monthly_plan:
        share = mp["plan"] / total_models
        forecast = fc["forecast"] * share
        models.append({
            "model": mp["model"], "share_pct": r1(share * 100), "month_plan": mp["plan"],
            "shift_plan": r1(shift_plan * share), "day_plan": r1(shift_plan * share * t["shifts_per_day"]),
            "fact_last_shift": r1(last["fact"] * share),  # расчётный (A9)
            "fact_period": r1(fact_period * share),  # расчётный (A9)
            "plan_period": r1(plan_period * share),
            "forecast_month": round(forecast),
            "forecast_completion_pct": r1(forecast / mp["plan"] * 100),
            "status": "ok" if forecast >= mp["plan"] else "critical",
            "calculated": True,
        })

    by_date = [{"date": d, "plan": m["plan"], "fact": m["fact"], "deviation": m["fact"] - m["plan"],
                "completion_pct": m["plan_completion_pct"], "status": m["statuses"]["plan_completion"]} for d, m in asm_by_date.items()]

    # Зоны риска невыполнения плана: участки, чьё отклонение тянет выпуск вниз (из Risk Engine и Bottleneck)
    b = bottleneck(repo)
    risks = []
    for r in section_risks(repo):
        lm = next(m for m in line_metrics(repo, repo.dates[-1]) if m["section_id"] == r["section_id"])
        if lm["plan_completion_pct"] < 100 or r["stage"] == "realized":
            risks.append({
                "section_id": r["section_id"], "section": r["section"], "level": r["level"], "stage": r["stage"],
                "plan_completion_pct": lm["plan_completion_pct"], "fact": lm["fact"], "plan": lm["plan"],
                "why": r["factors"][0]["evidence"] if r["factors"] else "",
                "bottleneck": r["section_id"] == b["current"]["section_id"],
            })

    return {
        "working_days": working_days, "shifts_per_day": t["shifts_per_day"], "shift_plan": shift_plan,
        "target_month": t["monthly_output_min"], "models_month_total": total_models,
        "fact_period": fact_period, "plan_period": plan_period, "shifts_in_data": len(repo.dates),
        "completion_period_pct": r1(fact_period / plan_period * 100),
        "forecast_month": fc["forecast"], "forecast_formula": fc["forecast_formula"],
        "gap_target": fc["forecast"] - t["monthly_output_min"], "gap_models": fc["forecast"] - total_models,
        "required_per_shift": fc["required_per_shift"],
        "models": models, "by_date": by_date, "risks": risks,
        "note": "Факт по моделям — расчётный (A9): в данных кейса есть только общий выпуск Сборки.",
    }
