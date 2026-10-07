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
    """Конкретность идеи: упомянуто оборудование из данных кейса (0,5) и измеримый механизм (0,5). Считает код."""
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

KEYWORDS = {
    "painting": r"окрас|краск|лкп|камер|фильтр|катафор|грунт|полиров|влажн",
    "welding": r"свар|кондуктор|клещ|abb|геометр|кузовн",
    "assembly": r"сборк|конвейер|подвес|цеп|свадьб|двигател",
    "qc": r"тест|контрол|отк|развал|тормоз|water|дождев|диагност|vin",
    "warehouse_in": r"склад|комплектующ|погрузчик|логистик|тара",
}
OBJECT_KEYWORDS = [
    ("robot", r"робот"), ("sensor", r"датчик|сенсор|вибрац|давлени|влажн|температур"), ("buffer", r"буфер|накопител"),
    ("inspection", r"машинн\w* зрени|камер\w* контрол|сканер"), ("compressor", r"компрессор"), ("andon", r"андон|светов\w* индикац"),
]
PROBLEM_DRIVERS = {
    "painting": r"брак|дефект|фильтр|камер|влажн|краск|окрас",  # брак 5,2%, Камера-02
    "welding": r"темп|робот|геометр|abb|простой|выпуск|смен|то ",  # темп 111/120, OEE 81%
    "assembly": r"конвейер|цеп|простой|обрыв|буфер",  # Конвейер-03 — 55 мин
}
HIGH_COMPLEXITY = r"робот|линию|цех|полностью|автоматическ|машинн\w* зрени|перенос|третья смен"
LOW_COMPLEXITY = r"чек-лист|регламент|обучен|расписан|индикац|запасн|разметк|дорожк|датчик"
UNREALISTIC = r"полностью|без людей|100\s?%|никогда|все линии сразу"


def rules_evaluate(title: str, text: str, section_id: str | None, repo: Repository) -> dict:
    t = f"{title} {text}".lower()
    sec = section_id or next((s for s, rx in KEYWORDS.items() if re.search(rx, t)), None)
    risks = {r["section_id"]: r for r in section_risks(repo)}
    problem = sec in risks and risks[sec]["level"]["code"] in ("high", "medium")
    # Высокий эффект — только если идея бьёт в драйвер проблемы участка (по данным кейса)
    on_driver = bool(sec and re.search(PROBLEM_DRIVERS.get(sec, r"$^"), t))
    effect = "high" if problem and on_driver else ("medium" if sec else "low")
    complexity = "high" if re.search(HIGH_COMPLEXITY, t) else ("low" if re.search(LOW_COMPLEXITY, t) else "medium")
    realism = "low" if re.search(UNREALISTIC, t) else ("medium" if complexity == "high" else "high")
    obj = next((o for o, rx in OBJECT_KEYWORDS if re.search(rx, t)), None)
    action = "move" if re.search(r"перен|перемест", t) else "add"
    name = repo.section_by_id(sec)["name"] if sec else None
    checks = {
        "painting": ["брак окраски до и после (сейчас 5,2% при норме ≤2%)", "простои Камеры-02"],
        "welding": ["выполнение плана Сварки (02.10 — 92,5%)", "расчётный OEE Сварки (81,0%)"],
        "assembly": ["простои Конвейера-03 (02.10 — 55 мин)", "выпуск Сборки за смену"],
        "qc": ["доля дефектов, выявленных на тестовой линии", "время прохождения тестов"],
        "warehouse_in": ["задержки подачи комплектующих", "безопасность проездов"],
    }.get(sec, ["измеримый показатель эффекта", "затраты на внедрение"])
    risk_list = (["ограниченные данные: 2 дня наблюдений"] + (["нужны инвестиции и согласование с производством"] if complexity == "high" else [])
                 + (["эффект не подтверждён данными кейса"] if not problem else []))
    next_step = "expert" if realism == "low" else ("3d_check" if obj else ("pilot" if complexity == "low" else "expert"))
    summary = (f"Идея относится к участку «{name}»" + (", где сейчас есть отклонения по данным" if problem else "") + "." if name
               else "Участок не определён — уточните, к какому участку относится идея.")
    if realism == "low":
        summary += " Формулировка выглядит слишком масштабной для пилота — стоит сузить."
    return {
        "summary": summary, "section_id": sec, "realism": realism, "effect": effect, "complexity": complexity,
        "risks": risk_list[:4], "checks": checks, "next_step": next_step,
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
