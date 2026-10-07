"""AI-оценка идей сотрудников и обучающихся.

Claude получает идею и контекст завода (KPI, риски, узкое место, оборудование) и возвращает
структурированную оценку по параметрам из плана функционала. Без ключа или при ошибке — правила.
Итоговый балл для рейтинга считает код по прозрачной формуле, а не модель: так рейтинг воспроизводим.
AI не принимает решение о гранте — только предварительный анализ.
"""
import json
import logging
import re

import anthropic

from app.config import settings
from app.repository import Repository
from app.services.kpi import factory_kpi
from app.services.risk import bottleneck, section_risks

log = logging.getLogger(__name__)

LEVEL3 = ["low", "medium", "high"]
NEXT_STEPS = ["pilot", "3d_check", "expert"]
# Объекты каталога редактора 3D, которые идея может предложить добавить/переместить/убрать
OBJECT_TYPES = ["robot", "sensor", "buffer", "workstation", "inspection", "compressor", "andon"]
SECTIONS = ["warehouse_in", "welding", "painting", "assembly", "qc", "warehouse_out"]

SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "section_id": {"type": ["string", "null"], "enum": [*SECTIONS, None]},
        "realism": {"type": "string", "enum": LEVEL3},
        "effect": {"type": "string", "enum": LEVEL3},
        "complexity": {"type": "string", "enum": LEVEL3},
        "risks": {"type": "array", "items": {"type": "string"}},
        "checks": {"type": "array", "items": {"type": "string"}},
        "next_step": {"type": "string", "enum": NEXT_STEPS},
        "scenario": {
            "type": ["object", "null"],
            "properties": {
                "action": {"type": "string", "enum": ["add", "move", "remove"]},
                "object": {"type": "string", "enum": OBJECT_TYPES},
                "section_id": {"type": "string", "enum": SECTIONS},
                "note": {"type": "string"},
            },
            "required": ["action", "object", "section_id", "note"],
            "additionalProperties": False,
        },
    },
    "required": ["summary", "section_id", "realism", "effect", "complexity", "risks", "checks", "next_step", "scenario"],
    "additionalProperties": False,
}

SYSTEM = """Ты — AI-эксперт по улучшениям на автомобильном заводе АЛЛЮР (Костанай): кузовной цех (сварка в кондукторах, пост геометрии с роботами ABB-01/ABB-04), окраска (13 катафорезных ванн, сушка, герметизация, роботизированные посты ЛКП — Камера-02 с приточкой и фильтрами), сборка CKD на подвесном конвейере (Конвейер-03), тестовая линия (развал-схождение, тормоза, Water Test, диагностика).
Оцени идею сотрудника или обучающегося АЛЛЮР Университета. Дай предварительный анализ, а не решение: решение о гранте принимает экспертная комиссия.

Правила:
- Опирайся на переданные данные завода (KPI, риски, узкое место). Не выдумывай числа, проценты, деньги.
- realism — реализуемо ли на этом заводе; effect — влияние на выпуск, брак, простои; complexity — затраты и сложность внедрения.
- risks и checks — 2–4 коротких пункта; checks — конкретные параметры для проверки (например, «брак окраски до/после», «простой Камеры-02»).
- next_step: pilot — можно пробовать сразу; 3d_check — нужно проверить изменение на цифровом двойнике; expert — нужна экспертная оценка.
- scenario — только если идея меняет расстановку оборудования (добавить/переместить/убрать объект); иначе null.
- Пиши по-русски, коротко, без markdown. Будь доброжелателен, но честен: слабую идею оценивай низко и объясняй почему."""

LEVEL_SCORE = {"low": 1, "medium": 2, "high": 3}


def score(ev: dict, specificity: float = 0.0) -> int:
    """Балл 0–100 (прозрачная формула): 90 баллов — эффект 50%, реалистичность 30%, простота внедрения 20%;
    10 баллов — конкретность (названо оборудование из данных и/или измеримый механизм)."""
    e, r, c = LEVEL_SCORE[ev["effect"]], LEVEL_SCORE[ev["realism"]], LEVEL_SCORE[ev["complexity"]]
    raw = 0.5 * e + 0.3 * r + 0.2 * (4 - c)  # 1..3
    return round((raw - 1) / 2 * 90 + 10 * max(0.0, min(1.0, specificity)))


MEASURABLE = r"датчик|табло|минут|%|процент|порог|сигнал|чек-лист|регламент|индикатор|счётчик|записью"


def _equipment_pattern(name: str) -> str:
    """«Камера-02» → основа слова + любое окончание + номер: совпадёт и «Камере-02», и «камеры 02»."""
    word, _, code = name.lower().partition("-")
    stem = word if len(word) <= 3 else word[:-1]
    return rf"{re.escape(stem)}\w*[-\s]?{re.escape(code)}" if code else re.escape(word)


def specificity(title: str, text: str, repo: Repository) -> float:
    """Конкретность идеи: упомянуто оборудование из тестовых данных (0,5) и измеримый механизм (0,5). Считает код."""
    t = f"{title} {text}".lower()
    named = any(re.search(_equipment_pattern(d["equipment"]), t) for d in repo.downtime)
    return 0.5 * named + 0.5 * bool(re.search(MEASURABLE, t))


def plant_context(repo: Repository) -> dict:
    risks = section_risks(repo)
    b = bottleneck(repo)
    return {
        "kpi": factory_kpi(repo, repo.dates[-1]),
        "risks": [{"section": r["section"], "stage": r["stage"], "top_factor": r["factors"][0]["evidence"] if r["factors"] else ""} for r in risks],
        "bottleneck": {"current": b["current"]["section"], "previous": b["previous"]["section"] if b["previous"] else None},
        "equipment_with_incidents": [{"name": d["equipment"], "section": d["section"], "reason": d["reason"], "minutes": d["minutes"]} for d in repo.downtime],
    }


# ---------- правила (без LLM) ----------

# Участок — по числу совпадений (а не по первому): «буфер окрашенных кузовов перед сборкой» — это Сборка
KEYWORDS = {
    "painting": r"окрас|покрас|краск|лкп|лак|эмал|камер|фильтр|катафор|грунт|полиров|влажн|сушк|герметиз|пыл",
    "welding": r"свар|кондуктор|клещ|abb|геометр|кузовн|подсборк|точечн",
    "assembly": r"сборк|сборщик|конвейер|подвес|цеп|свадьб|двигател|мотор|колёс|колес|салон|навесн",
    "qc": r"тест|контрол|отк|развал|тормоз|water|дождев|диагност|vin|испытан|дефектовк",
    "warehouse_in": r"склад\w* комплект|комплектующ|погрузчик|логистик|тара|поставк|стеллаж|подач\w* детал",
    "warehouse_out": r"готов\w* продукц|отгрузк|стоянк|склад\w* готов",
}
OBJECT_KEYWORDS = [
    ("robot", r"робот"), ("sensor", r"датчик|сенсор|вибрац|давлени|влажн|температур"), ("buffer", r"буфер|накопител"),
    ("inspection", r"машинн\w* зрени|камер\w* контрол|сканер"), ("compressor", r"компрессор"), ("andon", r"андон|светов\w* индикац"),
]
PROBLEM_DRIVERS = {
    "painting": r"брак|дефект|фильтр|камер|влажн|краск|окрас|пыл",  # брак 5,2%, Камера-02
    "welding": r"темп|робот|геометр|abb|простой|выпуск|смен|\bто\b",  # темп 111/120, OEE 81%
    "assembly": r"конвейер|цеп|простой|обрыв|буфер",  # Конвейер-03 — 55 мин
}

# Тип идеи: от него зависят механизм эффекта, типичные риски и что проверять. Порядок — приоритет.
KINDS: list[tuple[str, str]] = [
    ("capacity", r"трет\w* смен|дополнительн\w* смен|сверхуроч|выходн\w* дн"),
    ("people", r"обучен|тренаж|наставн|квалификац|\bar\b|\bvr\b|мотивац|геймиф|балл|конкурс"),
    ("maintenance", r"\bто\b|техобслуж|предиктив|запасн|зип|смазк|износ|ремонт"),
    ("process", r"чек-лист|регламент|стандарт|инструкц|процедур|график|расписан|пересменк|смен[аеуы]\b|смену"),
    ("digital", r"цифров|паспорт|vin|приложен|\bqr\b|табло|дашборд|экран|учёт|учет|трекинг|база данн"),
    ("logistics", r"погрузчик|дорожк|разметк|тара|подач|логист|маршрут"),
    ("safety", r"безопасн|травм|ограждени|\bсиз\b"),
]
KIND_INFO: dict[str, dict] = {
    "capacity": {"label": "увеличение рабочего времени",
                 "how": "Добавляет часы работы участка: выпуск растёт сразу, но растут и затраты на персонал.",
                 "risks": ["затраты на оплату труда и усталость персонала", "узкое место может сместиться на соседний участок"],
                 "check": "выпуск участка за дополнительные часы и брак в них"},
    "equipment": {"label": "изменение оборудования",
                  "how": "Меняет расстановку или состав оборудования — эффект на выпуск можно проверить на 3D-модели до покупки."},
    "maintenance": {"label": "мера по обслуживанию оборудования",
                    "how": "Снижает внезапные остановы: оборудование чинят до отказа, а не после.",
                    "risks": ["история отказов короткая — в данных только 2 дня", "запас ЗИП замораживает оборотные средства"],
                    "check": "число внезапных остановов и их длительность до и после"},
    "process": {"label": "организационная мера",
                "how": "Дешёвая и быстрая мера: эффект зависит от того, соблюдают ли её на каждой смене.",
                "risks": ["без контроля регламент перестают соблюдать через 2–3 недели", "добавляет время на операцию"],
                "check": "доля смен, где мера реально выполнена"},
    "people": {"label": "мера по развитию персонала",
               "how": "Работает через навыки и вовлечённость людей — эффект проявляется не сразу.",
               "risks": ["нужно время на обучение вне смены", "эффект трудно измерить быстро"],
               "check": "ошибки и брак у обученных и необученных сотрудников"},
    "digital": {"label": "цифровое решение",
                "how": "Даёт прозрачность: сам по себе выпуск не меняет, но сокращает время реакции на отклонение.",
                "risks": ["интеграция с текущими системами учёта", "данные нужно поддерживать в актуальном виде"],
                "check": "время от отклонения до реакции мастера"},
    "logistics": {"label": "изменение внутренней логистики",
                  "how": "Упорядочивает потоки материалов и транспорта внутри цеха.",
                  "risks": ["изменение маршрутов нужно согласовать с охраной труда", "временно мешает текущим проездам"],
                  "check": "время подачи комплектующих на участок"},
    "safety": {"label": "мера безопасности",
               "how": "Снижает риск травм и аварий — эффект в рисках, а не в выпуске.",
               "risks": ["нужно согласование с охраной труда"],
               "check": "число нарушений и инцидентов"},
    "other": {"label": "предложение", "how": "Механизм эффекта из текста не ясен — его стоит описать конкретнее.",
              "risks": [], "check": "измеримый показатель эффекта"},
}
OBJECT_RISKS = {
    "robot": ["наладка и программирование робота, ограждение ячейки", "простой участка на время монтажа"],
    "sensor": ["калибровка и ложные срабатывания", "интеграция данных с цифровым двойником"],
    "buffer": ["занимает площадь и может перекрыть проходы", "буфер сглаживает остановки, но не поднимает темп"],
    "inspection": ["обучение модели на дефектах, ложные срабатывания", "камеры ловят брак, а не устраняют причину"],
    "compressor": ["работы с магистралями требуют остановки участка", "эффект на брак — гипотеза"],
    "andon": ["без регламента реакции сигнал игнорируют", "в модели выпуска эффекта нет"],
}
ACTION_WORD = {"add": "добавить", "move": "переместить", "remove": "убрать"}
OBJECT_WORD = {"robot": "робот", "sensor": "датчик", "buffer": "буфер", "inspection": "пост контроля",
               "compressor": "компрессорная", "andon": "андон", "workstation": "рабочий пост"}


def _lc(s: str) -> str:
    """Первая буква строчная, кроме аббревиатур (OEE, ABB-01)."""
    return s if len(s) > 1 and s[1].isupper() else s[:1].lower() + s[1:]


def idea_kind(t: str, obj: str | None) -> str:
    if obj:
        return "equipment"
    return next((k for k, rx in KINDS if re.search(rx, t)), "other")


def detect_section(t: str, repo: Repository) -> str | None:
    """Участок по числу совпадений ключевых слов; оборудование из данных (ABB-01, Камера-02…) весит больше."""
    counts = {s: len(re.findall(rx, t)) for s, rx in KEYWORDS.items()}
    by_name = {x["name"]: x["id"] for x in repo.sections}
    for d in repo.downtime:
        if re.search(_equipment_pattern(d["equipment"]), t) and d["section"] in by_name:
            counts[by_name[d["section"]]] += 2
    best = max(counts.items(), key=lambda kv: kv[1])
    return best[0] if best[1] > 0 else None


HIGH_COMPLEXITY = r"робот\w* на|нов\w* робот|втор\w* робот|трет\w* робот|линию|цех\b|полностью|автоматическ|машинн\w* зрени|перенос\w* компрессор|третья смен"
LOW_COMPLEXITY = r"чек-лист|регламент|обучен|расписан|индикац|запасн|разметк|дорожк|датчик"
UNREALISTIC = r"полностью|без людей|100\s?%|никогда|все линии сразу"


def scenario_from_text(t: str) -> tuple[str | None, str]:
    """Объект — тот, что упомянут в тексте первым. «Перенести/убрать X» — только если X стоит сразу после глагола:
    «Переносить плановое ТО роботов» — это о графике, а не о перемещении робота, сценария для 3D нет."""
    hits = [(m.start(), o) for o, rx in OBJECT_KEYWORDS if (m := re.search(rx, t))]
    obj = min(hits)[1] if hits else None
    verb = re.search(r"(перен\w*|перемест\w*|убра\w*|демонтир\w*)\s+((?:\S+\s+){0,1}\S+)", t)
    if not verb or not obj:
        return obj, "add"
    target = dict(OBJECT_KEYWORDS)[obj]
    if not re.search(target, verb.group(2)):
        return None, "add"
    return obj, "remove" if verb.group(1).startswith(("убра", "демонтир")) else "move"


def rules_evaluate(title: str, text: str, section_id: str | None, repo: Repository) -> dict:
    """Оценка без LLM: участок, тип идеи и её связь с реальной проблемой участка по тестовым данным."""
    t = f"{title} {text}".lower()
    sec = section_id or detect_section(t, repo)
    risks_by = {r["section_id"]: r for r in section_risks(repo)}
    sr = risks_by.get(sec)
    problem = bool(sr and sr["level"]["code"] in ("high", "medium"))
    evidence = sr["factors"][0]["evidence"] if sr and sr["factors"] else None
    # Высокий эффект — только если идея бьёт в драйвер проблемы участка (по тестовым данным)
    on_driver = bool(sec and re.search(PROBLEM_DRIVERS.get(sec, r"$^"), t))
    obj, action = scenario_from_text(t)
    kind = idea_kind(t, obj)
    info = KIND_INFO[kind]
    effect = "high" if problem and on_driver else ("medium" if sec else "low")
    if kind in ("digital", "people", "safety") and effect == "high":
        effect = "medium"  # прозрачность и навыки сами выпуск не меняют — эффект косвенный
    complexity = "high" if re.search(HIGH_COMPLEXITY, t) else ("low" if re.search(LOW_COMPLEXITY, t) or kind in ("process", "maintenance") else "medium")
    realism = "low" if re.search(UNREALISTIC, t) else ("medium" if complexity == "high" else "high")
    name = repo.section_by_id(sec)["name"] if sec else None

    checks = {
        "painting": ["брак окраски до и после (сейчас 5,2% при норме ≤2%)", "простои Камеры-02"],
        "welding": ["выполнение плана Сварки (02.10 — 92,5%)", "расчётный OEE Сварки (81,0%)"],
        "assembly": ["простои Конвейера-03 (02.10 — 55 мин)", "выпуск Сборки за смену"],
        "qc": ["доля дефектов, выявленных на тестовой линии", "время прохождения тестов"],
        "warehouse_in": ["задержки подачи комплектующих", "безопасность проездов"],
        "warehouse_out": ["время от схода с линии до отгрузки", "повреждения при хранении"],
    }.get(sec, ["измеримый показатель эффекта", "затраты на внедрение"])
    if info.get("check"):
        checks = checks + [info["check"]]

    risk_list = list(OBJECT_RISKS.get(obj, []) if kind == "equipment" else info.get("risks", []))
    if complexity == "high" and kind != "equipment":
        risk_list.append("нужны инвестиции и согласование с производством")
    if not problem:
        risk_list.append("эффект не подтверждён тестовыми данными: на участке нет острых отклонений")
    risk_list.append("ограниченные данные: 2 дня наблюдений")

    next_step = "expert" if realism == "low" else ("3d_check" if obj else ("pilot" if complexity == "low" else "expert"))

    if not name:
        summary = f"Это {info['label']}, но участок не определён — уточните, на каком участке её внедрять, тогда оценка будет точнее."
    else:
        summary = f"Это {info['label']} на участке «{name}»."
        if problem and on_driver and evidence and kind in ("digital", "people", "safety"):
            summary += f" Идея связана с главной проблемой участка ({_lc(evidence)}), но действует косвенно."
        elif problem and on_driver and evidence:
            summary += f" Идея бьёт в главную проблему участка: {_lc(evidence)}."
        elif problem and evidence:
            summary += f" На участке есть отклонение ({_lc(evidence)}), но идея направлена не на него — эффект для плана ниже."
        else:
            summary += " По тестовым данным острых отклонений на участке нет — эффект скорее поддерживающий."
    summary += " " + info["how"]
    if obj and sec:
        summary += f" Предлагаемое изменение для 3D: {ACTION_WORD[action]} «{OBJECT_WORD.get(obj, obj)}»."
    if realism == "low":
        summary += " Формулировка слишком масштабная для пилота — стоит сузить до одного поста или участка."
    return {
        "summary": summary, "section_id": sec, "realism": realism, "effect": effect, "complexity": complexity,
        "risks": risk_list[:4], "checks": checks[:3], "next_step": next_step,
        "scenario": {"action": action, "object": obj, "section_id": sec, "note": "Предложено правилами по тексту идеи"} if obj and sec else None,
    }


# ---------- Claude ----------

def claude_evaluate(title: str, text: str, section_id: str | None, repo: Repository) -> tuple[dict, str]:
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key, timeout=settings.llm_timeout_s, max_retries=1)
    payload = {"idea": {"title": title, "text": text, "section_hint": section_id}, "plant": plant_context(repo)}
    response = client.beta.messages.create(
        model=settings.anthropic_model,
        max_tokens=4000,
        system=SYSTEM,
        messages=[{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
    )
    if response.stop_reason != "end_turn":
        raise RuntimeError(f"stop_reason={response.stop_reason}")
    data = json.loads(next(b.text for b in response.content if b.type == "text"))
    if section_id:
        data["section_id"] = section_id  # участок, выбранный автором, важнее догадки модели
    return data, response.model


def evaluate_offline(title: str, text: str, section_id: str | None, repo: Repository) -> dict:
    """Оценка только правилами (наполнение демо-идеями при старте не должно зависеть от сети)."""
    ev = rules_evaluate(title, text, section_id, repo)
    sp = specificity(title, text, repo)
    return {**ev, "specificity": sp, "score": score(ev, sp), "source": "rules", "model": None, "fallback_reason": None}


def evaluate(title: str, text: str, section_id: str | None, repo: Repository) -> dict:
    """Оценка идеи с источником; любой сбой LLM → правила (с причиной)."""
    ev, source, model, reason = None, "rules", None, None
    if settings.anthropic_api_key:
        try:
            ev, model = claude_evaluate(title, text, section_id, repo)
            source = "claude"
        except anthropic.AuthenticationError:
            reason = "auth"
        except (anthropic.APIConnectionError, anthropic.APITimeoutError):
            reason = "network"
        except (anthropic.APIStatusError, RuntimeError, ValueError, KeyError, StopIteration) as e:
            log.warning("Оценка идеи через Claude не удалась: %s", e)
            reason = "error"
    if ev is None:
        ev = rules_evaluate(title, text, section_id, repo)
    # Сценарий без участка или объекта бесполезен для редактора
    sc = ev.get("scenario")
    if sc and (sc.get("object") not in OBJECT_TYPES or sc.get("section_id") not in SECTIONS):
        ev["scenario"] = None
    sp = specificity(title, text, repo)
    return {**ev, "specificity": sp, "score": score(ev, sp), "source": source, "model": model, "fallback_reason": reason}
