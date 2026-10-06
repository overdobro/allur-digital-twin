"""Сверка KPI с ручным расчётом по тестовым данным."""
import pytest

from app.config import THRESHOLDS
from app.repository import get_repository
from app.services.kpi import downtime_metrics, factory_kpi, line_metrics

repo = get_repository()


def by_line(date):
    return {m["section_id"]: m for m in line_metrics(repo, date)}


@pytest.mark.parametrize("date,section,oee", [
    ("2026-10-01", "welding", 94.2), ("2026-10-01", "painting", 86.7), ("2026-10-01", "assembly", 99.2),
    ("2026-10-02", "welding", 81.0), ("2026-10-02", "painting", 88.2), ("2026-10-02", "assembly", 96.3),
])
def test_oee(date, section, oee):
    assert by_line(date)[section]["oee_pct"] == oee


def test_tz_production_table():
    m = by_line("2026-10-01")
    assert [m[s]["plan_completion_pct"] for s in ("welding", "painting", "assembly")] == [98.3, 95.8, 100.8]
    assert m["painting"]["statuses"]["plan_completion"] == "warning"


def test_painting_defect_critical_with_ratio():
    p = by_line("2026-10-02")["painting"]
    assert p["defect_pct"] == 5.2 and p["defect_norm_ratio"] == 2.6
    assert p["status"] == "critical"


def test_welding_day2_oee_below_target():
    w = by_line("2026-10-02")["welding"]
    assert w["statuses"]["oee"] == "warning"
    assert w["statuses"]["defect"] == "warning"  # 2,7%
    assert w["status"] == "critical"  # выполнение плана 92,5% < 95


def test_period_aggregation():
    w = by_line(None)["welding"]
    assert (w["plan"], w["fact"], w["shifts"], w["defects"]) == (240, 229, 2, 5)
    assert w["oee_pct"] == 87.5


def test_downtime():
    d = downtime_metrics(repo)
    assert d["total_min"] == 150 and d["planned_min"] == 30 and d["incidents"] == 3
    assert d["longest"]["equipment"] == "Конвейер-03"
    assert d["max_equipment_day_min"] == 55
    assert d["status"] == "warning"  # 55 мин: 45–60
    assert d["factory_per_day_min"] == {"2026-10-01": 65, "2026-10-02": 85}
    abb04 = next(e for e in d["events"] if e["equipment"] == "ABB-04")
    assert abb04["planned"] and abb04["equipment_day_unplanned_min"] == 0


def test_factory_kpi_day2():
    k = factory_kpi(repo, "2026-10-02")
    assert k["output"]["fact"] == 119  # A3: выход Сборки
    assert k["defect"]["worst"]["section"] == "Окраска"
    assert k["defect"]["status"] == "critical"
    assert k["oee"]["worst"] == {"section": "Сварка", "value_pct": 81.0}
    assert k["oee"]["status"] == "warning"


@pytest.mark.parametrize("metric,value,expected", [
    ("defect_pct", 2.0, "ok"), ("defect_pct", 2.7, "warning"), ("defect_pct", 3.0, "warning"), ("defect_pct", 3.5, "critical"),
    ("oee_pct", 85.0, "ok"), ("oee_pct", 81.0, "warning"), ("oee_pct", 74.9, "critical"),
    ("downtime_min", 40, "ok"), ("downtime_min", 45, "warning"), ("downtime_min", 60, "warning"), ("downtime_min", 61, "critical"),
])
def test_thresholds(metric, value, expected):
    assert THRESHOLDS[metric].status(value) == expected
