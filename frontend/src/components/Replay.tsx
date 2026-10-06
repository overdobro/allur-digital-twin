import { useEffect, useRef, useState } from "react";
import type { ReplayStep, Status } from "../api/types";
import { fmtDateShort } from "../lib/format";
import { Dot } from "./ui";

export interface ReplayState {
  running: boolean;
  /** индекс текущего шага; -1 — не запущено */
  index: number;
  step: ReplayStep | null;
  start: () => void;
  pause: () => void;
  reset: () => void;
}

export function useReplay(steps: ReplayStep[] | null, intervalMs = 1300): ReplayState {
  const [index, setIndex] = useState(-1);
  const [running, setRunning] = useState(false);
  const timer = useRef<number>();

  useEffect(() => {
    if (!running || !steps) return;
    timer.current = window.setInterval(() => {
      setIndex((i) => {
        if (i >= steps.length - 1) {
          setRunning(false);
          return i;
        }
        return i + 1;
      });
    }, intervalMs);
    return () => window.clearInterval(timer.current);
  }, [running, steps, intervalMs]);

  return {
    running,
    index,
    step: steps && index >= 0 ? steps[index] : null,
    start: () => {
      if (steps && index >= steps.length - 1) setIndex(-1);
      setRunning(true);
    },
    pause: () => setRunning(false),
    reset: () => { setRunning(false); setIndex(-1); },
  };
}

export function ReplayControls({ r, total }: { r: ReplayState; total: number }) {
  const done = r.index >= total - 1 && !r.running;
  return (
    <div className="flex items-center gap-2">
      {r.running ? (
        <button onClick={r.pause} className="rounded-md border border-line px-3 py-1 text-xs hover:bg-panel2">❚❚ Пауза</button>
      ) : (
        <button onClick={r.start} className="rounded-md bg-brand px-3 py-1 text-xs font-semibold text-white hover:brightness-110">
          {r.index < 0 ? "▶ Воспроизвести смены" : done ? "↻ Повторить" : "▶ Продолжить"}
        </button>
      )}
      {r.index >= 0 && <button onClick={r.reset} className="rounded-md border border-line px-3 py-1 text-xs text-muted hover:text-white">Живой вид</button>}
    </div>
  );
}

export function EventFeed({ steps, index }: { steps: ReplayStep[]; index: number }) {
  const [all, setAll] = useState(false);
  const history = steps.slice(0, index + 1).reverse();
  const shown = all ? history : history.slice(0, 3);
  const cur = steps[index];
  return (
    <div className="mt-4 rounded-lg border border-line bg-bg/60">
      <div className="flex items-center justify-between border-b border-line px-3 py-2 text-xs">
        <span className="flex items-center gap-2 font-semibold text-slate-200">
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />Режим воспроизведения · {cur ? fmtDateShort(cur.date) : ""}
        </span>
        <span className="num text-muted">шаг {index + 1} / {steps.length}</span>
      </div>
      <div className="h-1 bg-panel2"><div className="h-1 bg-brand transition-all" style={{ width: `${((index + 1) / steps.length) * 100}%` }} /></div>
      <ul className={`overflow-y-auto px-3 py-2 text-sm ${all ? "max-h-48" : ""}`}>
        {shown.map((s, i) => (
          <li key={s.index} className={`flex items-center gap-2.5 py-1 ${i === 0 ? "text-white" : "text-slate-400"}`}>
            {s.severity === "info" ? <span className="h-2 w-2 rounded-full border border-slate-500" /> : <Dot status={s.severity as Status} size={8} pulse={i === 0} />}
            <span className="num w-10 shrink-0 text-xs text-muted">{fmtDateShort(s.date)}</span>
            <span className={s.kind === "day" ? "font-semibold" : ""}>{s.text}</span>
          </li>
        ))}
      </ul>
      {history.length > 3 && (
        <button onClick={() => setAll(!all)} className="w-full border-t border-line py-1.5 text-[11px] text-muted hover:text-white">
          {all ? "Свернуть" : `Вся хронология (${history.length})`}
        </button>
      )}
    </div>
  );
}
