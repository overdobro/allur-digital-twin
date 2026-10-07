"""Загрузка тестовых данных. Данные неизменяемы и живут в памяти."""
import json
from functools import lru_cache
from pathlib import Path

SEED_PATH = Path(__file__).parent / "data" / "seed.json"


class Repository:
    def __init__(self, raw: dict):
        self.sections: list[dict] = raw["sections"]
        self.production: list[dict] = raw["production"]
        self.downtime: list[dict] = raw["downtime"]
        self.monthly_plan: list[dict] = raw["monthly_plan"]
        self.quality: list[dict] = raw["quality"]
        self.targets: dict = raw["targets"]

    @property
    def dates(self) -> list[str]:
        return sorted({r["date"] for r in self.production + self.quality + self.downtime})

    def section_by_name(self, name: str) -> dict | None:
        return next((s for s in self.sections if s["name"] == name), None)

    def section_by_id(self, section_id: str) -> dict | None:
        return next((s for s in self.sections if s["id"] == section_id), None)

    def section_by_line(self, line: str) -> dict | None:
        return next((s for s in self.sections if s["line"] == line), None)


@lru_cache
def get_repository() -> Repository:
    return Repository(json.loads(SEED_PATH.read_text(encoding="utf-8")))
