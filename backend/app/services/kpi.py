"""Расчёт KPI и статусов. Все проценты округляются до 0,1; статусы — только через THRESHOLDS."""
from collections import defaultdict

from app.config import PLANNED_REASONS, STATUS_ORDER, THRESHOLDS
from app.repository import Repository


def r1(x: float) -> float:
    return round(x, 1)


def worst(statuses: list[str]) -> str:
    known = [s for s in statuses if s != "no_data"]
    return max(known, key=STATUS_ORDER.__getitem__) if known else "no_data"


def _filter(rows: list[dict], date: str | None) -> list[dict]:
    return [r for r in rows if date is None or r["date"] == date]


def oee_parts(plan: int, fact: int, hours: float, shifts: int, defects: int, shift_hours: float) -> dict:
    """Расчётный OEE (допущение A2). shifts — число строк-смен в агрегате."""
    availability = hours / (shift_hours * shifts)
    performance = min(fact / plan, 1.0)
    quality = 1 - defects / fact
    return {
        "availability_pct": r1(availability * 100),
        "performance_pct": r1(performance * 100),
        "quality_pct": r1(quality * 100),
        "oee_pct": r1(availability * performance * quality * 100),
    }


def line_metrics(repo: Repository, date: str | None = None) -> list[dict]:
    """Метрики по линиям за дату или период (date=None — сумма по всем датам)."""
    shift_hours = repo.targets["shift_hours"]
    quality_by_key = {(q["date"], q["section"]): q for q in repo.quality}
    acc: dict[str, dict] = {}
    for p in _filter(repo.production, date):
        section = repo.section_by_line(p["line"])
        a = acc.setdefault(p["line"], {"line": p["line"], "section_id": section["id"], "section": section["name"],
                                       "plan": 0, "fact": 0, "hours": 0.0, "load": 0, "shifts": 0, "defects": 0})
        a["plan"] += p["plan"]
        a["fact"] += p["fact"]
        a["hours"] += p["hours"]
        a["load"] += p["load_pct"]
        a["shifts"] += 1
        a["defects"] += quality_by_key[(p["date"], section["name"])]["defects"]

    result = []
    for a in acc.values():
        completion = a["fact"] / a["plan"] * 100
        defect_pct = a["defects"] / a["fact"] * 100
        parts = oee_parts(a["plan"], a["fact"], a["hours"], a["shifts"], a["defects"], shift_hours)
        statuses = {
            "plan_completion": THRESHOLDS["plan_completion_pct"].status(completion),
            "defect": THRESHOLDS["defect_pct"].status(r1(defect_pct)),
            "oee": THRESHOLDS["oee_pct"].status(parts["oee_pct"]),
        }
        result.append({
            **{k: a[k] for k in ("line", "section_id", "section", "plan", "fact", "defects", "shifts")},
            "hours": r1(a["hours"]),
            "load_pct": r1(a["load"] / a["shifts"]),  # из исходных данных
            "plan_completion_pct": r1(completion),
            "defect_pct": r1(defect_pct),
            "defect_norm_ratio": r1(defect_pct / repo.targets["defect_max_pct"]),
            **parts,
            "statuses": statuses,
            "status": worst(list(statuses.values())),
        })
    return result


def downtime_metrics(repo: Repository, date: str | None = None) -> dict:
    """Простои: события, аварийные минуты на единицу оборудования за сутки (A5), сводка."""
    rows = _filter(repo.downtime, date)
    per_equipment_day: dict[tuple, int] = defaultdict(int)
    events = []
    for d in rows:
        planned = d["reason"] in PLANNED_REASONS
        if not planned:
            per_equipment_day[(d["date"], d["equipment"])] += d["minutes"]
        section = repo.section_by_name(d["section"])
        events.append({**d, "section_id": section["id"], "planned": planned})
    for e in events:
        day_total = per_equipment_day.get((e["date"], e["equipment"]), 0)
        e["equipment_day_unplanned_min"] = day_total
        e["status"] = "ok" if e["planned"] else THRESHOLDS["downtime_min"].status(day_total)
        e["limit_usage_pct"] = r1(day_total / repo.targets["critical_downtime_max_min_per_day"] * 100)

    unplanned = [e for e in events if not e["planned"]]
    longest = max(events, key=lambda e: e["minutes"], default=None)
    per_day_total: dict[str, int] = defaultdict(int)
    for e in events:
        per_day_total[e["date"]] += e["minutes"]
    return {
        "events": sorted(events, key=lambda e: (e["date"], -e["minutes"])),
        "total_min": sum(e["minutes"] for e in events),
        "unplanned_min": sum(e["minutes"] for e in unplanned),
        "planned_min": sum(e["minutes"] for e in events if e["planned"]),
        "incidents": len(unplanned),
        "max_equipment_day_min": max(per_equipment_day.values(), default=0),
        "factory_per_day_min": dict(sorted(per_day_total.items())),
        "longest": longest,
        "status": worst([e["status"] for e in unplanned]) if unplanned else "ok",
    }


def factory_kpi(repo: Repository, date: str | None = None) -> dict:
    """Верхняя панель KPI."""
    lines = line_metrics(repo, date)
    down = downtime_metrics(repo, date)
    quality_rows = _filter(repo.quality, date)
    produced = sum(q["produced"] for q in quality_rows)
    defects = sum(q["defects"] for q in quality_rows)
    worst_defect = max(lines, key=lambda l: l["defect_pct"])
    worst_oee = min(lines, key=lambda l: l["oee_pct"])
    oee_avg = sum(l["oee_pct"] for l in lines) / len(lines)
    final = next(l for l in lines if l["section_id"] == "assembly")  # A3
    completion = final["fact"] / final["plan"] * 100

    return {
        "date": date,
        "oee": {
            "value_pct": r1(oee_avg),
            "target_pct": repo.targets["oee_min_pct"],
            "delta_pct": r1(oee_avg - repo.targets["oee_min_pct"]),
            "worst": {"section": worst_oee["section"], "value_pct": worst_oee["oee_pct"]},
            # Статус по худшей линии: среднее не должно скрывать отклонение
            "status": THRESHOLDS["oee_pct"].status(worst_oee["oee_pct"]),
            "calculated": True,
        },
        "defect": {
            "value_pct": r1(defects / produced * 100),
            "target_pct": repo.targets["defect_max_pct"],
            "worst": {"section": worst_defect["section"], "value_pct": worst_defect["defect_pct"],
                      "norm_ratio": worst_defect["defect_norm_ratio"]},
            "status": THRESHOLDS["defect_pct"].status(worst_defect["defect_pct"]),
        },
        "downtime": {
            "max_equipment_day_min": down["max_equipment_day_min"],
            "target_min": repo.targets["critical_downtime_max_min_per_day"],
            "incidents": down["incidents"],
            "total_min": down["total_min"],
            "status": down["status"],
        },
        "output": {
            "plan": final["plan"],
            "fact": final["fact"],
            "completion_pct": r1(completion),
            "status": THRESHOLDS["plan_completion_pct"].status(completion),
        },
    }
