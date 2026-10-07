"""Smoke e2e демо-сценария: python scripts/e2e.py [screenshot.png]. Нужен playwright (pip install playwright)."""
import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.getenv("E2E_URL", "http://localhost:5173")

errors = []
with sync_playwright() as p:
    # Программный WebGL — чтобы 3D-ветка проверялась и на машинах без GPU
    args = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
    try:
        b = p.chromium.launch(args=args)
    except Exception:
        b = p.chromium.launch(executable_path="/snap/bin/chromium", args=args)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(BASE + "/")
    # Экран выбора роли (в статической сборке его нет — сразу вид руководителя)
    pg.get_by_text("КАК ВЫ ХОТИТЕ ВОЙТИ?").or_(pg.get_by_role("link", name="Обзор завода")).first.wait_for(timeout=30000)
    if pg.get_by_text("КАК ВЫ ХОТИТЕ ВОЙТИ?").count():
        pg.get_by_role("button", name="👔 Руководитель").click()
        pg.get_by_label("Пароль").fill(os.getenv("MANAGER_PASSWORD", "allur2026"))
        pg.get_by_role("button", name="Войти").click()
    pg.get_by_text("Окраска", exact=True).first.wait_for()
    # Клик по участку на конвейере → боковая панель с инцидентом Камеры-02
    pg.wait_for_selector("[data-testid=factory-3d] canvas", timeout=30000)  # 3D загрузился
    pg.hover("[data-testid=factory-3d]")  # курсор над сценой — камера перестаёт покачиваться
    pg.wait_for_timeout(3000)  # камера доводит начальный ракурс (на программном рендере — медленно)
    label = pg.get_by_role("button", name="Окраска: Критично")
    try:
        label.click(timeout=10000)
    except Exception:
        label.click(force=True)  # подпись ещё плавно смещается — клик без проверки стабильности
    pg.get_by_role("dialog").get_by_text("Замена фильтра").wait_for()
    pg.keyboard.press("Escape")
    pg.get_by_role("dialog").wait_for(state="detached", timeout=15000)
    # Переключение дат
    pg.get_by_role("button", name="01.10.2026").click()
    pg.get_by_text("Состояние за 01.10.2026").wait_for()
    pg.get_by_role("button", name="Период").click()
    pg.get_by_text("Состояние за весь период").wait_for()
    # Руководитель: AI рекомендации
    pg.get_by_role("link", name="Руководителю").click()
    pg.get_by_role("button", name="AI рекомендации").click()
    pg.get_by_text("Скрыть AI рекомендации").wait_for()
    pg.get_by_text("Проверить Камеру-02").first.wait_for(timeout=30000)
    # Калькулятор: маржа → деньги
    pg.get_by_placeholder("не задана").fill("1000000")
    pg.get_by_text("₸/мес").first.wait_for()
    txt = pg.get_by_text("₸/мес").first.inner_text()
    print("money:", txt)
    # Replay: 18 шагов хронологии
    pg.get_by_role("link", name="Обзор завода").click()
    pg.get_by_role("button", name="▶ Воспроизвести смены").click()
    pg.get_by_text("шаг 18 / 18").wait_for(timeout=40000)
    pg.get_by_role("button", name="Живой вид").click()
    # Режим презентации: слайды о системе + шаги по модулям + итог — листаем до конца
    pg.get_by_role("button", name="▶ Презентация").click()
    for n in range(40):
        pg.wait_for_timeout(1200)
        if pg.get_by_text("← → или кликер").count() == 0:
            break
        pg.keyboard.press("ArrowRight")
    print("presentation steps:", n)
    pg.wait_for_timeout(600)
    assert pg.get_by_text("← → или кликер").count() == 0, "презентация не завершилась"
    pg.screenshot(path=sys.argv[1] if len(sys.argv) > 1 else "e2e.png", full_page=True)
    b.close()
print("console errors:", errors or "none")
sys.exit(1 if errors else 0)
