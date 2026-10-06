"""Модель завода: участки в порядке потока, их состояние и оборудование."""
from app.repository import Repository
from app.services.kpi import downtime_metrics, line_metrics, worst


def _equipment(repo: Repository, section_name: str, date: str | None) -> list[dict]:
    """Оборудование известно только из журнала простоев — другое не выдумываем (A8)."""
    known = sorted({d["equipment"] for d in repo.downtime if d["section"] == section_name})
    events = [e for e in downtime_metrics(repo, date)["events"] if e["section"] == section_name]
    result = []
    for name in known:
        own = [e for e in events if e["equipment"] == name]
        result.append({
            "name": name,
            "status": worst([e["status"] for e in own]) if own else "ok",
            "downtime_min": sum(e["minutes"] for e in own),
            "events": own,
        })
    return result


def factory_map(repo: Repository, date: str | None = None) -> list[dict]:
    lines = {m["section_id"]: m for m in line_metrics(repo, date)}
    nodes = []
    for order, s in enumerate(repo.sections):
        m = lines.get(s["id"])
        equipment = _equipment(repo, s["name"], date)
        if m is None:
            status = "no_data"
        else:
            status = worst([m["status"], *[e["status"] for e in equipment]])
        nodes.append({
            "id": s["id"],
            "name": s["name"],
            "line": s["line"],
            "order": order,
            "status": status,
            "metrics": None if m is None else {k: m[k] for k in (
                "plan", "fact", "plan_completion_pct", "load_pct", "oee_pct", "defect_pct", "defect_norm_ratio", "statuses")},
            "equipment": equipment,
        })
    return nodes


def section_detail(repo: Repository, section_id: str, date: str | None = None) -> dict | None:
    section = repo.section_by_id(section_id)
    if section is None:
        return None
    node = next(n for n in factory_map(repo, date) if n["id"] == section_id)
    # Динамика по датам всегда целиком — для графиков тренда
    trend = [
        {"date": d, **m}
        for d in repo.dates
        for m in line_metrics(repo, d) if m["section_id"] == section_id
    ]
    return {**node, "trend": trend}
