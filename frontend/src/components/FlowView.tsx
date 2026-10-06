import { lazy, Suspense, useState } from "react";
import type { FactoryNode, Status } from "../api/types";
import { useApp } from "../lib/context";
import { hasWebGL } from "../lib/webgl";
import { FactoryFlow, type FlowEvent } from "./FactoryFlow";
import { FactoryMap } from "./FactoryMap";

const Factory3D = lazy(() => import("./three/Factory3D"));
const WEBGL = hasWebGL();

type Mode = "3d" | "2d";
const readMode = (): Mode => {
  try { return localStorage.getItem("twin.view") === "2d" ? "2d" : "3d"; } catch { return "3d"; }
};

export interface FlowViewProps {
  nodes: FactoryNode[]; override?: Record<string, Status>; highlight?: string | null;
  onSelect: (id: string) => void; event?: FlowEvent | null; focusId?: string | null; dateLabel: string;
}

/** Переключатель 3D/2D для заголовка карточки. */
export function ViewToggle({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const { motion } = useApp();
  if (!WEBGL || !motion) return null;
  return (
    <div className="hidden rounded-lg border border-line bg-bg p-0.5 md:inline-flex" role="group" aria-label="Вид">
      {(["3d", "2d"] as const).map((m) => (
        <button key={m} onClick={() => setMode(m)}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold uppercase ${mode === m ? "bg-panel2 text-white" : "text-muted hover:text-white"}`}>
          {m}
        </button>
      ))}
    </div>
  );
}

export function useViewMode() {
  const [mode, setModeState] = useState<Mode>(readMode);
  const setMode = (m: Mode) => {
    setModeState(m);
    try { localStorage.setItem("twin.view", m); } catch { /* ignore */ }
  };
  return { mode, setMode };
}

export function FlowView({ mode, ...p }: FlowViewProps & { mode: Mode }) {
  const { motion } = useApp();
  const use3d = mode === "3d" && WEBGL && motion;
  return (
    <>
      <div className="hidden md:block">
        {use3d ? (
          <div className="relative h-[460px] overflow-hidden rounded-lg border border-line" data-testid="factory-3d">
            <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted">Загрузка 3D-цеха…</div>}>
              <Factory3D {...p} motion={motion} />
            </Suspense>
            <div className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-muted">
              Типовая компоновка по фото и описанию завода (расположение условное) · симуляция по данным {p.dateLabel} · мышь: вращение / колесо: масштаб · клик по подписи — детали
            </div>
          </div>
        ) : (
          <FactoryFlow {...p} />
        )}
      </div>
      <div className="md:hidden">
        <FactoryMap nodes={p.nodes} override={p.override} highlight={p.highlight} />
      </div>
    </>
  );
}
