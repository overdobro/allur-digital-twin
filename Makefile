# Цифровой двойник завода АЛЛЮР — команды
.DEFAULT_GOAL := help
APP_PORT ?= 8080

help: ## Список команд
	@grep -E '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

env: ## Создать .env из шаблона (если нет)
	@test -f .env || (cp .env.example .env && echo ".env создан — впишите ANTHROPIC_API_KEY (необязательно)")

up: env ## Собрать и запустить (http://localhost:8080)
	docker compose up -d --build
	@echo "Готово: http://localhost:$(APP_PORT)"

down: ## Остановить
	docker compose down

restart: down up ## Перезапустить

logs: ## Логи (Ctrl+C — выход)
	docker compose logs -f --tail=100

ps: ## Статус контейнеров
	docker compose ps

health: ## Проверить API и режим LLM
	@curl -fsS http://localhost:$(APP_PORT)/api/health && echo

install: ## Локальные зависимости для разработки
	cd backend && python3 -m venv .venv && .venv/bin/pip install -q -r requirements-dev.txt
	cd frontend && npm ci

dev: ## Локальный запуск без Docker: API :8000 + Vite :5173
	@trap 'kill 0' INT TERM; \
	(cd backend && set -a && [ -f ../.env ] && . ../.env; set +a; .venv/bin/uvicorn app.main:app --reload --port 8000) & \
	(cd frontend && npx vite --port 5173 --strictPort) & \
	wait

test: ## Тесты backend + frontend (формулы статики сверяются с Python)
	cd backend && .venv/bin/pytest -q
	cd backend && .venv/bin/python -m app.export_static ../frontend/public/static-api
	cd frontend && npx tsc -b && npx vitest run

BASE_PATH ?= /
static: ## Статическая сборка для GitLab Pages → public/ (BASE_PATH=/<проект>/)
	cd backend && .venv/bin/python -m app.export_static ../frontend/public/static-api
	cd frontend && BASE_PATH=$(BASE_PATH) npm run build:static
	rm -rf public && cp -r frontend/dist public
	@echo "Готово: public/ (base $(BASE_PATH))"

E2E_URL ?= http://localhost:$(APP_PORT)
PYTHON ?= python3

e2e: ## Smoke e2e демо-сценария (после make up; нужен pip install playwright)
	E2E_URL=$(E2E_URL) $(PYTHON) scripts/e2e.py e2e.png

clean: ## Удалить контейнеры и образы проекта
	docker compose down --rmi local --volumes

.PHONY: help env up down restart logs ps health install dev test static e2e clean
