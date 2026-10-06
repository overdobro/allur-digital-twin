#!/usr/bin/env bash
# Сборка статической версии на Vercel: ответы API → JSON (Python), затем фронтенд в статическом режиме.
# Если в настройках проекта задан ANTHROPIC_API_KEY, рекомендации Claude генерируются здесь; ключ в сайт не попадает.
set -euo pipefail
cd "$(dirname "$0")/.."

# В Amazon Linux 2023 python3 — это 3.9; нужен ≥ 3.10
PY=""
for c in python3.12 python3.13 python3.14 python3; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'; then PY="$c"; break; fi
done
[ -n "$PY" ] || { echo "Нужен Python >= 3.10" >&2; exit 1; }
echo "Python: $($PY --version)"

VENV="${TMPDIR:-/tmp}/twin-venv"
"$PY" -m venv "$VENV"
"$VENV/bin/pip" install -q --disable-pip-version-check -r backend/requirements-dev.txt
(cd backend && "$VENV/bin/python" -m app.export_static ../frontend/public/static-api)

cd frontend
npm ci --no-audit --no-fund
BASE_PATH=/ npm run build:static
