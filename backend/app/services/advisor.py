"""AI-рекомендации: Claude формулирует выводы по фактам, посчитанным Risk Engine.

Claude не считает цифры — он получает готовые факторы и превращает их в управленческий текст.
Без ключа, без сети или при ошибке — шаблонные рекомендации (demo не ломается).
Результат кэшируется: данные неизменны, повторный запрос перед жюри мгновенный.
"""
import json
import logging
import threading

import anthropic

from app.config import ASSUMPTIONS, settings
from app.repository import Repository
from app.services.kpi import factory_kpi
from app.services.risk import base_recommendation, bottleneck, section_risks

log = logging.getLogger(__name__)

SYSTEM_PROMPT = """Ты — AI-аналитик цифрового двойника автомобильного завода АЛЛЮР (поток: склад комплектующих → сварка → окраска → сборка → контроль качества → склад готовой продукции).
Тебе дают уже рассчитанные факты: KPI, факторы риска по участкам с доказательствами, узкое место, допущения.
Задача — для каждого участка из списка рисков сформулировать для руководителя производства: что случилось, почему (факторы), чем это грозит, что сделать до следующей смены.

Правила:
- Используй только числа из входных данных. Не придумывай новые показатели, проценты, вероятности, деньги.
- Связь простоя оборудования с браком или выпуском — гипотеза: так и называй её («вероятно», «проверить гипотезу»).
- Действия — конкретные, проверяемые, с объектом (оборудование, параметр, участок), 2–4 на участок.
- Пиши по-русски, коротко, деловым языком, без markdown.
- summary — 1–2 предложения для директора: главная проблема сейчас и следующее узкое место."""

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "section_id": {"type": "string"},
                    "what": {"type": "string"},
                    "why": {"type": "array", "items": {"type": "string"}},
                    "risk": {"type": "string"},
                    "actions": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["section_id", "what", "why", "risk", "actions"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["summary", "items"],
    "additionalProperties": False,
}

_cache: dict | None = None
_lock = threading.Lock()


def build_context(repo: Repository) -> dict:
    risks = section_risks(repo)
    return {
        "kpi_last_date": factory_kpi(repo, repo.dates[-1]),
        "risks": [{k: r[k] for k in ("section_id", "section", "risk_index", "level", "kind", "stage", "factors")}
                  for r in risks],
        "bottleneck": {k: v for k, v in bottleneck(repo).items() if k != "by_date"},
        "assumptions": ASSUMPTIONS,
    }


def rules_advice(repo: Repository) -> dict:
    risks = section_risks(repo)
    b = bottleneck(repo)
    top = risks[0]
    summary = (f"Главная проблема сейчас — {top['section']}: {top['factors'][0]['evidence'].lower()}. "
               f"Узкое место по потерям годных за {b['current']['date'][8:]}.10 — {b['current']['section']} "
               f"({b['current']['lost_units']} ед.)")
    if b["shifted"]:
        summary += f", ранее — {b['previous']['section']}."
    else:
        summary += "."
    return {
        "source": "rules",
        "summary": summary,
        "items": [{"section_id": r["section_id"], **base_recommendation(r)} for r in risks],
    }


def claude_advice(repo: Repository) -> dict:
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key, timeout=settings.llm_timeout_s, max_retries=1)
    response = client.beta.messages.create(
        model=settings.anthropic_model,
        max_tokens=8000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": json.dumps(build_context(repo), ensure_ascii=False)}],
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": OUTPUT_SCHEMA}},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
    )
    if response.stop_reason != "end_turn":
        raise RuntimeError(f"Claude stop_reason={response.stop_reason}")
    data = json.loads(next(b.text for b in response.content if b.type == "text"))
    known = {r["section_id"] for r in section_risks(repo)}
    data["items"] = [i for i in data["items"] if i["section_id"] in known]
    if not data["items"]:
        raise RuntimeError("Пустой ответ Claude")
    return {"source": "claude", "model": response.model, **data}


def get_advice(repo: Repository, refresh: bool = False) -> dict:
    """Любой результат (в т.ч. fallback) кэшируется: без сети демо не должно ждать таймаут на каждом клике."""
    global _cache
    with _lock:
        if _cache is not None and not refresh:
            return _cache
        if not settings.anthropic_api_key:
            _cache = rules_advice(repo)
            return _cache
        try:
            _cache = claude_advice(repo)
        except anthropic.AuthenticationError:
            log.warning("Claude: неверный API-ключ — используем правила")
            _cache = {**rules_advice(repo), "fallback_reason": "auth"}
        except (anthropic.APIConnectionError, anthropic.APITimeoutError):
            log.warning("Claude: нет сети/таймаут — используем правила")
            _cache = {**rules_advice(repo), "fallback_reason": "network"}
        except (anthropic.APIStatusError, RuntimeError, ValueError, KeyError) as e:
            log.warning("Claude: ошибка %s — используем правила", e)
            _cache = {**rules_advice(repo), "fallback_reason": "error"}
        return _cache


def prewarm(repo: Repository) -> None:
    """Фоновый прогрев кэша при старте, чтобы на демо ответ был мгновенным."""
    if settings.anthropic_api_key:
        threading.Thread(target=get_advice, args=(repo,), daemon=True).start()
