"""Настройки, пороги статусов и допущения. Всё, что влияет на цвета и выводы, — только здесь."""
import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Band:
    """Пороги метрики. higher_is_better определяет направление сравнения."""
    ok: float
    critical: float
    higher_is_better: bool

    def status(self, value: float) -> str:
        if self.higher_is_better:
            if value >= self.ok:
                return "ok"
            return "warning" if value >= self.critical else "critical"
        if value <= self.ok:
            return "ok"
        return "warning" if value <= self.critical else "critical"


THRESHOLDS: dict[str, Band] = {
    "defect_pct": Band(ok=2.0, critical=3.0, higher_is_better=False),
    "oee_pct": Band(ok=85.0, critical=75.0, higher_is_better=True),
    "plan_completion_pct": Band(ok=98.0, critical=95.0, higher_is_better=True),
    # Аварийный простой единицы оборудования за сутки: < 45 норма, 45–60 внимание, > 60 критично
    "downtime_min": Band(ok=44.99, critical=60.0, higher_is_better=False),
}

STATUS_ORDER = {"no_data": -1, "ok": 0, "warning": 1, "critical": 2}

PLANNED_REASONS = {"Плановое ТО"}

ASSUMPTIONS: list[dict[str, str]] = [
    {"id": "A1", "text": "Строка «Работа линий» — одна смена 8 ч (загрузка = время / 8 ч)."},
    {"id": "A2", "text": "OEE расчётный: Доступность = время / 8 ч; Производительность = факт / план (не выше 100%); Качество = 1 − брак / выпуск."},
    {"id": "A3", "text": "Выпуск завода = выход последнего участка (Сборка), а не сумма по линиям."},
    {"id": "A4", "text": "Прогноз за месяц = средний выпуск Сборки за смену × 2 смены × рабочие дни."},
    {"id": "A5", "text": "Норма простоя 60 мин/сутки применяется к единице оборудования; плановое ТО не считается аварийным простоем."},
    {"id": "A6", "text": "Простои не сверяются со временем работы линий: простой мог прийтись на другую смену."},
    {"id": "A7", "text": "Связь между простоем оборудования и браком участка — гипотеза для проверки, а не установленный факт."},
    {"id": "A8", "text": "По складам и ОТК данных нет — статус «нет данных»."},
    {"id": "A9", "text": "Факт выпуска по моделям в тестовых данных нет — расчётный: выпуск Сборки × доля модели в месячном плане (Onix 2500 / Cobalt 1800 / JAC J7 500)."},
]


@dataclass(frozen=True)
class Settings:
    working_days: int = int(os.getenv("WORKING_DAYS", "22"))
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    anthropic_model: str = os.getenv("ANTHROPIC_MODEL", "claude-opus-5-5")
    llm_timeout_s: float = float(os.getenv("LLM_TIMEOUT_S", "20"))
    cors_origins: list[str] = field(
        default_factory=lambda: os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:8080").split(",")
    )


settings = Settings()
