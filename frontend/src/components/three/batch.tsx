import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";

/**
 * Пакетная отрисовка статичных деталей оборудования.
 * Каждая неподвижная коробка/цилиндр при монтировании сообщает свою мировую матрицу и цвет;
 * всё рисуется несколькими InstancedMesh (по типу геометрии и материалу) вместо сотен отдельных мешей.
 */

type Kind = "box" | "cyl";
interface Item { kind: Kind; matrix: THREE.Matrix4; color: THREE.Color; m: number; r: number }

class Store {
  items = new Map<number, Item>();
  private next = 0;
  private listeners = new Set<() => void>();
  private scheduled = false;
  add(item: Item) { const id = this.next++; this.items.set(id, item); this.bump(); return id; }
  remove(id: number) { this.items.delete(id); this.bump(); }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private bump() {
    // Сотни регистраций при монтировании — один пересчёт на кадр
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => { this.scheduled = false; this.listeners.forEach((f) => f()); });
  }
}

const Ctx = createContext<Store | null>(null);
/** Внутри NoBatch детали рисуются обычными мешами — для объектов, которые перетаскивают в редакторе. */
const NoBatchCtx = createContext(false);
export function NoBatch({ children }: { children: ReactNode }) {
  return <NoBatchCtx.Provider value={true}>{children}</NoBatchCtx.Provider>;
}

const GEO: Record<Kind, THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
};

function Batches({ store }: { store: Store }) {
  const [, setV] = useState(0);
  useEffect(() => store.subscribe(() => setV((v) => v + 1)), [store]);
  const groups = new Map<string, Item[]>();
  store.items.forEach((it) => {
    const k = `${it.kind}|${it.m}|${it.r}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(it);
  });
  return <>{[...groups.entries()].map(([k, list]) => <Batch key={k} list={list} />)}</>;
}

function Batch({ list }: { list: Item[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const cap = useMemo(() => Math.max(16, 2 ** Math.ceil(Math.log2(list.length))), [list.length]);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    list.forEach((it, i) => { m.setMatrixAt(i, it.matrix); m.setColorAt(i, it.color); });
    m.count = list.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  });
  const { kind, m, r } = list[0];
  return (
    <instancedMesh key={cap} ref={ref} args={[GEO[kind], undefined, cap]}>
      <meshStandardMaterial metalness={m} roughness={r} />
    </instancedMesh>
  );
}

export function BatchProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => new Store(), []);
  return (
    <Ctx.Provider value={store}>
      {children}
      <Batches store={store} />
    </Ctx.Provider>
  );
}

/**
 * Статичная деталь. Внутри BatchProvider — регистрируется в пакете (пустой group служит только для расчёта матрицы),
 * вне его или с dynamic — обычный меш (для подвижных частей).
 */
export function Part({ kind, size, p, c, m, r, rot, dynamic }: {
  kind: Kind; size: [number, number, number]; p: [number, number, number]; c: string; m: number; r: number;
  rot?: [number, number, number]; dynamic?: boolean;
}) {
  const store = useContext(Ctx);
  const noBatch = useContext(NoBatchCtx);
  const ref = useRef<THREE.Group>(null);
  const batched = !!store && !dynamic && !noBatch;
  useLayoutEffect(() => {
    if (!batched || !ref.current) return;
    ref.current.updateWorldMatrix(true, false);
    const matrix = ref.current.matrixWorld.clone().multiply(new THREE.Matrix4().makeScale(...size));
    const id = store!.add({ kind, matrix, color: new THREE.Color(c), m, r });
    return () => store!.remove(id);
  }, [batched, store, kind, size[0], size[1], size[2], p[0], p[1], p[2], c, m, r, rot?.[0], rot?.[1], rot?.[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  if (batched) return <group ref={ref} position={p} rotation={rot} />;
  return (
    <mesh position={p} rotation={rot} scale={size}>
      <primitive object={GEO[kind]} attach="geometry" />
      <meshStandardMaterial color={c} metalness={m} roughness={r} />
    </mesh>
  );
}
