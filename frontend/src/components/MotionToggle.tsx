import { useApp } from "../lib/context";

export function MotionToggle() {
  const { motion, setMotion } = useApp();
  return (
    <button
      onClick={() => setMotion(!motion)}
      title={motion ? "Выключить анимации" : "Включить анимации"}
      aria-pressed={motion}
      className="flex items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-muted hover:text-white"
    >
      <span className={`relative h-3.5 w-6 rounded-full transition ${motion ? "bg-brand" : "bg-panel2"}`}>
        <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all ${motion ? "left-3" : "left-0.5"}`} />
      </span>
      Анимации
    </button>
  );
}
