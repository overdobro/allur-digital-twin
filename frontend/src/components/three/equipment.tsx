import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Part } from "./batch";
import { JIG_T } from "./editorModel";
import * as THREE from "three";
import type { Status } from "../../api/types";
import { STATUS_HEX } from "../../lib/format";
import { DIPS, PAINT, pointAt, ROW, TURN, zoneById } from "./layout";

/**
 * Оборудование цехов по фото завода Allur и описанию процессов.
 * Статусы есть только у оборудования из данных: ABB-01, ABB-04, Камера-02, Конвейер-03. Остальное — типовое, без статусов.
 * Локальная система координат участка: x — по ходу кузова, z — поперёк; back() — сторона «от камеры».
 */

// ---------- примитивы ----------

const C = {
  steel: "#c3cbd4", dark: "#2b323c", darker: "#1c2229", yellow: "#f2c230", orange: "#e8742a", red: "#c32a37",
  blue: "#2f6fcc", white: "#e9edf1", glass: "#9ec9e8", wood: "#d9a441",
};

/** Коробка-деталь. Статичные — в пакетной отрисовке (batch.tsx); dynamic — под анимированными узлами. */
export function B({ s, p, c = C.steel, m = 0.3, r = 0.6, rot, dynamic }: {
  s: [number, number, number]; p: [number, number, number]; c?: string; m?: number; r?: number; rot?: [number, number, number]; dynamic?: boolean;
}) {
  return <Part kind="box" size={s} p={p} c={c} m={m} r={r} rot={rot} dynamic={dynamic} />;
}

function Cyl({ r, h, p, c = C.steel, rot, dynamic }: { r: number; h: number; p: [number, number, number]; c?: string; rot?: [number, number, number]; seg?: number; dynamic?: boolean }) {
  return <Part kind="cyl" size={[r, h, r]} p={p} c={c} m={0.4} r={0.5} rot={rot} dynamic={dynamic} />;
}

/** Сторона «от камеры»: верхний ряд — к стене (−z), нижний — к центру цеха (+z локально). */
export const back = (zoneId: string) => (zoneById(zoneId).row === "top" ? -1 : 1);

/** Группа в системе координат участка в точке t (0..1) его длины. */
export function At({ zone, t, children }: { zone: string; t: number; children: ReactNode }) {
  const z = zoneById(zone);
  const p = pointAt(z.start + (z.end - z.start) * t);
  return <group position={[p.x, 0, p.z]} rotation={[0, p.heading, 0]}>{children}</group>;
}

const zlen = (id: string) => { const z = zoneById(id); return z.end - z.start; };

/** Маячок оборудования из данных: цвет статуса, критичный — мигает. */
export function Beacon({ p, status }: { p: [number, number, number]; status: Status }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const col = useMemo(() => new THREE.Color(STATUS_HEX[status]), [status]);
  useFrame(({ clock }) => {
    if (!mat.current) return;
    const k = status === "critical" ? (Math.sin(clock.elapsedTime * 6) > 0 ? 3 : 0.4) : status === "warning" ? 2 + Math.sin(clock.elapsedTime * 3) : 1.4;
    mat.current.color.copy(col).multiplyScalar(k);
  });
  return (
    <mesh position={p}>
      <sphereGeometry args={[0.12, 16, 12]} />
      <meshBasicMaterial ref={mat} toneMapped={false} />
    </mesh>
  );
}

/** Роликовый конвейер под скиды. */
function RollerConveyor({ len }: { len: number; motion?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const n = Math.floor(len / 0.4);
  useEffect(() => {
    const o = new THREE.Object3D();
    for (let i = 0; i < n; i++) { o.position.set(-len / 2 + 0.2 + i * 0.4, 0.36, 0); o.rotation.set(Math.PI / 2, 0, 0); o.updateMatrix(); ref.current?.setMatrixAt(i, o.matrix); }
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [len, n]);
  return (
    <group>
      <B s={[len, 0.12, 0.08]} p={[0, 0.3, 0.42]} c={C.dark} />
      <B s={[len, 0.12, 0.08]} p={[0, 0.3, -0.42]} c={C.dark} />
      {Array.from({ length: Math.ceil(len / 1.5) }, (_, i) => (
        <B key={i} s={[0.08, 0.3, 0.9]} p={[-len / 2 + 0.4 + i * 1.5, 0.15, 0]} c={C.darker} />
      ))}
      <instancedMesh ref={ref} args={[undefined, undefined, n]}>
        <cylinderGeometry args={[0.04, 0.04, 0.84, 8]} />
        <meshStandardMaterial color="#8a949f" metalness={0.7} roughness={0.3} />
      </instancedMesh>
    </group>
  );
}

/** Рабочие (инстансы): тёмная форма с красными вставками, каска или кепка — как на фото. */
export function Workers({ spots }: { spots: { x: number; z: number; rot: number; helmet?: boolean }[] }) {
  const body = useRef<THREE.InstancedMesh>(null), jacket = useRef<THREE.InstancedMesh>(null), head = useRef<THREE.InstancedMesh>(null), cap = useRef<THREE.InstancedMesh>(null);
  useFrame(({ clock }) => {
    const o = new THREE.Object3D();
    spots.forEach((s, i) => {
      const bob = Math.sin(clock.elapsedTime * 1.3 + i * 1.7) * 0.15;
      const set = (m: THREE.InstancedMesh | null, y: number) => { if (!m) return; o.position.set(s.x, y, s.z); o.rotation.set(0, s.rot + bob, 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix); m.instanceMatrix.needsUpdate = true; };
      set(body.current, 0.45); set(jacket.current, 1.05); set(head.current, 1.48); set(cap.current, 1.6);
    });
  });
  const n = spots.length;
  return (
    <group>
      <instancedMesh ref={body} args={[undefined, undefined, n]}><boxGeometry args={[0.3, 0.9, 0.2]} /><meshStandardMaterial color="#20252c" /></instancedMesh>
      <instancedMesh ref={jacket} args={[undefined, undefined, n]}><boxGeometry args={[0.38, 0.5, 0.24]} /><meshStandardMaterial color="#b3202c" /></instancedMesh>
      <instancedMesh ref={head} args={[undefined, undefined, n]}><sphereGeometry args={[0.13, 12, 10]} /><meshStandardMaterial color="#c99a7a" /></instancedMesh>
      <instancedMesh ref={cap} args={[undefined, undefined, n]}><sphereGeometry args={[0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#e2512b" /></instancedMesh>
    </group>
  );
}

// ---------- склад комплектующих ----------

function Racks({ len, side, bins = true }: { len: number; side: number; bins?: boolean }) {
  const cols = ["#2f6fcc", "#f2c230", "#2f6fcc", "#7d8794"];
  return (
    <group position={[0, 0, side * 2.1]}>
      {Array.from({ length: Math.floor(len / 1.4) }, (_, i) => {
        const x = -len / 2 + 0.7 + i * 1.4;
        return (
          <group key={i} position={[x, 0, 0]}>
            {[-0.6, 0.6].map((dx) => <B key={dx} s={[0.06, 2.6, 0.06]} p={[dx, 1.3, 0.35]} c={C.orange} />)}
            {[-0.6, 0.6].map((dx) => <B key={`b${dx}`} s={[0.06, 2.6, 0.06]} p={[dx, 1.3, -0.35]} c={C.orange} />)}
            {[0.15, 0.95, 1.75, 2.5].map((y, j) => (
              <group key={y}>
                <B s={[1.26, 0.05, 0.76]} p={[0, y, 0]} c={C.blue} m={0.2} />
                {bins && y < 2.4 && [-0.35, 0.05, 0.42].map((bx, k) => <B key={bx} s={[0.32, 0.26, 0.5]} p={[bx, y + 0.16, 0]} c={cols[(i + j + k) % cols.length]} m={0.05} r={0.8} />)}
              </group>
            ))}
          </group>
        );
      })}
    </group>
  );
}

export function WarehouseIn() {
  const L = zlen("warehouse_in"), b = back("warehouse_in");
  return (
    <At zone="warehouse_in" t={0.5}>
      <RollerConveyor len={L} motion />
      <Racks len={L} side={b} />
      {/* Паллеты с тарой у прохода */}
      {[-1.6, 0.4, 2].map((x) => (
        <group key={x} position={[x, 0, -b * 2]}>
          <B s={[1, 0.12, 0.8]} p={[0, 0.06, 0]} c={C.wood} m={0} r={0.9} />
          <B s={[0.9, 0.5, 0.7]} p={[0, 0.37, 0]} c="#9aa4b0" m={0} r={0.9} />
        </group>
      ))}
    </At>
  );
}

// ---------- кузовной цех ----------

/** 6-осевой робот с клещами точечной сварки (оранжевый, как промышленные роботы на постах геометрии). */
export function Robot({ p, flip, status, phase, motion }: { p: [number, number, number]; flip: number; status: Status; phase: number; motion: boolean }) {
  const j1 = useRef<THREE.Group>(null), j2 = useRef<THREE.Group>(null), j3 = useRef<THREE.Group>(null), j5 = useRef<THREE.Group>(null);
  const sparks = useRef<THREE.Points>(null);
  const geo = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(30 * 3), 3)); return g; }, []);
  useFrame(({ clock }) => {
    if (!motion) return;
    const t = clock.elapsedTime * 1.4 + phase;
    if (j1.current) j1.current.rotation.y = Math.sin(t * 0.45) * 0.5;
    if (j2.current) j2.current.rotation.z = -0.35 + Math.sin(t * 0.9) * 0.18;
    if (j3.current) j3.current.rotation.z = 1.45 + Math.sin(t * 0.9 + 0.8) * 0.2;
    if (j5.current) j5.current.rotation.z = -0.9 + Math.sin(t * 1.3) * 0.3;
    const on = Math.sin(t * 2.2) > 0.4;
    if (sparks.current) {
      sparks.current.visible = on;
      if (on) {
        const a = geo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < 30; i++) a.setXYZ(i, (Math.random() - 0.5) * 0.5, Math.random() * 0.45, (Math.random() - 0.5) * 0.5);
        a.needsUpdate = true;
      }
    }
  });
  const orange = "#ec7a1c";
  return (
    <group position={p} rotation={[0, flip > 0 ? Math.PI : 0, 0]}>
      <B dynamic s={[0.7, 0.18, 0.7]} p={[0, 0.09, 0]} c={C.dark} />
      <group ref={j1} position={[0, 0.18, 0]}>
        <Cyl dynamic r={0.26} h={0.36} p={[0, 0.18, 0]} c={orange} />
        <group ref={j2} position={[0, 0.42, 0]} rotation={[0, 0, -0.35]}>
          <B dynamic s={[0.22, 1.15, 0.26]} p={[0, 0.55, 0]} c={orange} />
          <group ref={j3} position={[0, 1.12, 0]} rotation={[0, 0, 1.45]}>
            <Cyl dynamic r={0.14} h={0.34} p={[0, 0, 0]} c={orange} rot={[Math.PI / 2, 0, 0]} />
            <B dynamic s={[0.16, 1.0, 0.18]} p={[0, 0.5, 0]} c={orange} />
            <group ref={j5} position={[0, 1.02, 0]} rotation={[0, 0, -0.9]}>
              {/* Сварочные клещи (C-образные) */}
              <B dynamic s={[0.12, 0.3, 0.12]} p={[0, 0.15, 0]} c={C.steel} m={0.7} r={0.3} />
              <B dynamic s={[0.36, 0.06, 0.06]} p={[0.15, 0.32, 0]} c={C.steel} m={0.7} r={0.3} />
              <B dynamic s={[0.06, 0.24, 0.06]} p={[0.31, 0.22, 0]} c={C.steel} m={0.7} r={0.3} />
              <points ref={sparks} geometry={geo} position={[0.31, 0.05, 0]}>
                <pointsMaterial color={new THREE.Color("#ffc061").multiplyScalar(3)} size={0.05} toneMapped={false} />
              </points>
            </group>
          </group>
        </group>
      </group>
      <Beacon p={[0.3, 0.3, 0.3]} status={status} />
    </group>
  );
}

/** Кондуктор (сварочная оснастка) с красными и жёлтыми прижимами — по фото. */
export function Jig() {
  return (
    <group>
      <B s={[2.3, 0.25, 1.3]} p={[0, 0.2, 0]} c="#cfc8b6" m={0.2} />
      {[-1, 1].map((sx) => [-0.55, 0.55].map((sz) => (
        <group key={`${sx}${sz}`} position={[sx * 0.95, 0.42, sz]}>
          <B s={[0.12, 0.35, 0.12]} p={[0, 0.17, 0]} c={C.steel} />
          <B s={[0.2, 0.08, 0.14]} p={[0, 0.38, 0]} c={sx * sz > 0 ? C.red : C.yellow} />
        </group>
      )))}
      {[-0.35, 0.35].map((x) => <B key={x} s={[0.1, 0.5, 0.1]} p={[x, 0.55, 0.62]} c={C.red} />)}
    </group>
  );
}

/** Ручные клещи точечной сварки на балансире, оранжевый трансформатор, подвешены к красному рельсу. */
function HangingGun({ x, z, phase, motion }: { x: number; z: number; phase: number; motion: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (motion && g.current) g.current.rotation.z = Math.sin(clock.elapsedTime * 0.9 + phase) * 0.12; });
  return (
    <group position={[x, 3.3, z]}>
      <B dynamic s={[0.45, 0.35, 0.35]} p={[0, -0.25, 0]} c={C.orange} />
      <group ref={g} position={[0, -0.45, 0]}>
        <B dynamic s={[0.03, 1.1, 0.03]} p={[0, -0.55, 0]} c="#222" />
        <B dynamic s={[0.14, 0.32, 0.14]} p={[0, -1.25, 0]} c={C.steel} m={0.7} r={0.3} />
        <B dynamic s={[0.3, 0.05, 0.05]} p={[0.12, -1.42, 0]} c={C.steel} m={0.7} r={0.3} />
      </group>
    </group>
  );
}

export function WeldingShop({ motion }: { motion: boolean }) {
  const L = zlen("welding");
  return (
    <group>
      <At zone="welding" t={0.5}>
        <RollerConveyor len={L} motion={motion} />
        {/* Красные подвесные рельсы над постами ручной сварки */}
        {[-1.3, 1.3].map((z) => <B key={z} s={[L * 0.62, 0.1, 0.1]} p={[-L * 0.17, 3.35, z]} c={C.red} />)}
        {[-0.45, -0.2].map((t) => [-1.3, 1.3].map((z) => <B key={`${t}${z}`} s={[0.1, 3.35, 0.1]} p={[t * L, 1.67, z * 1.25]} c={C.red} />))}
      </At>
      {/* Посты подсборок в кондукторах сбоку от линии */}
      {JIG_T.map((t, i) => (
        <At key={t} zone="welding" t={t}>
          <HangingGun x={-0.4} z={-1.3} phase={i} motion={motion} />
          <HangingGun x={0.5} z={1.3} phase={i + 2} motion={motion} />
        </At>
      ))}
      {/* Пост геометрии: площадка (роботы ABB-01/ABB-04 — объекты редактора, editorModel.ts) */}
      <At zone="welding" t={0.72}>
        <B s={[3.2, 0.06, 3.2]} p={[0.2, 0.01, 0]} c="#3a414b" />
      </At>
      {/* Контроль геометрии: синяя арка с лазерными линиями */}
      <At zone="welding" t={0.92}>
        {[-1.05, 1.05].map((z) => <B key={z} s={[0.18, 2.2, 0.18]} p={[0, 1.1, z]} c={C.blue} />)}
        <B s={[0.25, 0.2, 2.3]} p={[0, 2.2, 0]} c={C.blue} />
        <mesh position={[0, 1.2, 0]}>
          <boxGeometry args={[0.02, 1.9, 2]} />
          <meshBasicMaterial color={new THREE.Color("#ff3355").multiplyScalar(1.8)} transparent opacity={0.25} toneMapped={false} />
        </mesh>
      </At>
    </group>
  );
}

// ---------- окраска ----------

function Tanks({ motion }: { motion: boolean }) {
  const L = zlen("painting");
  const t0 = PAINT.tanks[0], t1 = PAINT.tanks[1];
  const surf = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => { if (motion && surf.current) surf.current.emissiveIntensity = 0.25 + Math.sin(clock.elapsedTime * 2) * 0.05; });
  const seg = (t1 - t0) * L / DIPS;
  return (
    <At zone="painting" t={(t0 + t1) / 2}>
      {Array.from({ length: DIPS }, (_, i) => (
        <group key={i} position={[-((t1 - t0) * L) / 2 + seg * (i + 0.5), 0, 0]}>
          <B s={[seg - 0.12, 0.9, 1.5]} p={[0, 0.45, 0]} c="#4b5560" m={0.5} r={0.4} />
          <mesh position={[0, 0.88, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[seg - 0.2, 1.38]} />
            <meshStandardMaterial ref={i === 0 ? surf : undefined} color="#2f5966" emissive="#3a8aa0" emissiveIntensity={0.25} metalness={0.2} roughness={0.15} />
          </mesh>
        </group>
      ))}
      {/* Подвесной путь над ваннами */}
      <B s={[(t1 - t0) * L + 1.5, 0.12, 0.12]} p={[0, 3.5, -0.5]} c={C.dark} />
      {[-1, 0, 1].map((k) => <B key={k} s={[0.12, 3.5, 0.12]} p={[k * (t1 - t0) * L * 0.45, 1.75, -1.1]} c={C.dark} />)}
    </At>
  );
}

function Oven() {
  const L = zlen("painting");
  const len = (PAINT.oven[1] - PAINT.oven[0]) * L;
  return (
    <At zone="painting" t={(PAINT.oven[0] + PAINT.oven[1]) / 2}>
      <RollerConveyor len={len + 0.6} motion />
      <B s={[len, 1.7, 1.7]} p={[0, 1.15, 0]} c="#b9c1ca" m={0.6} r={0.35} />
      {/* Воздуховоды и горелки сверху */}
      <Cyl r={0.18} h={len} p={[0, 2.15, -0.4]} rot={[0, 0, Math.PI / 2]} c="#8e98a4" />
      <B s={[0.6, 0.5, 0.6]} p={[len * 0.3, 2.3, 0.3]} c="#d06a2a" />
      {/* Тёплое свечение на входе и выходе */}
      {[-1, 1].map((k) => (
        <mesh key={k} position={[k * (len / 2 + 0.01), 1.0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[1.2, 1.1]} />
          <meshBasicMaterial color={new THREE.Color("#ff7a30").multiplyScalar(1.4)} transparent opacity={0.55} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </At>
  );
}

/** Камера нанесения ЛКП (Камера-02 из данных): стеклянные стены, 4 робота окраски, приточная установка с фильтрами на крыше. */
function PaintBooth({ status, motion }: { status: Status; motion: boolean }) {
  const L = zlen("painting");
  const len = (PAINT.booth[1] - PAINT.booth[0]) * L;
  const mist = useRef<THREE.Points>(null);
  const arms = useRef<THREE.Group[]>([]);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry(), p = new Float32Array(220 * 3);
    for (let i = 0; i < 220; i++) { p[i * 3] = (Math.random() - 0.5) * len * 0.9; p[i * 3 + 1] = 0.3 + Math.random() * 1.6; p[i * 3 + 2] = (Math.random() - 0.5) * 1.6; }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return g;
  }, [len]);
  useFrame(({ clock }, dt) => {
    if (!motion) return;
    arms.current.forEach((a, i) => { if (a) a.rotation.z = -0.6 + Math.sin(clock.elapsedTime * 1.6 + i) * 0.5; });
    const a = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < 220; i++) { let y = a.getY(i) - dt * 0.45; if (y < 0.3) y = 1.9; a.setY(i, y); }
    a.needsUpdate = true;
  });
  return (
    <At zone="painting" t={(PAINT.booth[0] + PAINT.booth[1]) / 2}>
      <RollerConveyor len={len + 0.6} motion={motion} />
      <mesh position={[0, 1.25, 0]}>
        <boxGeometry args={[len, 2.5, 3.2]} />
        <meshStandardMaterial color={C.glass} transparent opacity={0.12} metalness={0.1} roughness={0.05} depthWrite={false} />
      </mesh>
      {/* Каркас камеры */}
      {[-1, 1].map((sx) => [-1, 1].map((sz) => <B key={`${sx}${sz}`} s={[0.1, 2.5, 0.1]} p={[sx * len / 2, 1.25, sz * 1.6]} c={C.white} />))}
      <B s={[len, 0.1, 3.3]} p={[0, 2.5, 0]} c={C.white} />
      {/* Роботы окраски (белые) по две стороны */}
      {[-0.25, 0.25].map((x) => [-1, 1].map((sz, k) => (
        <group key={`${x}${sz}`} position={[x * len, 0, sz * 1.2]}>
          <Cyl dynamic r={0.18} h={0.5} p={[0, 0.25, 0]} c={C.white} />
          <group ref={(r) => { if (r) arms.current[(x > 0 ? 2 : 0) + k] = r; }} position={[0, 0.55, 0]} rotation={[0, sz > 0 ? Math.PI : 0, 0]}>
            <B dynamic s={[0.14, 0.9, 0.14]} p={[0, 0.45, 0]} c={C.white} />
            <B dynamic s={[0.6, 0.12, 0.12]} p={[0.3, 0.9, 0]} c={C.white} />
            <Cyl dynamic r={0.06} h={0.18} p={[0.62, 0.9, 0]} c="#7d8794" rot={[0, 0, Math.PI / 2]} />
          </group>
        </group>
      )))}
      <points ref={mist} geometry={geo}>
        <pointsMaterial color="#e8eef5" size={0.05} transparent opacity={0.6} depthWrite={false} />
      </points>
      {/* Приточная установка с фильтрами — связь с событием «замена фильтра» Камеры-02 */}
      <B s={[len * 0.6, 0.8, 1.6]} p={[0, 3.0, 0]} c="#9aa4ae" m={0.5} r={0.4} />
      {[-0.2, 0, 0.2].map((x) => <B key={x} s={[0.5, 0.55, 0.05]} p={[x * len, 3.0, 0.83]} c="#5d6772" />)}
      <Cyl r={0.22} h={1.2} p={[len * 0.32, 3.0, 0]} rot={[0, 0, Math.PI / 2]} c="#8e98a4" />
      <Beacon p={[len / 2 - 0.2, 3.55, 0.7]} status={status} />
    </At>
  );
}

/** Компрессорная станция и ресиверы — подготовка сжатого воздуха для окраски (типовое оборудование, объект редактора). */
export function CompressorStation() {
  return (
    <group>
      {[-1.4, 0].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <B s={[1.1, 1.1, 0.8]} p={[0, 0.55, 0]} c="#2f6fcc" m={0.3} />
          <B s={[1.0, 0.05, 0.7]} p={[0, 1.12, 0]} c="#1d4f9a" />
        </group>
      ))}
      {[1.2, 1.9].map((x) => <Cyl key={x} r={0.3} h={1.8} p={[x, 0.9, 0]} c="#d9dee4" />)}
      <Cyl r={0.06} h={3.6} p={[0.25, 2.0, 0]} rot={[0, 0, Math.PI / 2]} c="#2f6fcc" />
    </group>
  );
}

/** Датчик / шкаф контроля на стойке со светодиодом. */
export function SensorUnit({ status = "ok" }: { status?: Status }) {
  return (
    <group>
      <B s={[0.08, 1.2, 0.08]} p={[0, 0.6, 0]} c="#7d8794" />
      <B s={[0.4, 0.3, 0.25]} p={[0, 1.3, 0]} c="#e9edf1" />
      <B s={[0.02, 0.35, 0.02]} p={[0.12, 1.6, 0]} c="#333" />
      <Beacon p={[0, 1.3, 0.14]} status={status} />
    </group>
  );
}

/** Буфер-накопитель на два кузова. */
export function BufferRack() {
  return (
    <group>
      {[-1.1, 1.1].map((x) => [-0.6, 0.6].map((z) => <B key={`${x}${z}`} s={[0.08, 1.6, 0.08]} p={[x, 0.8, z]} c="#e8742a" />))}
      {[0.35, 1.25].map((y) => <B key={y} s={[2.3, 0.06, 1.3]} p={[0, y, 0]} c="#2f6fcc" m={0.2} />)}
      {[0.38, 1.28].map((y) => <B key={`c${y}`} s={[1.7, 0.3, 0.7]} p={[0, y + 0.18, 0]} c="#3d434b" m={0.5} r={0.4} />)}
    </group>
  );
}

/** Рабочий пост: верстак, экран, инструмент. */
export function Workstation() {
  return (
    <group>
      <B s={[1.4, 0.06, 0.8]} p={[0, 0.85, 0]} c="#d9a441" m={0} r={0.9} />
      {[-0.65, 0.65].map((x) => [-0.35, 0.35].map((z) => <B key={`${x}${z}`} s={[0.05, 0.85, 0.05]} p={[x, 0.42, z]} c="#7d8794" />))}
      <B s={[0.5, 0.32, 0.03]} p={[0.3, 1.1, -0.3]} c="#3fd18a" />
      <B s={[0.35, 0.18, 0.25]} p={[-0.35, 0.97, 0]} c="#c32a37" />
    </group>
  );
}

/** Пост контроля с камерами машинного зрения (арка над линией). */
export function InspectionArch() {
  return (
    <group>
      {[-1.15, 1.15].map((z) => <B key={z} s={[0.16, 2.3, 0.16]} p={[0, 1.15, z]} c="#e9edf1" />)}
      <B s={[0.25, 0.18, 2.5]} p={[0, 2.3, 0]} c="#e9edf1" />
      {[-0.7, 0, 0.7].map((z) => <B key={z} s={[0.16, 0.14, 0.16]} p={[0, 2.12, z]} c="#1c2229" />)}
      {[-1.0, 1.0].map((z) => <B key={`s${z}`} s={[0.14, 0.14, 0.14]} p={[0, 1.2, z * 1.0]} c="#1c2229" />)}
    </group>
  );
}

function SealingAndPolish() {
  const L = zlen("painting");
  return (
    <>
      <At zone="painting" t={(PAINT.sealing[0] + PAINT.sealing[1]) / 2}>
        <RollerConveyor len={(PAINT.sealing[1] - PAINT.sealing[0]) * L + 0.4} motion />
        {[-1.1, 1.1].map((z) => <B key={z} s={[0.5, 1.0, 0.4]} p={[0, 0.5, z]} c="#7d8794" />)}
      </At>
      <At zone="painting" t={(PAINT.polish[0] + PAINT.polish[1]) / 2}>
        <RollerConveyor len={(PAINT.polish[1] - PAINT.polish[0]) * L + 0.4} motion />
        <LightArches count={3} spacing={0.5} />
      </At>
    </>
  );
}

export function PaintShop({ booth, motion }: { booth: Status; motion: boolean }) {
  return (
    <group>
      <Tanks motion={motion} />
      <Oven />
      <SealingAndPolish />
      <PaintBooth status={booth} motion={motion} />
    </group>
  );
}

/** Буфер окрашенных кузовов на повороте: роликовый путь по дуге. */
export function TurnBuffer() {
  const pts = useMemo(() => {
    const out: { x: number; z: number; h: number }[] = [];
    for (let s = TURN.start; s <= TURN.end; s += 0.9) { const p = pointAt(s); out.push({ x: p.x, z: p.z, h: p.heading }); }
    return out;
  }, []);
  return (
    <group>
      {pts.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]} rotation={[0, p.h, 0]}>
          <B s={[0.95, 0.12, 0.08]} p={[0, 0.3, 0.42]} c={C.dark} />
          <B s={[0.95, 0.12, 0.08]} p={[0, 0.3, -0.42]} c={C.dark} />
          <Cyl r={0.04} h={0.84} p={[0, 0.36, 0]} rot={[Math.PI / 2, 0, 0]} c="#8a949f" seg={8} />
        </group>
      ))}
    </group>
  );
}

// ---------- сборка ----------

function numberTexture(n: number) {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 40;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 64, 40);
  g.fillStyle = "#111"; g.font = "bold 28px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(String(n).padStart(2, "0"), 32, 21);
  return new THREE.CanvasTexture(c);
}

/** Жёлтый подвесной конвейер с порталами и номерами (по фото), привод — Конвейер-03 из данных. */
export function AssemblyShop({ conveyor, motion }: { conveyor: Status; motion: boolean }) {
  const L = zlen("assembly"), b = back("assembly");
  const portals = 7;
  const tex = useMemo(() => Array.from({ length: portals }, (_, i) => numberTexture(i + 1)), []);
  const chain = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => { if (motion && chain.current) (chain.current.material as THREE.MeshStandardMaterial).map!.offset.x -= dt * 0.8; });
  const chainTex = useMemo(() => {
    const c = document.createElement("canvas"); c.width = 32; c.height = 4;
    const g = c.getContext("2d")!; g.fillStyle = "#444"; g.fillRect(0, 0, 32, 4); g.fillStyle = "#999"; g.fillRect(0, 0, 8, 4);
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(L * 3, 1); return t;
  }, [L]);
  return (
    <group>
      <At zone="assembly" t={0.5}>
        {/* Продольные балки и цепь */}
        {[-0.75, 0.75].map((z) => <B key={z} s={[L + 0.6, 0.22, 0.14]} p={[0, 3.75, z]} c={C.yellow} />)}
        <mesh ref={chain} position={[0, 3.6, -0.5]}>
          <boxGeometry args={[L + 0.6, 0.06, 0.06]} />
          <meshStandardMaterial map={chainTex} />
        </mesh>
        {/* Порталы с номерами */}
        {Array.from({ length: portals }, (_, i) => {
          const x = -L / 2 + 0.4 + i * ((L - 0.8) / (portals - 1));
          return (
            <group key={i} position={[x, 0, 0]}>
              {[-1.15, 1.15].map((z) => (
                <group key={z}>
                  <B s={[0.2, 3.9, 0.2]} p={[0, 1.95, z]} c={C.yellow} />
                  {/* Чёрно-жёлтый отбойник внизу стойки */}
                  <B s={[0.24, 0.5, 0.24]} p={[0, 0.25, z]} c="#1d1f22" />
                </group>
              ))}
              <B s={[0.24, 0.24, 2.5]} p={[0, 3.9, 0]} c={C.yellow} />
              {/* Табличка с номером — на стороне, обращённой к камере */}
              <mesh position={[0, 3.55, -b * 1.27]} rotation={[0, b > 0 ? Math.PI : 0, 0]}>
                <planeGeometry args={[0.42, 0.26]} />
                <meshBasicMaterial map={tex[i]} />
              </mesh>
              {/* Балансиры инструмента */}
              <Cyl r={0.08} h={0.16} p={[0.5, 3.1, 0.9]} c={C.yellow} />
              <B s={[0.02, 0.9, 0.02]} p={[0.5, 2.6, 0.9]} c="#333" />
            </group>
          );
        })}
        {/* Привод конвейера — Конвейер-03 */}
        <B s={[0.9, 0.7, 0.8]} p={[L / 2 + 0.2, 3.7, 0]} c="#4b5560" />
        <Beacon p={[L / 2 + 0.2, 4.2, 0]} status={conveyor} />
        {/* Стеллажи с комплектующими вдоль линии (жёлтые, как на фото) */}
        <group position={[0, 0, b * 0.6]}><Racks len={L * 0.7} side={1} /></group>
      </At>
      {/* «Свадьба»: подъёмная платформа с силовым агрегатом */}
      <At zone="assembly" t={0.88}>
        <B s={[1.8, 0.2, 1.1]} p={[0, 0.1, 0]} c="#3a414b" />
        <B s={[0.7, 0.45, 0.6]} p={[0.2, 0.42, 0]} c="#59616b" m={0.6} />
      </At>
    </group>
  );
}

// ---------- тестовая линия и готовая продукция ----------

function LightArches({ count, spacing }: { count: number; spacing: number }) {
  const lamp = useMemo(() => new THREE.Color("#ffffff").multiplyScalar(2.2), []);
  return (
    <group>
      {Array.from({ length: count }, (_, i) => (
        <group key={i} position={[(i - (count - 1) / 2) * spacing, 0, 0]}>
          {[-1.1, 1.1].map((z) => (
            <mesh key={z} position={[0, 1.1, z]}>
              <boxGeometry args={[0.08, 2.2, 0.08]} />
              <meshBasicMaterial color={lamp} toneMapped={false} />
            </mesh>
          ))}
          <mesh position={[0, 2.2, 0]}>
            <boxGeometry args={[0.08, 0.08, 2.28]} />
            <meshBasicMaterial color={lamp} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function TestLine({ motion }: { motion: boolean }) {
  const rollers = useRef<THREE.Group>(null);
  const water = useRef<THREE.Points>(null);
  const wgeo = useMemo(() => {
    const g = new THREE.BufferGeometry(), p = new Float32Array(260 * 3);
    for (let i = 0; i < 260; i++) { p[i * 3] = (Math.random() - 0.5) * 1.8; p[i * 3 + 1] = Math.random() * 2; p[i * 3 + 2] = (Math.random() - 0.5) * 1.8; }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return g;
  }, []);
  useFrame((_, dt) => {
    if (!motion) return;
    rollers.current?.children.forEach((r) => { r.rotation.x += dt * 8; });
    const a = wgeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < 260; i++) { let y = a.getY(i) - dt * 3; if (y < 0) y = 2; a.setY(i, y); }
    a.needsUpdate = true;
  });
  return (
    <group>
      {/* Развал-схождение: платформы с поворотными кругами и жёлтыми ограждениями */}
      <At zone="qc" t={0.14}>
        {[-0.38, 0.38].map((z) => <B key={z} s={[2, 0.12, 0.35]} p={[0, 0.06, z]} c="#4b5560" />)}
        {[-0.55, 0.55].map((x) => [-0.38, 0.38].map((z) => <Cyl key={`${x}${z}`} r={0.16} h={0.03} p={[x, 0.13, z]} c="#9aa4ae" />))}
        {[-1.1, 1.1].map((z) => <B key={z} s={[2, 0.5, 0.05]} p={[0, 0.25, z]} c={C.yellow} />)}
      </At>
      {/* Роликовый тормозной стенд */}
      <At zone="qc" t={0.36}>
        <B s={[1.6, 0.08, 1.4]} p={[0, 0.02, 0]} c="#2b323c" />
        <group ref={rollers}>
          {[-0.62, -0.42].map((x) => [-0.38, 0.38].map((z) => <Cyl dynamic key={`${x}${z}`} r={0.08} h={0.34} p={[x, 0.06, z]} rot={[Math.PI / 2, 0, 0]} c="#c3cbd4" />))}
        </group>
        <B s={[0.4, 1.4, 0.3]} p={[0.2, 0.7, -1.2]} c="#2f6fcc" />
        <B s={[0.36, 0.3, 0.02]} p={[0.2, 1.1, -1.04]} c="#7fd0ff" />
      </At>
      {/* Water Test: кабина дождевания */}
      <At zone="qc" t={0.6}>
        <mesh position={[0, 1.15, 0]}>
          <boxGeometry args={[2.2, 2.3, 2.4]} />
          <meshStandardMaterial color="#8fb6d6" transparent opacity={0.16} depthWrite={false} />
        </mesh>
        {[-1.1, 1.1].map((x) => [-1.2, 1.2].map((z) => <B key={`${x}${z}`} s={[0.08, 2.3, 0.08]} p={[x, 1.15, z]} c="#7d8794" />))}
        <points ref={water} geometry={wgeo}>
          <pointsMaterial color="#a6d8ff" size={0.04} transparent opacity={0.7} depthWrite={false} />
        </points>
      </At>
      {/* Диагностика электроники */}
      <At zone="qc" t={0.76}>
        <B s={[0.5, 1.3, 0.4]} p={[0, 0.65, -1.3]} c="#3a414b" />
        <B s={[0.44, 0.3, 0.02]} p={[0, 1.05, -1.09]} c="#3fd18a" />
      </At>
      {/* Световой тоннель финальной проверки — как на фото */}
      <At zone="qc" t={0.92}>
        <LightArches count={4} spacing={0.32} />
      </At>
    </group>
  );
}

/** Зона готовой продукции: стоянка с рядами автомобилей (статичные силуэты). */
export function FinishedGoods() {
  const b = back("warehouse_out");
  const cars = [];
  const colors = ["#f1f3f5", "#c7ccd3", "#1d2026", "#1f3f73", "#f1f3f5", "#8e1d22"];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) cars.push({ x: -2.3 + i * 0.95, z: b * (2.2 + j * 1.9), c: colors[(i + j * 3) % colors.length] });
  return (
    <At zone="warehouse_out" t={0.5}>
      {cars.map((c, i) => (
        <group key={i} position={[c.x, 0, c.z]} rotation={[0, Math.PI / 2, 0]}>
          <B s={[1.6, 0.36, 0.72]} p={[0, 0.3, 0]} c={c.c} m={0.55} r={0.3} />
          <B s={[0.85, 0.24, 0.66]} p={[-0.05, 0.6, 0]} c="#141a22" m={0.8} r={0.1} />
        </group>
      ))}
      {/* Разметка мест стоянки */}
      {Array.from({ length: 7 }, (_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[-2.78 + i * 0.95, 0.006, b * 3.15]}>
          <planeGeometry args={[0.04, 4]} />
          <meshBasicMaterial color="#e9edf1" />
        </mesh>
      ))}
    </At>
  );
}

export { ROW };
