"""Экспорт ответов API в JSON для статического хостинга (GitHub Pages).

Ответы получаются вызовом настоящих маршрутов через TestClient — статика совпадает с живым API.
Если задан ANTHROPIC_API_KEY, рекомендации Claude генерируются один раз здесь; ключ в сборку не попадает.

    python -m app.export_static <каталог>
"""
import itertools
import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.repository import get_repository
from app.services.effect import effect_calc, effect_inputs


def file_name(path: str, params: dict | None = None) -> str:
    """Общая схема имён с фронтендом (src/api/client.ts → staticName)."""
    name = path.strip("/").replace("/", "_")
    if params:
        name += "__" + "&".join(f"{k}={v}" for k, v in sorted(params.items()))
    return name + ".json"


def requests() -> list[tuple[str, dict | None]]:
    repo = get_repository()
    dates: list[str | None] = [None, *repo.dates]
    reqs: list[tuple[str, dict | None]] = [(p, None) for p in ("/meta", "/risk", "/advice", "/forecast", "/effect", "/replay", "/plan")]
    for path, d in itertools.product(("/overview", "/production", "/quality", "/downtime"), dates):
        reqs.append((path, {"date": d} if d else None))
    for s, d in itertools.product([s for s in repo.sections if s["line"]], dates):
        reqs.append((f"/sections/{s['id']}", {"date": d} if d else None))
    return reqs


def main(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    client = TestClient(app)
    for path, params in requests():
        r = client.get("/api" + path, params=params)
        r.raise_for_status()
        (out / file_name(path, params)).write_text(json.dumps(r.json(), ensure_ascii=False), encoding="utf-8")

    repo = get_repository()
    inputs = effect_inputs(repo)
    (out / "effect-inputs.json").write_text(json.dumps(inputs, ensure_ascii=False), encoding="utf-8")
    advice = json.loads((out / "advice.json").read_text(encoding="utf-8"))
    (out / "health.json").write_text(json.dumps({"status": "ok", "llm": advice["source"] == "claude", "static": True}), encoding="utf-8")

    # Эталон для теста фронтенда: TS-копия формул обязана давать тот же результат
    cases = [
        {"params": {"working_days": wd, "defect_target_pct": dt, "downtime_cut_pct": dc, "margin_per_car": m},
         "result": effect_calc(inputs, wd, dt, dc, m)}
        for wd, dt, dc, m in [(22, 2.0, 50.0, None), (21, 1.5, 30.0, 1_000_000), (23, 0.0, 100.0, 2_500_000.5),
                              (1, 5.0, 0.0, None), (31, 4.33, 12.5, 777), (20, 2.5, 75.0, None)]
    ]
    (out / "effect-cases.json").write_text(json.dumps(cases, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Экспортировано {len(list(out.glob('*.json')))} файлов в {out} · рекомендации: {advice['source']}"
          f"{' (' + settings.anthropic_model + ')' if advice['source'] == 'claude' else ''}")


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "static-api"))
