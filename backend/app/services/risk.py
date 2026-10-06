"""Risk Engine + Bottleneck Detector.

Прозрачная модель: индекс риска = сумма вкладов факторов (отклонение от норматива + тренд).
Каждый фактор несёт ссылку на исходные данные. Обучаемой модели нет: двух дней данных для неё мало,
поэтому точность не заявляется (см. ТЗ, раздел 9).
"""
from app.repository import Repository
from app.services.kpi import downtime_metrics, line_metrics, r1

# Максимальный вклад факторов в индекс (сумма = 100)
WEIGHTS = {
    "defect_gap": 25,      # превышение нормы брака
    "defect_trend": 15,    # рост брака
    "oee_gap": 20,         # OEE ниже цели
    "oee_trend": 15,       # падение OEE
    "output_gap": 10,      # недовыполнение плана
    "downtime": 15,        # аварийные простои оборудования / повторяемость
}

LEVELS = [(50, "high", "Высокий"), (25, "medium", "Средний"), (0, "low", "Низкий")]

# Типовые действия по причинам простоев и типам отклонений (экспертные шаблоны)
REASON_ACTIONS = {
    "Замена фильтра": "проверить Камеру-02 после замены фильтра: посадку и герметичность фильтра, перепад давления, расход воздуха",
    "Ошибка датчика": "провести диагностику и калибровку датчиков ABB-01",
    "Плановое ТО": "проверить ABB-04 после ТО: настройки режима и качество сварных точек на первых кузовах",
    "Обрыв цепи": "осмотреть цепь Конвейера-03, проверить натяжение и износ, держать запасную цепь у линии",
}
TYPE_ACTIONS = {
    "quality": "до начала следующей смены проверить параметры процесса и ввести усиленный выборочный контроль",
    "throughput": "разобрать потери рабочего времени по сменам и закрепить ответственного за восстановление темпа",
    "equipment": "внести узел в план предиктивного ТО и отслеживать повторы",
}


def _clip(x: float) -> float:
    return max(0.0, min(1.0, x))


def _level(index: float) -> dict:
    for bound, code, label in LEVELS:
        if index >= bound:
            return {"code": code, "label": label}
    return {"code": "low", "label": "Низкий"}


def _fmt(x: float) -> str:
    return f"{x:.1f}".replace(".", ",")


def section_risks(repo: Repository) -> list[dict]:
    t = repo.targets
    dates = repo.dates
    first, last = dates[0], dates[-1]
    m_first = {m["section_id"]: m for m in line_metrics(repo, first)}
    m_last = {m["section_id"]: m for m in line_metrics(repo, last)}
    down = downtime_metrics(repo)["events"]

    risks = []
    for sid, cur in m_last.items():
        prev = m_first[sid]
        factors = []

        def add(key: str, share: float, evidence: str):
            if share > 0:
                factors.append({"key": key, "contribution": r1(WEIGHTS[key] * _clip(share)), "evidence": evidence})

        if cur["defect_pct"] > t["defect_max_pct"]:
            add("defect_gap", (cur["defect_norm_ratio"] - 1) / 1.5,
                f"Брак {_fmt(cur['defect_pct'])}% при норме ≤{t['defect_max_pct']}% (в {_fmt(cur['defect_norm_ratio'])} раза выше)")
        d_def = cur["defect_pct"] - prev["defect_pct"]
        if d_def > 0:
            add("defect_trend", d_def / 2, f"Брак растёт: {_fmt(prev['defect_pct'])}% → {_fmt(cur['defect_pct'])}%")
        if cur["oee_pct"] < t["oee_min_pct"]:
            add("oee_gap", (t["oee_min_pct"] - cur["oee_pct"]) / 10,
                f"Расчётный OEE {_fmt(cur['oee_pct'])}% ниже цели {t['oee_min_pct']}%")
        d_oee = cur["oee_pct"] - prev["oee_pct"]
        if d_oee < 0:
            falling = [name for key, name in (("availability_pct", "доступность"), ("performance_pct", "производительность"),
                                              ("quality_pct", "качество")) if cur[key] < prev[key]]
            add("oee_trend", -d_oee / 10,
                f"OEE падает: {_fmt(prev['oee_pct'])}% → {_fmt(cur['oee_pct'])}%; снижаются: {', '.join(falling)}")
        if cur["plan_completion_pct"] < 100:
            add("output_gap", (100 - cur["plan_completion_pct"]) / 10,
                f"План {cur['plan']}, факт {cur['fact']} ({_fmt(cur['plan_completion_pct'])}%); загрузка {_fmt(prev['load_pct'])}% → {_fmt(cur['load_pct'])}%")
        own = [e for e in down if e["section_id"] == sid]
        if own:
            worst_min = max(e["equipment_day_unplanned_min"] for e in own)
            share = worst_min / t["critical_downtime_max_min_per_day"] + 0.25 * (len(own) - 1)
            listed = "; ".join(f"{e['equipment']} — {e['reason']}, {e['minutes']} мин ({e['date'][8:]}.10)" for e in own)
            add("downtime", share, f"Простои за период: {listed}")

        index = r1(sum(f["contribution"] for f in factors))
        quality_part = sum(f["contribution"] for f in factors if f["key"].startswith("defect"))
        throughput_part = sum(f["contribution"] for f in factors if f["key"] in ("oee_gap", "oee_trend", "output_gap"))
        equipment_part = sum(f["contribution"] for f in factors if f["key"] == "downtime")
        kind = max((("quality", quality_part), ("throughput", throughput_part), ("equipment", equipment_part)),
                   key=lambda kv: kv[1])[0]
        # Уже случилось — текущий показатель за пределом нормы; назревает — нормы пока держатся либо отклонение растёт по тренду
        realized = cur["statuses"]["defect"] == "critical"
        risks.append({
            "section_id": sid,
            "section": cur["section"],
            "date": last,
            "risk_index": index,
            "level": _level(index),
            "kind": kind,
            "stage": "realized" if realized else "emerging",
            "factors": sorted(factors, key=lambda f: -f["contribution"]),
            "downtime_events": own,
        })
    # Уже случившиеся критичные отклонения — первыми, далее по индексу риска
    return sorted(risks, key=lambda r: (r["stage"] != "realized", -r["risk_index"]))


def bottleneck(repo: Repository) -> dict:
    """Узкое место = участок с наибольшими потерями годных единиц к плану (недовыпуск + брак)."""
    def losses(date: str | None) -> list[dict]:
        rows = []
        for m in line_metrics(repo, date):
            under = max(m["plan"] - m["fact"], 0)
            rows.append({"section_id": m["section_id"], "section": m["section"], "plan": m["plan"],
                         "good": m["fact"] - m["defects"], "lost_units": under + m["defects"],
                         "underproduction": under, "defects": m["defects"]})
        return sorted(rows, key=lambda r: -r["lost_units"])

    by_date = [{"date": d, "ranking": losses(d)} for d in repo.dates]
    period = losses(None)
    current = by_date[-1]["ranking"][0]
    previous = by_date[-2]["ranking"][0] if len(by_date) > 1 else current
    return {
        "current": {**current, "date": by_date[-1]["date"]},
        "period": period[0],
        "by_date": by_date,
        "shifted": current["section_id"] != previous["section_id"],
        "previous": {**previous, "date": by_date[-2]["date"]} if len(by_date) > 1 else None,
        "method": "Потери годных единиц к плану = (план − факт) + брак. Максимум потерь — узкое место.",
    }


def base_recommendation(risk: dict) -> dict:
    """Шаблонная рекомендация «что случилось → почему → риск → что сделать». Работает без LLM."""
    f = risk["factors"]
    what = f[0]["evidence"] if f else "Отклонений не выявлено"
    why = [x["evidence"] for x in f[1:]] or ["Факторы риска не выявлены"]
    actions = [REASON_ACTIONS[e["reason"]] for e in risk["downtime_events"] if e["reason"] in REASON_ACTIONS]
    actions.append(TYPE_ACTIONS[risk["kind"]])
    risk_text = {
        ("realized", "quality"): f"Брак на участке «{risk['section']}» уже превышает норму и растёт — потери годных автомобилей и переделки.",
        ("emerging", "throughput"): f"При сохранении тренда «{risk['section']}» станет ограничением выпуска всего завода.",
        ("emerging", "equipment"): "Повторный отказ оборудования может превысить норму простоя 60 мин/сутки.",
    }.get((risk["stage"], risk["kind"]), f"Отклонения на участке «{risk['section']}» могут перерасти в потери выпуска.")
    if risk["stage"] == "realized" and any(e["section_id"] == risk["section_id"] for e in risk["downtime_events"]):
        why.append("Гипотеза для проверки (A7): простой оборудования участка мог повлиять на качество.")
    return {"what": what, "why": why, "risk": risk_text, "actions": [a[0].upper() + a[1:] for a in actions]}
