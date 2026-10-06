"""Хронология для режима воспроизведения («близко к реальному времени»).

Порядок событий внутри дня — по потоку участков. Время суток в данных отсутствует,
поэтому шаги нумеруются, а не привязываются к часам (не выдумываем таймстемпы).
"""
from app.repository import Repository
from app.services.kpi import downtime_metrics, line_metrics, worst
from app.services.twin import factory_map


def _fmt(x: float) -> str:
    return f"{x:g}".replace(".", ",")


def timeline(repo: Repository) -> dict:
    steps = []
    state: dict[str, str] = {n["id"]: "no_data" for n in factory_map(repo)}

    def push(date: str, kind: str, section_id: str | None, severity: str, text: str):
        steps.append({"index": len(steps), "date": date, "kind": kind, "section_id": section_id,
                      "severity": severity, "text": text, "nodes": dict(state)})

    for date in repo.dates:
        day_map = {n["id"]: n for n in factory_map(repo, date)}
        lines = {m["section_id"]: m for m in line_metrics(repo, date)}
        events = downtime_metrics(repo, date)["events"]
        push(date, "day", None, "info", f"Начало смены {date[8:]}.{date[5:7]}")
        for s in repo.sections:
            m = lines.get(s["id"])
            if m is None:
                continue
            state[s["id"]] = worst([m["statuses"]["plan_completion"], m["statuses"]["oee"]])
            push(date, "production", s["id"], m["statuses"]["plan_completion"],
                 f"{s['name']}: факт {m['fact']} из {m['plan']} ({_fmt(m['plan_completion_pct'])}%), OEE {_fmt(m['oee_pct'])}%")
            for e in (e for e in events if e["section_id"] == s["id"]):
                state[s["id"]] = worst([state[s["id"]], e["status"]])
                text = (f"{e['equipment']}: плановое ТО — {e['minutes']} мин" if e["planned"] else
                        f"{e['equipment']}: аварийный простой — {e['reason'].lower()}, {e['minutes']} мин")
                push(date, "downtime", s["id"], e["status"], text)
            state[s["id"]] = day_map[s["id"]]["status"]
            sev = m["statuses"]["defect"]
            extra = f" — норма ≤{repo.targets['defect_max_pct']}%, превышение в {_fmt(m['defect_norm_ratio'])} раза" if sev != "ok" else ""
            push(date, "quality", s["id"], sev, f"{s['name']}: брак {m['defects']} из {m['fact']} ({_fmt(m['defect_pct'])}%){extra}")
    return {"steps": steps, "total": len(steps)}
