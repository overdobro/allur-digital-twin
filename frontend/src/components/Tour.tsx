import { AnimatePresence, motion } from "framer-motion";
import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { STATIC } from "../api/client";
import { GRANT_CHAIN } from "../lib/ideas";

/**
 * Режим презентации: проект рассказывает о себе сам.
 * Сначала слайды «что это и как устроено», затем живые шаги по модулям — маршрут + зона подсветки (data-tour) + подпись.
 * Шаги, которым нужен сервер (идеи, сообщения сотрудников), в статической сборке пропускаются.
 * Управление: → / Space / PageDown — дальше, ← / PageUp — назад, Esc — выход, F — полный экран.
 */

interface Step {
  path: string; target: string | null; title: string; text: string; chapter: string; slide?: () => ReactNode; server?: boolean;
  /** Нажать кнопку [data-tour-click=…] на шаге — показать ответ AI вживую */
  click?: string;
}

const CHAPTERS = ["О системе", "Завод сейчас", "AI и решения", "Люди и идеи", "Итог"];

const STEPS_ALL: Step[] = [
  // ---------- О системе ----------
  { chapter: "О системе", path: "/", target: null, title: "Цифровой двойник автомобильного завода", slide: SlideWhat,
    text: "Виртуальная копия производственной линии АЛЛЮР, которая работает на данных смен." },
  { chapter: "О системе", path: "/", target: null, title: "Как это работает", slide: SlideHow,
    text: "Данные → расчёт → AI → решение человека." },
  { chapter: "О системе", path: "/", target: null, title: "Три роли — одна система", slide: SlideRoles,
    text: "Руководитель, сотрудник, обучающийся." },
  // ---------- Завод сейчас ----------
  { chapter: "Завод сейчас", path: "/", target: "flow", title: "Цифровой двойник завода",
    text: "Цех по фото и описанию завода: кузовной цех, окраска с ваннами КТЛ, подвесной конвейер сборки, тестовая линия. Кузов меняется по ходу — металл, грунт, цвет, колёса. Темп — по данным смены; очередь перед Сваркой — узкое место." },
  { chapter: "Завод сейчас", path: "/", target: "kpi", title: "Ключевые показатели",
    text: "OEE, брак, простой критического оборудования и выпуск — против нормативов кейса. Статусы рассчитываются по порогам, не вручную." },
  { chapter: "Завод сейчас", path: "/?section=painting", target: "drawer", title: "Окраска — критичная зона",
    text: "Брак вырос с 3,5% до 5,2% при норме ≤ 2% — превышение в 2,6 раза. Бракованные кузова на конвейере уходят с линии." },
  { chapter: "Завод сейчас", path: "/?section=painting", target: "drawer-equipment", title: "Инцидент: Камера-02",
    text: "Простой 40 минут — замена фильтра. Гипотеза для проверки: связь с ростом брака окраски." },
  { chapter: "Завод сейчас", path: "/plan", target: "plan", title: "Производственный план",
    text: "План по моделям — 4 800 авто/мес, по каждой модели план на смену, день и месяц. Прогноз при текущем темпе — 5 280: план по моделям выполним, а цель 5 500 — нет (−220). Факт по моделям расчётный — это честно помечено (A9)." },
  // ---------- AI и решения ----------
  { chapter: "AI и решения", path: "/ai", target: "ai-pipeline", title: "AI-анализ",
    text: "Мониторинг → анализ отклонений → прогноз риска → рекомендации. Каждый вывод опирается на рассчитанные факторы из данных." },
  { chapter: "AI и решения", path: "/ai", target: null, title: "Как отвечает AI", slide: SlideAnswers,
    text: "Три места, где отвечает AI, формат ответа и два режима: Claude или правила." },
  { chapter: "AI и решения", path: "/ai?open=painting", target: "ai-advice", title: "Ответ AI: рекомендация по участку",
    text: "Так выглядит ответ: что случилось → почему (факторы из данных) → риск → что сделать до следующей смены. Метка источника показывает, кто сформулировал текст — Claude или правила; цифры в обоих случаях посчитаны кодом." },
  { chapter: "AI и решения", path: "/ai", target: "bottleneck", title: "Bottleneck Detector",
    text: "Окраска — проблема уже случилась. Сварка — назревает: OEE 94,2% → 81,0%, узкое место смещается на Сварку." },
  { chapter: "AI и решения", path: "/executive?ai=1", target: "exec-priorities", title: "Решение для руководителя",
    text: "Приоритеты на следующую смену и конкретные действия: проверить Камеру-02, откалибровать датчики ABB-01, проверить ABB-04 после ТО." },
  { chapter: "AI и решения", path: "/whatif", target: "two-futures", title: "Два будущих",
    text: "Двойник проигрывает решение заранее: без действий — 4 752 авто/мес, с рекомендациями AI — 5 002. Узкое место смещается со Сварки на Окраску; для 5 500 нужен темп ≈128/смену или дополнительные смены." },
  { chapter: "AI и решения", path: "/editor?idea=demo", target: "editor-results", title: "3D-редактор: проверка до внедрения", server: true,
    text: "Добавили третьего робота на пост геометрии Сварки. Двойник сразу проверяет столкновения, проходы и свободное место и пересчитывает выпуск: 4 752 → 4 839 авто/мес, узкое место смещается Сварка → Окраска. Решение проверено до покупки оборудования." },
  { chapter: "AI и решения", path: "/editor?idea=demo", target: "editor-ai", title: "Ответ AI: оценка изменения", server: true, click: "editor-ai",
    text: "Нажимаем «AI-оценка изменения». Ответ: что изменилось и что будет с выпуском, риски по виду оборудования (робот — наладка и ограждение ячейки), следующий шаг — пилот на одной смене. При пересечении габаритов шаг всегда «исправить расстановку»." },
  { chapter: "AI и решения", path: "/editor", target: "editor", title: "3D-редактор: проверка до внедрения", server: false,
    text: "Руководитель переставляет, добавляет и убирает оборудование. Двойник проверяет столкновения, проходы и свободное место и пересчитывает выпуск и узкое место — до покупки оборудования." },
  // ---------- Люди и идеи ----------
  { chapter: "Люди и идеи", path: "/downtime", target: "staff-incidents", title: "Сотрудник → руководитель", server: true,
    text: "Сотрудник отмечает начало и конец смены, записывает выполненные работы и сообщает о проблеме. Сообщение сразу попадает руководителю: слесарь слышит шум в цепи Конвейера-03 — это видно до того, как конвейер встанет." },
  { chapter: "Люди и идеи", path: "/ideas?idea=demo", target: "ideas", title: "Идеи обучающихся · ALLUR IDEA GRANT", server: true,
    text: "Студенты колледжей и вузов предлагают улучшения. AI сразу оценивает идею по данным завода: реалистичность, эффект, сложность, риски. Балл считает код по прозрачной формуле; решение о гранте принимает эксперт, не AI." },
  { chapter: "Люди и идеи", path: "/ideas?idea=demo", target: "idea-ai", title: "Ответ AI: анализ идеи", server: true,
    text: "Студент получает ответ сразу после отправки: тип идеи и связь с реальной проблемой участка, реалистичность, эффект, сложность, риски, что проверить, следующий шаг и балл 0–100. Балл считает код по формуле, а не модель." },
  { chapter: "Люди и идеи", path: "/check3d?idea=demo", target: "check3d", title: "Проверь идею в 3D", server: true,
    text: "Идея студента применяется к цифровому двойнику: «второй робот на посту геометрии» даёт +87 авто/мес. Итог сохраняется в карточке идеи — комиссия видит не только текст, но и расчёт." },
  // ---------- Итог ----------
  { chapter: "Итог", path: "/executive", target: "exec-effect", title: "Эффект для бизнеса",
    text: "+118 кузовов в месяц без переделки при браке Окраски 2%. План 5 500 требует ≈125 авто/смену — даже 100% сменного плана дают 5 280." },
];
const STEPS = STEPS_ALL.filter((s) => s.server === undefined || s.server === !STATIC);
const FINAL = "Цифровой двойник не просто показывает проблему — он помогает принять решение до того, как проблема приведёт к потерям.";

// ---------- слайды ----------

function Tile({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-panel2/80 p-4">
      <div className="text-2xl">{icon}</div>
      <div className="mt-2 font-semibold text-slate-100">{title}</div>
      <div className="mt-1 text-sm leading-relaxed text-slate-300">{children}</div>
    </div>
  );
}

function SlideWhat() {
  return (
    <>
      <p className="text-base leading-relaxed text-slate-200">
        Кейс №2 АО «Группа компаний АЛЛЮР». Виртуальная копия линии <b>Склад → Сварка → Окраска → Сборка → Контроль → Склад</b>,
        которая работает на данных смен и помогает руководителю не узнавать о проблеме постфактум.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Tile icon="👁" title="Видит">Состояние каждого участка и оборудования: темп, OEE, брак, простои — против нормативов.</Tile>
        <Tile icon="🧠" title="Объясняет">AI находит причины отклонений, прогнозирует риск и предлагает действия на смену.</Tile>
        <Tile icon="🧪" title="Проверяет заранее">«Что если» и 3D-редактор проигрывают решение до внедрения — сколько авто оно даст.</Tile>
      </div>
    </>
  );
}

function SlideHow() {
  const flow: [string, string, string][] = [
    ["📊", "Данные", "Смены 01–02.10: выпуск, OEE, брак, простои, события оборудования по 6 участкам"],
    ["🧮", "Расчёт", "KPI, OEE, статусы, узкое место — формулами в коде, по порогам кейса"],
    ["✦", "AI", "Claude объясняет отклонения и даёт рекомендации; без ключа — те же выводы правилами"],
    ["✅", "Решение", "Принимает человек: руководитель — по заводу, эксперт — по гранту"],
  ];
  return (
    <>
      <div className="grid gap-2 md:grid-cols-4">
        {flow.map(([i, t, d], k) => (
          <div key={t} className="relative rounded-xl border border-line bg-panel2/80 p-4">
            <div className="text-2xl">{i}</div>
            <div className="mt-2 font-semibold">{t}</div>
            <div className="mt-1 text-sm leading-relaxed text-slate-300">{d}</div>
            {k < flow.length - 1 && <span className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 text-xl text-brand md:block">→</span>}
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-muted">
        Честность данных: всё, что посчитано по допущению, помечено «расчётный»; допущения A1–A9 открыты в разделе «Допущения и методика».
        Цифры AI не придумывает — он получает уже рассчитанные факты.
      </p>
    </>
  );
}

function SlideAnswers() {
  const [mode, setMode] = useState<string | null>(null);
  useEffect(() => {
    if (STATIC) { setMode("static"); return; }
    fetch(`${import.meta.env.VITE_API_URL ?? "/api"}/health`).then((r) => r.json()).then((h) => setMode(h.llm ? "claude" : "rules")).catch(() => setMode("rules"));
  }, []);
  const rows: [string, string, string][] = [
    ["Руководителю", "что случилось → почему → риск → что сделать", "AI Risk, «Руководителю»"],
    ["Оценка идеи", "тип и связь с проблемой участка, реалистичность, эффект, сложность, риски, что проверить, шаг, балл", "Мои идеи, Идеи и грант"],
    ["Оценка изменения", "что изменилось, выпуск и узкое место, риски по оборудованию, следующий шаг", "3D-редактор"],
  ];
  return (
    <>
      <div className="grid gap-2">
        {rows.map(([w, f, where]) => (
          <div key={w} className="grid gap-1 rounded-xl border border-line bg-panel2/80 px-4 py-3 md:grid-cols-[170px_1fr_190px] md:items-center">
            <b>{w}</b><span className="text-sm text-slate-300">{f}</span><span className="text-xs text-muted">{where}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className={`rounded-xl border p-4 ${mode === "claude" ? "border-[#d97757]" : "border-line"}`}>
          <div className="text-xs font-semibold uppercase tracking-wider text-[#e8a184]">Claude</div>
          <p className="mt-1 text-sm text-slate-300">Понимает идею своими словами, пишет связный текст по посчитанным фактам. Ответ строго по JSON-схеме.</p>
        </div>
        <div className={`rounded-xl border p-4 ${mode !== "claude" ? "border-slate-400" : "border-line"}`}>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-300">Правила · без LLM</div>
          <p className="mt-1 text-sm text-slate-300">Работают без интернета и ключа: тип идеи, участок, связь с проблемой по данным, риски по виду оборудования.</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted">
        {mode === "claude" ? "Сейчас отвечает Claude; при сбое сети ответ автоматически соберут правила." :
          mode === "static" ? "Статическая версия: рекомендации подготовлены при сборке, оценка изменений — правилами в браузере." :
          "Сейчас ключ Claude не подключён — отвечают правила. Числа одинаковы в обоих режимах: их считает код."}
      </p>
    </>
  );
}

function SlideRoles() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Tile icon="👔" title="Руководитель">Обзор завода в 3D, линии, план, качество, простои, AI-риски, «Что если», 3D-редактор, отбор идей на грант.</Tile>
      <Tile icon="🦺" title="Сотрудник">Моя смена (приход/уход), выполненные работы, сообщения о проблемах — сразу в ленту руководителя, свои идеи.</Tile>
      <Tile icon="🎓" title="Обучающийся">Предлагает идею → получает AI-оценку → проверяет её на 3D-модели → рейтинг и грант ALLUR IDEA GRANT.</Tile>
    </div>
  );
}

interface TourCtx { active: boolean; start: () => void }
const Ctx = createContext<TourCtx>({ active: false, start: () => {} });
export const useTour = () => useContext(Ctx);

function useTargetRect(selector: string | null, deps: unknown[]) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    setRect(null);
    if (!selector) return;
    let raf = 0;
    let scrolled = false;
    const started = performance.now();
    const tick = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${selector}"]`);
      if (el) {
        if (!scrolled) { el.scrollIntoView({ block: "center", behavior: "smooth" }); scrolled = true; }
        setRect(el.getBoundingClientRect());
      }
      // следим за позицией постоянно: анимации появления и прокрутка меняют геометрию
      if (performance.now() - started < 60_000) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector, ...deps]);
  return rect;
}

export function TourProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState(-1);
  const nav = useNavigate();
  const loc = useLocation();
  const active = step >= 0;
  const final = step === STEPS.length;
  const cur = active && !final ? STEPS[step] : null;

  const go = useCallback((i: number) => {
    if (i < 0) return;
    if (i > STEPS.length) { setStep(-1); return; }
    setStep(i);
    if (i < STEPS.length && loc.pathname + loc.search !== STEPS[i].path) nav(STEPS[i].path);
  }, [nav, loc.pathname, loc.search]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); go(step + 1); }
      else if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); go(step - 1); }
      else if (e.key === "Escape") setStep(-1);
      else if (e.key.toLowerCase() === "f" || e.key.toLowerCase() === "а") {
        if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, step, go]);

  const rect = useTargetRect(cur?.target ?? null, [step]);
  // Шаг с ответом AI: дождаться кнопки и нажать её один раз
  useEffect(() => {
    const sel = cur?.click;
    if (!sel) return;
    const started = performance.now();
    const t = window.setInterval(() => {
      const b = document.querySelector<HTMLButtonElement>(`[data-tour-click="${sel}"]`);
      if (b && !b.disabled) { b.click(); window.clearInterval(t); }
      else if (performance.now() - started > 15_000) window.clearInterval(t);
    }, 300);
    return () => window.clearInterval(t);
  }, [cur?.click, step]);
  const pad = 10;
  // Высокая цель перекрывалась бы подписью снизу — ставим подпись сбоку, с противоположной стороны
  const slide = !!cur?.slide;
  // Невысокая цель внизу экрана (страницу дальше не прокрутить) — подпись сверху, чтобы её не закрыть
  const side: "bottom" | "top" | "left" | "right" | "center" = slide || final ? "center" :
    !rect || rect.height < window.innerHeight * 0.55 ? (rect && rect.bottom > window.innerHeight - 280 ? "top" : "bottom")
      : rect.left + rect.width / 2 > window.innerWidth / 2 ? "left" : "right";

  return (
    <Ctx.Provider value={{ active, start: () => go(0) }}>
      {children}
      <AnimatePresence>
        {active && (
          <motion.div key="tour" className="pointer-events-none fixed inset-0 z-[60]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {/* Затемнение с «окном» вокруг цели */}
            {rect && !final ? (
              <div className="absolute rounded-2xl ring-2 ring-brand transition-all duration-500 ease-out"
                style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: "0 0 0 9999px rgba(5,8,12,.72)" }} />
            ) : (
              <div className="absolute inset-0 bg-[rgba(5,8,12,.72)]" />
            )}

            {/* Подпись */}
            <div className={`pointer-events-auto absolute px-4 ${
              side === "left" ? "inset-y-0 left-4 flex w-[440px] items-center" :
              side === "right" ? "inset-y-0 right-4 flex w-[440px] items-center" :
              side === "center" ? "inset-0 flex items-center justify-center" :
              side === "top" ? "inset-x-0 top-6 flex justify-center" :
              "inset-x-0 bottom-6 flex justify-center"}`}>
              <motion.div key={step} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
                className={`w-full rounded-2xl border border-line bg-panel/95 p-5 shadow-2xl backdrop-blur ${final || slide ? "max-w-5xl p-7" : "max-w-3xl"}`}>
                {final ? (
                  <>
                    <div className="mb-5 flex flex-wrap justify-center gap-1.5 text-xs">
                      {GRANT_CHAIN.map((g, i) => <span key={g} className="rounded-full bg-panel2 px-3 py-1 text-slate-300">{g}{i < GRANT_CHAIN.length - 1 && " →"}</span>)}
                    </div>
                    <p className="text-center text-2xl font-semibold leading-snug">«{FINAL}»</p>
                  </>
                ) : (
                  <>
                    <Chapters current={cur!.chapter} />
                    <div className="flex items-center gap-3">
                      <span className="num rounded-md bg-brand px-2 py-0.5 text-xs font-bold text-white">{step + 1}/{STEPS.length}</span>
                      <h3 className={`font-semibold ${slide ? "text-3xl" : "text-xl"}`}>{cur!.title}</h3>
                    </div>
                    <div className="mt-3">{slide ? createElement(cur!.slide!) : <p className="text-base leading-relaxed text-slate-200">{cur!.text}</p>}</div>
                  </>
                )}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
                  <span>← → или кликер · F — полный экран · Esc — выход</span>
                  <div className="ml-auto flex gap-2">
                    <button onClick={() => go(step - 1)} disabled={step === 0} className="whitespace-nowrap rounded-md border border-line px-3 py-1.5 hover:text-white disabled:opacity-30">← Назад</button>
                    <button onClick={() => go(step + 1)} className="whitespace-nowrap rounded-md bg-brand px-3 py-1.5 font-semibold text-white hover:brightness-110">
                      {final ? "Завершить" : step === STEPS.length - 1 ? "Итог →" : "Далее →"}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}

function Chapters({ current }: { current: string }) {
  const k = CHAPTERS.indexOf(current);
  return (
    <div className="mb-3 flex flex-wrap gap-1 text-[11px] uppercase tracking-wider">
      {CHAPTERS.map((c, i) => <span key={c} className={i === k ? "text-brand" : i < k ? "text-slate-400" : "text-slate-600"}>{c}{i < CHAPTERS.length - 1 && <span className="mx-1 text-slate-600">·</span>}</span>)}
    </div>
  );
}

export function TourButton() {
  const { start, active } = useTour();
  return (
    <button onClick={start} disabled={active}
      className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-brand/20 hover:brightness-110">
      ▶ Презентация
    </button>
  );
}
