import json
from types import SimpleNamespace

import anthropic
import pytest

from app.repository import get_repository
from app.services import advisor

repo = get_repository()


@pytest.fixture(autouse=True)
def reset_cache(monkeypatch):
    monkeypatch.setattr(advisor, "_cache", None)


def with_key(monkeypatch, key):
    monkeypatch.setattr(advisor, "settings", SimpleNamespace(**{**vars(advisor.settings), "anthropic_api_key": key}))


def test_rules_without_key(monkeypatch):
    with_key(monkeypatch, "")
    a = advisor.get_advice(repo)
    assert a["source"] == "rules"
    assert [i["section_id"] for i in a["items"]][0] == "painting"
    assert "Сварка" in a["summary"] and "Окраска" in a["summary"]


def test_fallback_on_network_error(monkeypatch):
    with_key(monkeypatch, "sk-test")

    def boom(_):
        raise anthropic.APIConnectionError(request=None)
    monkeypatch.setattr(advisor, "claude_advice", boom)
    a = advisor.get_advice(repo)
    assert a["source"] == "rules" and a["fallback_reason"] == "network"


def test_claude_response_parsed_and_cached(monkeypatch):
    with_key(monkeypatch, "sk-test")
    payload = {"summary": "S", "items": [{"section_id": "painting", "what": "w", "why": ["y"], "risk": "r", "actions": ["a"]},
                                         {"section_id": "ghost", "what": "w", "why": [], "risk": "r", "actions": []}]}
    calls = []

    class FakeMessages:
        def create(self, **kw):
            calls.append(kw)
            return SimpleNamespace(stop_reason="end_turn", model="claude-opus-5-5",
                                   content=[SimpleNamespace(type="text", text=json.dumps(payload))])

    monkeypatch.setattr(advisor.anthropic, "Anthropic",
                        lambda **_: SimpleNamespace(beta=SimpleNamespace(messages=FakeMessages())))
    a = advisor.get_advice(repo)
    assert a["source"] == "claude" and [i["section_id"] for i in a["items"]] == ["painting"]
    assert advisor.get_advice(repo) is a and len(calls) == 1
    assert calls[0]["fallbacks"] == "default"
    assert "5,2%" in calls[0]["messages"][0]["content"]


def test_refusal_falls_back(monkeypatch):
    with_key(monkeypatch, "sk-test")

    class FakeMessages:
        def create(self, **kw):
            return SimpleNamespace(stop_reason="refusal", content=[])

    monkeypatch.setattr(advisor.anthropic, "Anthropic",
                        lambda **_: SimpleNamespace(beta=SimpleNamespace(messages=FakeMessages())))
    assert advisor.get_advice(repo)["fallback_reason"] == "error"


def test_fallback_is_cached_until_refresh(monkeypatch):
    with_key(monkeypatch, "sk-test")
    calls = []

    def boom(_):
        calls.append(1)
        raise anthropic.APIConnectionError(request=None)
    monkeypatch.setattr(advisor, "claude_advice", boom)
    advisor.get_advice(repo)
    advisor.get_advice(repo)
    assert len(calls) == 1
    advisor.get_advice(repo, refresh=True)
    assert len(calls) == 2
