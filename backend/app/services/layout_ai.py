"""AI-рекомендация по изменению в редакторе 3D.

Расчёты (столкновения, «было → стало», свободное место) делает фронтенд-модель; сюда приходит их итог.
Claude формулирует риски и следующий шаг; без ключа — правила. Чисел Claude не придумывает: только переданные.
"""
import json
import logging

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


def rules_assess(p: dict) -> dict:
    risks = []
    if p.get("conflicts"):
        risks.append("Пересечения габаритов: " + ", ".join(sorted(set(p["conflicts"])))[:200])
    b, a = p.get("before", {}), p.get("after", {})
    if b.get("bottleneck") and a.get("bottleneck") and b["bottleneck"] != a["bottleneck"]:
        risks.append(f"Узкое место смещается: {b['bottleneck']} → {a['bottleneck']} — проверить новый ограничивающий участок")
    risks.append("Влияние оборудования на темп — допущение модели; нужно подтвердить пилотом или расчётом технолога")
    dm = (a.get("monthly") or 0) - (b.get("monthly") or 0)
    if p.get("conflicts"):
        step, rec = "fix_layout", "Сначала устранить пересечения — переместить объект на свободное место участка."
    elif dm > 0:
        step, rec = "pilot", f"Изменение даёт +{dm} авто/мес в сценарной модели — проверить на одной смене и сравнить факт."
    elif dm < 0:
        step, rec = "reject", f"Изменение снижает устойчивый выпуск на {-dm} авто/мес — не рекомендуется без компенсации."
    else:
        step, rec = "expert", "Выпуск в модели не меняется — оценить качественный эффект (безопасность, видимость, стабильность) с экспертом."
    return {"summary": f"Устойчивый выпуск {b.get('monthly')} → {a.get('monthly')} авто/мес.", "risks": risks[:4],
            "next_step": step, "recommendation": rec, "source": "rules"}


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
