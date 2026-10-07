import { CameraControls, Html, PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import type CameraControlsImpl from "camera-controls";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import type { FactoryNode, Status } from "../../api/types";
import { useFlowSim, type SimGeometry } from "../../lib/flowSim";
import { STATUS_HEX, STATUS_LABEL } from "../../lib/format";
import { keyMetric, type FlowEvent } from "../FactoryFlow";
import { BatchProvider } from "./batch";
import { Cars } from "./cars";
import { EditableObjects } from "./EditableObjects";
import { baseLayout, JIG_T, snap, type Item, type ObjType } from "./editorModel";
import { AssemblyShop, FinishedGoods, PaintShop, TestLine, TurnBuffer, WarehouseIn, WeldingShop, Workers } from "./equipment";
import { Hall, ZoneOutline } from "./hall";
import { pointAt, TRACK_END, TRACK_START, zoneCenter, ZONES } from "./layout";

/**
 * 3D-модель цеха по фото и описанию процессов завода Allur. Компоновка типовая и условная.
 * Кузова — общая с 2D симуляция (lib/flowSim) на U-образном пути (layout.ts), шаг внутри useFrame без перерисовки React.
 */

// ---------- Подписи (HTML поверх сцены — доступны для клика, Tab и e2e) ----------

function StationLabel({ node, status, pos, counters, onSelect, highlight }: {
  node: FactoryNode; status: Status; pos: [number, number, number]; counters?: { passed: number; defects: number };
  onSelect: (id: string) => void; highlight: boolean;
}) {
  const km = status === "no_data" ? null : keyMetric(node);
  const c = STATUS_HEX[status];
  const clickable = node.line !== null;
  return (
    <Html position={pos} center zIndexRange={[30, 0]}>
      <button
        onClick={() => clickable && onSelect(node.id)} disabled={!clickable}
        aria-label={clickable ? `${node.name}: ${STATUS_LABEL[status]}` : undefined}
        className={`w-[150px] select-none rounded-lg border bg-[#0b1017]/85 px-2.5 py-1.5 text-left backdrop-blur transition ${clickable ? "cursor-pointer hover:bg-[#121a24]" : "cursor-default"} ${highlight ? "ring-2" : ""}`}
        style={{ borderColor: c + (status === "no_data" ? "55" : "cc"), ["--tw-ring-color" as string]: c }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[12px] font-semibold text-slate-100">{node.name}</span>
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c }} />
        </div>
        {km ? (
          <div className="mt-0.5">
            <div className="truncate text-[10px] leading-tight text-slate-400">{km.label}</div>
            <div className="num text-lg font-bold leading-tight" style={{ color: km.status === "ok" ? "#e2e8f0" : STATUS_HEX[km.status] }}>{km.value}</div>
          </div>
        ) : (
          <div className="text-[10px] text-slate-500">{node.metrics ? "ожидание данных…" : "нет данных"}</div>
        )}
        {counters && node.metrics && (
          <div className={`num text-[10px] ${counters.defects ? "text-red-400" : "text-slate-500"}`}>брак {counters.defects} из {counters.passed}</div>
        )}
      </button>
    </Html>
  );
}

function EventBubble({ event, pos }: { event: FlowEvent; pos: [number, number, number] }) {
  const col = event.severity === "info" ? "#94a3b8" : STATUS_HEX[event.severity];
  return (
    <Html key={event.index} position={pos} center zIndexRange={[31, 0]}>
      <div className="w-max max-w-[280px] animate-[fadeUp_.3s_ease-out] rounded-lg border bg-[#0b1017]/95 px-3 py-1.5 text-center text-xs font-medium shadow-xl"
        style={{ borderColor: col, color: event.severity === "info" ? "#e2e8f0" : col }}>
        {event.text}
      </div>
    </Html>
  );
}

// ---------- Камера ----------

const HOME = { pos: [3.2, 17, 22.5] as const, target: [3.2, 0.5, 1.2] as const };

function CameraRig({ focus, motion, paused, locked = false }: { focus: { x: number; z: number } | null; motion: boolean; paused: boolean; locked?: boolean }) {
  const ref = useRef<CameraControlsImpl>(null);
  // Во время перетаскивания объекта камера не должна вращаться
  useEffect(() => { if (ref.current) ref.current.enabled = !locked; }, [locked]);
  const lastUser = useRef(-1e9);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    if (!focus) c.setLookAt(...HOME.pos, ...HOME.target, true);
    // Панель участка открывается справа — участок оставляем в левой, видимой части кадра
    else c.setLookAt(focus.x + 4.5, 7.5, focus.z + 11, focus.x + 3, 1.6, focus.z, true);
  }, [focus?.x, focus?.z]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const onStart = () => { lastUser.current = performance.now(); };
    c.addEventListener("controlstart", onStart);
    return () => c.removeEventListener("controlstart", onStart);
  }, []);
  // Медленное «дыхание» камеры в простое; пауза, пока курсор над сценой
  useFrame(({ clock }) => {
    const c = ref.current;
    if (!c || !motion || paused || focus || performance.now() - lastUser.current < 6000 || c.active) return;
    c.azimuthAngle += (Math.sin(clock.elapsedTime * 0.1) * 0.22 - c.azimuthAngle) * 0.02;
  });
  return <CameraControls ref={ref} minDistance={5} maxDistance={60} maxPolarAngle={Math.PI / 2.2} smoothTime={0.7} />;
}

// ---------- Сцена ----------

/** Тестовый хук: проекция мировой точки в пиксели экрана (для автотестов редактора). */
function TestHooks() {
  const { camera, gl } = useThree();
  useEffect(() => {
    (window as unknown as { __twinProject?: unknown }).__twinProject = (x: number, y: number, z: number) => {
      const v = new THREE.Vector3(x, y, z).project(camera);
      const r = gl.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    };
  }, [camera, gl]);
  return null;
}

/** Число вызовов отрисовки за кадр → атрибут data-draw-calls (контроль производительности). */
function RenderStats() {
  const gl = useThree((s) => s.gl);
  // Постобработка рендерит несколько проходов — считаем весь кадр: сброс вручную в начале кадра
  useEffect(() => { gl.info.autoReset = false; return () => { gl.info.autoReset = true; }; }, [gl]);
  useFrame(() => gl.info.reset(), -1);
  useEffect(() => {
    const t = window.setInterval(() => gl.domElement.parentElement?.parentElement?.setAttribute("data-draw-calls", String(gl.info.render.calls)), 1000);
    return () => clearInterval(t);
  }, [gl]);
  return null;
}

function Scene({ nodes, override, highlight, onSelect, event, focusId, motion, bloom, paused, editor }: Factory3DProps & { motion: boolean; bloom: boolean; paused: boolean }) {
  const sorted = useMemo(() => [...nodes].sort((a, b) => a.order - b.order), [nodes]);
  const geo = useMemo<SimGeometry>(() => ({ zones: ZONES, trackStart: TRACK_START, trackEnd: TRACK_END, carGap: 2.3, baseSpeed: 3.2 }), []);
  const sim = useFlowSim(sorted, geo, motion, true);
  const st = (n: FactoryNode) => override?.[n.id] ?? n.status;
  const node = (id: string) => sorted.find((n) => n.id === id);
  const eq = (id: string, name: string): Status => node(id)?.equipment.find((e) => e.name === name)?.status ?? "ok";

  // Счётчики брака в подписях — 2 раза в секунду, а не каждый кадр
  const [counters, setCounters] = useState<Record<string, { passed: number; defects: number }>>({});
  useEffect(() => {
    const t = window.setInterval(() => setCounters(Object.fromEntries(Object.entries(sim.getCounters()).map(([k, v]) => [k, { ...v }]))), 500);
    return () => clearInterval(t);
  }, [sim]);

  const focus = focusId && ZONES.some((z) => z.id === focusId) ? zoneCenter(focusId) : null;

  // ---- объекты редактора: базовая расстановка или черновик редактора ----
  const baseItems = useMemo(() => baseLayout(), []);
  const items = editor?.items ?? baseItems;
  const itemStatus = (it: Item): Status => {
    if (it.label === "ABB-01" || it.label === "ABB-04") return eq("welding", it.label);
    if (it.type === "andon") {
      const n = node(it.id.replace("andon-", ""));
      return n ? st(n) : "no_data";
    }
    return "ok";
  };
  const drag = useRef<{ id: string; dx: number; dz: number; moved: boolean } | null>(null);
  const [locked, setLocked] = useState(false);
  const startDrag = (id: string, e: ThreeEvent<PointerEvent>) => {
    if (!editor || editor.placing) return;
    e.stopPropagation();
    const it = items.find((x) => x.id === id)!;
    const hit = e.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    drag.current = { id, dx: hit ? it.x - hit.x : 0, dz: hit ? it.z - hit.z : 0, moved: false };
    setLocked(true);
    editor.onSelect(id);
  };
  const endDrag = () => {
    if (drag.current) { const moved = drag.current.moved; window.setTimeout(() => { drag.current = null; }, 0); setLocked(false); if (moved) editor?.onCommit?.(); }
  };
  useEffect(() => {
    const up = () => endDrag();
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  });

  return (
    <>
      <color attach="background" args={["#0b1017"]} />
      <fog attach="fog" args={["#0b1017", 45, 95]} />
      <hemisphereLight args={["#e8eef5", "#3b4450", 0.9]} />
      <directionalLight position={[10, 18, 12]} intensity={1.3} />
      <directionalLight position={[-12, 10, -8]} intensity={0.35} color="#9cc2ff" />

      <Hall />
      {ZONES.map((z) => {
        const n = node(z.id);
        return n ? <ZoneOutline key={z.id} zone={z} status={st(n)} highlight={highlight === z.id || focusId === z.id} /> : null;
      })}
      <BatchProvider>
      <WarehouseIn />
      <WeldingShop motion={motion} />
      <PaintShop booth={eq("painting", "Камера-02")} motion={motion} />
      <TurnBuffer />
      <AssemblyShop conveyor={eq("assembly", "Конвейер-03")} motion={motion} />
      <TestLine motion={motion} />
      <FinishedGoods />
      {!editor && <EditableObjects items={items} status={itemStatus} motion={motion} />}
      </BatchProvider>
      {editor && (
        <>
          <EditableObjects items={items} status={itemStatus} motion={motion}
            editor={{ selectedId: editor.selectedId, invalid: editor.invalid, onPointerDown: startDrag }} />
          {/* Пол-приёмник для перетаскивания и установки объектов */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]} visible={false}
            onPointerMove={(e) => { if (drag.current) { e.stopPropagation(); editor.onMove(drag.current.id, snap(e.point.x + drag.current.dx), snap(e.point.z + drag.current.dz)); drag.current.moved = true; } }}
            onPointerUp={() => endDrag()}
            onClick={(e) => { if (editor.placing) { e.stopPropagation(); editor.onPlace(snap(e.point.x), snap(e.point.z)); } else if (!drag.current?.moved) editor.onSelect(null); }}>
            <planeGeometry args={[120, 80]} />
          </mesh>
        </>
      )}
      <Workers spots={WORKERS} />

      <Cars sim={sim} />

      {!editor && sorted.map((n) => {
        const c = zoneCenter(n.id);
        return (
          <StationLabel key={n.id} node={n} status={st(n)} pos={[c.x, 6.6, c.z]} counters={motion ? counters[n.id] : undefined}
            onSelect={onSelect} highlight={highlight === n.id} />
        );
      })}
      {/* Подписи этапов — только для участка в фокусе: на общем плане они перегружали кадр */}
      {focusId && <ProcessTags zone={focusId} />}
      {event && ZONES.some((z) => z.id === event.section_id) && (() => { const c = zoneCenter(event.section_id); return <EventBubble event={event} pos={[c.x, 8, c.z]} />; })()}

      <RenderStats />
      <TestHooks />
      <CameraRig focus={focus ? { x: focus.x, z: focus.z } : null} motion={motion && !editor} paused={paused} locked={locked} />
      {bloom && (
        <EffectComposer>
          <Bloom mipmapBlur intensity={0.7} luminanceThreshold={0.9} luminanceSmoothing={0.2} />
        </EffectComposer>
      )}
    </>
  );
}

/** Подписи этапов техпроцесса (мелкие, на уровне оборудования) — из описания завода. */
function ProcessTags({ zone: only }: { zone: string }) {
  const tags: [string, number, string][] = [
    ["welding", 0.3, "сварка в кондукторах"], ["welding", 0.72, "геометрия · ABB-01/04"], ["welding", 0.92, "контроль геометрии"],
    ["painting", 0.21, "13 катафорезных ванн"], ["painting", 0.48, "сушка"], ["painting", 0.6, "герметизация"],
    ["painting", 0.75, "ЛКП · Камера-02"], ["painting", 0.93, "полировка"],
    ["assembly", 0.45, "подвесной конвейер · Конвейер-03"], ["assembly", 0.88, "«свадьба»"],
    ["qc", 0.14, "развал-схождение"], ["qc", 0.36, "тормоза"], ["qc", 0.6, "Water Test"], ["qc", 0.92, "световой тоннель"],
  ];
  return (
    <>
      {tags.filter(([zone]) => zone === only).map(([zone, t, text]) => {
        const z = ZONES.find((x) => x.id === zone)!;
        const p = pointAt(z.start + (z.end - z.start) * t);
        return (
          <Html key={zone + t} position={[p.x, 0.05, p.z + 2.6]} center zIndexRange={[20, 0]}>
            <div className="pointer-events-none whitespace-nowrap rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-slate-200">{text}</div>
          </Html>
        );
      })}
    </>
  );
}

// Рабочие на постах (в мировых координатах, рассчитаны от точек пути)
const WORKERS = (() => {
  const out: { x: number; z: number; rot: number }[] = [];
  const add = (zone: string, t: number, side: number) => {
    const z = ZONES.find((x) => x.id === zone)!;
    const p = pointAt(z.start + (z.end - z.start) * t);
    out.push({ x: p.x + Math.sin(p.heading) * side, z: p.z + Math.cos(p.heading) * side, rot: p.heading + (side > 0 ? Math.PI : 0) });
  };
  JIG_T.forEach((t) => add("welding", t, -1.5));
  add("painting", 0.6, 1.3); add("painting", 0.93, -1.3);
  [0.25, 0.42, 0.6].forEach((t, i) => add("assembly", t, i % 2 ? 1.3 : -1.3));
  add("qc", 0.76, -1.6); add("qc", 0.36, 1.6);
  return out;
})();

export interface EditorProps {
  items: Item[];
  selectedId: string | null;
  invalid: Set<string>;
  placing: ObjType | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, z: number) => void;
  onPlace: (x: number, z: number) => void;
  onCommit?: () => void;
}

export interface Factory3DProps {
  nodes: FactoryNode[]; override?: Record<string, Status>; highlight?: string | null;
  onSelect: (id: string) => void; event?: FlowEvent | null; focusId?: string | null;
  /** Режим «Редактор цифрового двойника» */
  editor?: EditorProps;
}

/** Предохранитель: ошибка внутри 3D не роняет страницу — сцена пересоздаётся. */
class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) {
    console.warn("3D-сцена пересоздаётся после ошибки:", err);
    this.props.onError();
  }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function Factory3D(props: Factory3DProps & { motion: boolean }) {
  // Адаптивное качество: при просадке FPS — ниже разрешение и без свечения
  const [dpr, setDpr] = useState(1.5);
  const [bloom, setBloom] = useState(true);
  const [paused, setPaused] = useState(false);
  // Потеря WebGL-контекста (сброс драйвера, нехватка памяти GPU, сон ноутбука) — пересоздаём холст,
  // а не оставляем белый прямоугольник. Состояние сцены (расстановка редактора, фокус) хранится снаружи.
  const [gen, setGen] = useState(0);
  const [lost, setLost] = useState(false);
  const restart = () => {
    setLost(true); // сразу снимаем холст: композер свечения падает на потерянном контексте
    window.setTimeout(() => { setGen((g) => g + 1); setLost(false); }, 300);
  };
  return (
    <div className="h-full w-full" data-quality={bloom ? "high" : "low"} data-gl-restarts={gen}
      onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
    {lost ? <div className="flex h-full items-center justify-center text-xs text-muted">Восстановление 3D…</div> : (
    <SceneBoundary onError={restart}>
    <Canvas key={gen} dpr={dpr}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); restart(); }, { once: true });
      }} camera={{ position: [3.2, 17, 22.5], fov: 45 }} gl={{ antialias: true, powerPreference: "high-performance" }}
      frameloop={props.motion ? "always" : "demand"}>
      {/* Просадка FPS → разрешение 1× и без свечения; восстановление — только разрешение (без «мигания» эффекта) */}
      <PerformanceMonitor onDecline={() => { setDpr(1); setBloom(false); }} onIncline={() => setDpr(1.5)} flipflops={3} onFallback={() => { setDpr(1); setBloom(false); }} />
      <Scene {...props} bloom={bloom} paused={paused} />
    </Canvas>
    </SceneBoundary>
    )}
    </div>
  );
}
