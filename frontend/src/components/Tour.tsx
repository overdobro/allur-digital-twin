import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Режим презентации: 8 шагов сценария Demo Day из ТЗ.
 * Каждый шаг — маршрут + зона подсветки (data-tour) + подпись.
 * Управление: → / Space / PageDown — дальше, ← / PageUp — назад, Esc — выход, F — полный экран.
 */

interface Step { path: string; target: string | null; title: string; text: string }

const STEPS: Step[] = [
  { path: "/", target: "flow", title: "Цифровой двойник завода",
    text: "Цех по фото и описанию завода: кузовной цех, окраска с ваннами КТЛ, подвесной конвейер сборки, тестовая линия. Кузов меняется по ходу — металл, грунт, цвет, колёса. Темп — по данным смены; очередь перед Сваркой — узкое место." },
  { path: "/", target: "kpi", title: "Ключевые показатели",
    text: "OEE, брак, простой критического оборудования и выпуск — против нормативов кейса. Статусы рассчитываются по порогам, не вручную." },
  { path: "/?section=painting", target: "drawer", title: "Окраска — критичная зона",
    text: "Брак вырос с 3,5% до 5,2% при норме ≤ 2% — превышение в 2,6 раза. Бракованные кузова на конвейере уходят с линии." },
  { path: "/?section=painting", target: "drawer-equipment", title: "Инцидент: Камера-02",
    text: "Простой 40 минут — замена фильтра. Гипотеза для проверки: связь с ростом брака окраски." },
  { path: "/ai", target: "ai-pipeline", title: "AI-анализ",
    text: "Мониторинг → анализ отклонений → прогноз риска → рекомендации. Каждый вывод опирается на рассчитанные факторы из данных." },
  { path: "/ai", target: "bottleneck", title: "Bottleneck Detector",
    text: "Окраска — проблема уже случилась. Сварка — назревает: OEE 94,2% → 81,0%, узкое место смещается на Сварку." },
  { path: "/executive?ai=1", target: "exec-priorities", title: "Решение для руководителя",
    text: "Приоритеты на следующую смену и конкретные действия: проверить Камеру-02, откалибровать датчики ABB-01, проверить ABB-04 после ТО." },
  { path: "/whatif", target: "two-futures", title: "Два будущих",
    text: "Двойник проигрывает решение заранее: без действий — 4 752 авто/мес, с рекомендациями AI — 5 002. Узкое место смещается со Сварки на Окраску; для 5 500 нужен темп ≈128/смену или дополнительные смены." },
  { path: "/executive", target: "exec-effect", title: "Эффект для бизнеса",
    text: "+118 кузовов в месяц без переделки при браке Окраски 2%. План 5 500 требует ≈125 авто/смену — даже 100% сменного плана дают 5 280." },
];
const FINAL = "Цифровой двойник не просто показывает проблему — он помогает принять решение до того, как проблема приведёт к потерям.";

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
  const pad = 10;
  // Высокая цель перекрывалась бы подписью снизу — ставим подпись сбоку, с противоположной стороны
  const side: "bottom" | "left" | "right" =
    !rect || final || rect.height < window.innerHeight * 0.55 ? "bottom"
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
              "inset-x-0 bottom-6 flex justify-center"}`}>
              <motion.div key={step} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
                className={`w-full rounded-2xl border border-line bg-panel/95 p-5 shadow-2xl backdrop-blur ${final ? "max-w-4xl" : "max-w-3xl"}`}>
                {final ? (
                  <p className="text-center text-2xl font-semibold leading-snug">«{FINAL}»</p>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="num rounded-md bg-brand px-2 py-0.5 text-xs font-bold text-white">{step + 1}/{STEPS.length}</span>
                      <h3 className="text-xl font-semibold">{cur!.title}</h3>
                    </div>
                    <p className="mt-2 text-base leading-relaxed text-slate-200">{cur!.text}</p>
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

export function TourButton() {
  const { start, active } = useTour();
  return (
    <button onClick={start} disabled={active}
      className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-brand/20 hover:brightness-110">
      ▶ Презентация
    </button>
  );
}
