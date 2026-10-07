from fastapi import APIRouter, Depends, HTTPException, Query

from app.config import ASSUMPTIONS, THRESHOLDS, settings
from app.repository import Repository, get_repository
from app.services.advisor import get_advice
from app.services.effect import effect, monthly_forecast
from app.services.plan import production_plan
from app.services.kpi import downtime_metrics, factory_kpi, line_metrics
from app.services.risk import WEIGHTS, base_recommendation, bottleneck, section_risks
from app.services.replay import timeline
from app.services.twin import factory_map, section_detail

router = APIRouter()


def date_param(date: str | None = Query(None, description="YYYY-MM-DD; пусто — весь период")) -> str | None:
    if date is not None and date not in get_repository().dates:
        raise HTTPException(404, f"Нет данных за {date}")
    return date


@router.get("/health")
def health():
    return {"status": "ok", "llm": bool(settings.anthropic_api_key)}


@router.get("/meta")
def meta(repo: Repository = Depends(get_repository)):
    return {
        "dates": repo.dates,
        "targets": repo.targets,
        "monthly_plan": repo.monthly_plan,
        "assumptions": ASSUMPTIONS,
        "thresholds": {k: {"ok": b.ok, "critical": b.critical, "higher_is_better": b.higher_is_better}
                       for k, b in THRESHOLDS.items()},
    }


@router.get("/overview")
def overview(date: str | None = Depends(date_param), repo: Repository = Depends(get_repository)):
    return {"kpi": factory_kpi(repo, date), "nodes": factory_map(repo, date)}


@router.get("/sections/{section_id}")
def section(section_id: str, date: str | None = Depends(date_param), repo: Repository = Depends(get_repository)):
    detail = section_detail(repo, section_id, date)
    if detail is None:
        raise HTTPException(404, "Участок не найден")
    return detail


@router.get("/production")
def production(date: str | None = Depends(date_param), repo: Repository = Depends(get_repository)):
    return {"lines": line_metrics(repo, date),
            "by_date": [{"date": d, "lines": line_metrics(repo, d)} for d in repo.dates]}


@router.get("/quality")
def quality(date: str | None = Depends(date_param), repo: Repository = Depends(get_repository)):
    rows = []
    for d in repo.dates:
        if date and d != date:
            continue
        for m in line_metrics(repo, d):
            rows.append({"date": d, "section_id": m["section_id"], "section": m["section"], "produced": m["fact"],
                         "defects": m["defects"], "defect_pct": m["defect_pct"],
                         "norm_ratio": m["defect_norm_ratio"], "status": m["statuses"]["defect"]})
    return {"norm_pct": repo.targets["defect_max_pct"], "rows": rows}


@router.get("/downtime")
def downtime(date: str | None = Depends(date_param), repo: Repository = Depends(get_repository)):
    return downtime_metrics(repo, date)


@router.get("/risk")
def risk(repo: Repository = Depends(get_repository)):
    risks = section_risks(repo)
    return {
        "risks": [{**r, "recommendation": base_recommendation(r)} for r in risks],
        "bottleneck": bottleneck(repo),
        "model": {
            "type": "Прозрачная модель факторов: отклонение от норматива + тренд, взвешенная сумма (0–100)",
            "weights": WEIGHTS,
            "limitations": "Две даты наблюдений — индекс является оценкой приоритета, а не вероятностью; точность модели не заявляется.",
        },
    }


@router.get("/advice")
def advice(refresh: bool = False, repo: Repository = Depends(get_repository)):
    return get_advice(repo, refresh)


@router.get("/forecast")
def forecast(working_days: int = Query(None, ge=1, le=31), repo: Repository = Depends(get_repository)):
    return monthly_forecast(repo, working_days or settings.working_days)


@router.get("/effect")
def business_effect(
    working_days: int = Query(None, ge=1, le=31),
    defect_target_pct: float = Query(2.0, ge=0, le=10),
    downtime_cut_pct: float = Query(50.0, ge=0, le=100),
    margin_per_car: float | None = Query(None, ge=0),
    repo: Repository = Depends(get_repository),
):
    return effect(repo, working_days or settings.working_days, defect_target_pct, downtime_cut_pct, margin_per_car)


@router.get("/replay")
def replay(repo: Repository = Depends(get_repository)):
    return timeline(repo)


@router.get("/plan")
def plan(working_days: int = Query(None, ge=1, le=31), repo: Repository = Depends(get_repository)):
    return production_plan(repo, working_days or settings.working_days)
