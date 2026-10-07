"""AI-рекомендация по изменению в редакторе 3D.

Расчёты (столкновения, «было → стало», свободное место) делает фронтенд-модель; сюда приходит их итог.
Claude формулирует риски и следующий шаг; без ключа — правила. Чисел Claude не придумывает: только переданные.
"""
import json
import logging
import re

import anthropic

from app.config import settings

log = logging.getLogger(__name__)

SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "risks": {"type": "array", "items": {"type": "string"}},
        "next_step": {"type": "string", "enum": ["pilot", "fix_layout", "expert", "reject"]},
        "recommendation": {"type": "string"},
    },
    "required": ["summary", "risks", "next_step", "recommendation"],
    "additionalProperties": False,
}

SYSTEM = """Ты — инженер-технолог завода АЛЛЮР. Руководитель смоделировал изменение расстановки оборудования в цифровом двойнике.
Тебе передан итог расчёта: список изменений, «было → стало» (устойчивый выпуск, узкое место), конфликты габаритов, последствия и допущения модели.
Дай короткую оценку: в чём смысл изменения, 2–4 риска, следующий шаг и одну конкретную рекомендацию.
Правила: используй только переданные числа; помни, что влияние оборудования на темп — допущения модели, а не измерение; если есть конфликты — следующий шаг fix_layout. По-русски, коротко, без markdown."""


# Типичные риски по виду оборудования (ищем по названию в списке изменений)
CHANGE_RISKS = [
    (r"робот", "Робот: наладка программы и ограждение ячейки, простой участка на время монтажа"),
    (r"кондуктор", "Кондуктор: изготовление оснастки и проверка геометрии на первых кузовах"),
    (r"рабоч\w* пост", "Рабочий пост: нужен оператор на каждую смену"),
    (r"датчик", "Датчик: калибровка и ложные срабатывания; данные нужно завести в двойник"),
    (r"буфер", "Буфер: занимает площадь и проходы; сглаживает остановки, но не поднимает темп"),
    (r"компрессор", "Компрессорная: перенос магистралей требует остановки участка"),
    (r"пост контроля|машинн", "Пост контроля: ловит брак раньше, но не устраняет его причину"),
    (r"андон", "Андон: без регламента реакции сигнал игнорируют"),
]


def rules_assess(p: dict) -> dict:
    """Оценка без LLM по итогам расчёта: что изменилось, что будет с выпуском и узким местом, риски по видам оборудования."""
    changes = [c for c in p.get("changes", []) if c]
    b, a = p.get("before", {}), p.get("after", {})
    bm, am = b.get("monthly") or 0, a.get("monthly") or 0
    dm = am - bm
    bb, ab = b.get("bottleneck"), a.get("bottleneck")
    conflicts = sorted(set(p.get("conflicts") or []))

    risks = []
    if conflicts:
        risks.append("Пересечения габаритов: " + ", ".join(conflicts)[:200])
    if bb and ab and bb != ab:
        risks.append(f"Узкое место смещается: {bb} → {ab} — теперь выпуск ограничивает «{ab}»")
    joined = " ".join(changes).lower()
    risks += [text for rx, text in CHANGE_RISKS if re.search(rx, joined)]
    if any(c.lower().startswith("убран") for c in changes):
        risks.append("Убранное оборудование выполняло работу — проверить, кто её возьмёт")
    risks.append("Влияние оборудования на темп — допущение модели; подтвердить пилотом или расчётом технолога")

    head = ("; ".join(changes[:3]) + (f" и ещё {len(changes) - 3}" if len(changes) > 3 else "")) if changes else "Изменений нет"
    summary = f"{head}. Устойчивый выпуск {bm} → {am} авто/мес ({'+' if dm > 0 else ''}{dm})"
    summary += f", узкое место смещается с «{bb}» на «{ab}»." if bb and ab and bb != ab else (f", узкое место остаётся «{ab}»." if ab else ".")

    if conflicts:
        step, rec = "fix_layout", f"Сначала устранить пересечения ({len(conflicts)}): переместить объект на свободное место участка и пересчитать."
    elif dm > 0:
        step = "pilot"
        rec = f"Проверить на одной смене: замерить темп участка и сравнить с моделью (+{dm} авто/мес)."
        if bb and ab and bb != ab:
            rec += f" После изменения выпуск ограничивает «{ab}» — следующая мера должна быть там."
    elif dm < 0:
        step, rec = "reject", f"Изменение снижает устойчивый выпуск на {-dm} авто/мес — не внедрять без компенсации на участке «{ab or bb}»."
    else:
        step, rec = "expert", "Выпуск в модели не меняется — эффект качественный (видимость, стабильность, логистика): оценить с технологом."
    return {"summary": summary, "risks": risks[:4], "next_step": step, "recommendation": rec, "source": "rules"}


def assess_layout(payload: dict) -> dict:
    if settings.anthropic_api_key:
        try:
            client = anthropic.Anthropic(api_key=settings.anthropic_api_key, timeout=settings.llm_timeout_s, max_retries=1)
            r = client.beta.messages.create(
                model=settings.anthropic_model, max_tokens=3000, system=SYSTEM,
                messages=[{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
                output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
                betas=["server-side-fallback-2026-07-01"], fallbacks="default",
            )
            if r.stop_reason == "end_turn":
                data = json.loads(next(b.text for b in r.content if b.type == "text"))
                if payload.get("conflicts"):
                    data["next_step"] = "fix_layout"  # конфликт габаритов — жёсткое правило, не на усмотрение модели
                return {**data, "source": "claude", "model": r.model}
        except (anthropic.APIError, RuntimeError, ValueError, KeyError, StopIteration) as e:
            log.warning("Оценка изменения через Claude не удалась: %s", e)
    return rules_assess(payload)
