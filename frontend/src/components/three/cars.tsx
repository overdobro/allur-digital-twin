import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { useFlowSim } from "../../lib/flowSim";
import { CAR_LEN, pointAt, poseAt, stageAt, type BodyStage } from "./layout";

/**
 * Кузова на линии. Вид меняется по ходу процесса: металл (сварка) → катафорезный грунт → цвет → собран (стёкла, колёса).
 * Модели — в пропорции месячного плана: Onix 2500 / Cobalt 1800 / JAC J7 500 (из 4800).
 * Отрисовка инстансами: ~10 вызовов на все кузова.
 */

const MAX = 70;
const W = 0.78; // ширина кузова
type Model = "onix" | "cobalt" | "j7";
const MODELS: Model[] = ["onix", "cobalt", "j7"];

/** Боковой профиль (x — длина от −L/2 до L/2, y — высота от 0). */
const PROFILES: Record<Model, { body: [number, number][]; glass: [number, number][] }> = {
  // Седан Onix: короче, плавная крыша
  onix: {
    body: [[-0.9, 0.08], [0.9, 0.08], [0.92, 0.3], [0.86, 0.36], [0.42, 0.4], [0.2, 0.62], [-0.32, 0.64], [-0.62, 0.42], [-0.9, 0.38]],
    glass: [[0.36, 0.42], [0.18, 0.6], [-0.3, 0.62], [-0.56, 0.43]],
  },
  // Седан Cobalt: длиннее, выше, более «ступенчатый» багажник
  cobalt: {
    body: [[-0.93, 0.08], [0.93, 0.08], [0.95, 0.32], [0.88, 0.38], [0.44, 0.42], [0.22, 0.66], [-0.36, 0.67], [-0.58, 0.44], [-0.93, 0.42]],
    glass: [[0.38, 0.44], [0.2, 0.64], [-0.34, 0.65], [-0.52, 0.45]],
  },
  // JAC J7: лифтбек — покатая задняя часть
  j7: {
    body: [[-0.92, 0.08], [0.92, 0.08], [0.94, 0.3], [0.87, 0.36], [0.4, 0.4], [0.16, 0.62], [-0.36, 0.62], [-0.86, 0.42], [-0.92, 0.36]],
    glass: [[0.34, 0.42], [0.14, 0.6], [-0.34, 0.6], [-0.78, 0.43]],
  },
};

function extrude(points: [number, number][], width: number, bevel: number) {
  const sh = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x * (CAR_LEN / 1.8), y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -width / 2);
  g.computeVertexNormals();
  return g;
}

// Модель кузова — по номеру, детерминированно, в пропорции плана
const modelOf = (id: number): Model => { const h = (id * 2654435761) % 4800; return h < 2500 ? "onix" : h < 4300 ? "cobalt" : "j7"; };
// Цвета ЛКП: на фото преобладают белые кузова
const PAINT = ["#f1f3f5", "#f1f3f5", "#f1f3f5", "#c7ccd3", "#1d2026", "#1f3f73", "#8e1d22", "#f1f3f5", "#c7ccd3", "#2b2f36"].map((c) => new THREE.Color(c));
const paintOf = (id: number) => PAINT[(id * 7919) % PAINT.length];
const BIW = new THREE.Color("#aab2bb");
const ECOAT = new THREE.Color("#3d434b");
const DEFECT = new THREE.Color("#ff3b3b");
const colorFor = (stage: BodyStage, id: number) => (stage === "biw" ? BIW : stage === "ecoat" ? ECOAT : paintOf(id));

export function Cars({ sim }: { sim: ReturnType<typeof useFlowSim> }) {
  const geos = useMemo(() => Object.fromEntries(MODELS.map((m) => [m, { body: extrude(PROFILES[m].body, W, 0.04), glass: extrude(PROFILES[m].glass, W + 0.03, 0.01) }])) as unknown as Record<Model, { body: THREE.BufferGeometry; glass: THREE.BufferGeometry }>, []);
  const bodyRefs = useRef<Record<Model, THREE.InstancedMesh | null>>({ onix: null, cobalt: null, j7: null });
  const glassRefs = useRef<Record<Model, THREE.InstancedMesh | null>>({ onix: null, cobalt: null, j7: null });
  const wheels = useRef<THREE.InstancedMesh>(null);
  const hangers = useRef<THREE.InstancedMesh>(null);
  const skids = useRef<THREE.InstancedMesh>(null);
  const o = useMemo(() => new THREE.Object3D(), []);
  const w = useMemo(() => new THREE.Object3D(), []);
  const tmp = useMemo(() => new THREE.Color(), []);

  useFrame((_, dt) => {
    sim.step(Math.min(dt, 0.05));
    const n = { onix: 0, cobalt: 0, j7: 0 }, g = { onix: 0, cobalt: 0, j7: 0 };
    let nw = 0, nh = 0, ns = 0;
    for (const car of sim.getCars()) {
      const m = modelOf(car.id);
      const bm = bodyRefs.current[m];
      if (!bm || n[m] >= MAX) continue;
      const p = pointAt(car.x);
      const pose = poseAt(car.x);
      const stage = stageAt(car.x);
      // Брак: кузов уходит в сторону — в зону доработки
      const d = car.defectAt ? Math.min(car.drop / sim.dropSeconds, 1) : 0;
      const side = d * 2.4;
      const yy = pose.carry === "hanger" ? pose.y - d * (pose.y - 0.3) : pose.y;
      o.position.set(p.x + Math.sin(p.heading) * side, yy, p.z + Math.cos(p.heading) * side);
      o.rotation.set(0, p.heading, 0);
      o.scale.setScalar(1);
      o.updateMatrix();
      bm.setMatrixAt(n[m], o.matrix);
      tmp.copy(colorFor(stage, car.id));
      if (car.defectAt) tmp.lerp(DEFECT, 0.75);
      bm.setColorAt(n[m], tmp);
      n[m]++;

      if (stage === "assembled") {
        const gm = glassRefs.current[m];
        if (gm) { gm.setMatrixAt(g[m]++, o.matrix); }
        if (wheels.current && nw < MAX * 4) {
          for (const [dx, dz] of [[0.55, 0.36], [0.55, -0.36], [-0.55, 0.36], [-0.55, -0.36]]) {
            w.position.set(dx, 0.1, dz);
            w.rotation.set(Math.PI / 2, 0, 0);
            w.updateMatrix();
            w.matrix.premultiply(o.matrix);
            wheels.current.setMatrixAt(nw++, w.matrix);
          }
        }
      }
      if (pose.carry === "hanger" && hangers.current && !car.defectAt) {
        hangers.current.setMatrixAt(nh++, o.matrix);
      } else if (pose.carry === "floor" && skids.current) {
        skids.current.setMatrixAt(ns++, o.matrix);
      }
    }
    for (const m of MODELS) {
      const bm = bodyRefs.current[m], gm = glassRefs.current[m];
      if (bm) { bm.count = n[m]; bm.instanceMatrix.needsUpdate = true; if (bm.instanceColor) bm.instanceColor.needsUpdate = true; }
      if (gm) { gm.count = g[m]; gm.instanceMatrix.needsUpdate = true; }
    }
    for (const [ref, c] of [[wheels, nw], [hangers, nh], [skids, ns]] as const) {
      if (ref.current) { ref.current.count = c; ref.current.instanceMatrix.needsUpdate = true; }
    }
  });

  return (
    <group>
      {MODELS.map((m) => (
        <instancedMesh key={m} ref={(r) => { bodyRefs.current[m] = r; }} args={[geos[m].body, undefined, MAX]} frustumCulled={false}>
          <meshStandardMaterial metalness={0.55} roughness={0.32} />
        </instancedMesh>
      ))}
      {MODELS.map((m) => (
        <instancedMesh key={`g${m}`} ref={(r) => { glassRefs.current[m] = r; }} args={[geos[m].glass, undefined, MAX]} frustumCulled={false}>
          <meshStandardMaterial color="#121821" metalness={0.9} roughness={0.08} />
        </instancedMesh>
      ))}
      <instancedMesh ref={wheels} args={[undefined, undefined, MAX * 4]} frustumCulled={false}>
        <cylinderGeometry args={[0.15, 0.15, 0.12, 16]} />
        <meshStandardMaterial color="#15181c" roughness={0.9} />
      </instancedMesh>
      {/* С-образный подвес (жёлтый, как на фото сборки) — в локальных координатах кузова */}
      <instancedMesh ref={hangers} args={[hangerGeometry(), undefined, MAX]} frustumCulled={false}>
        <meshStandardMaterial color="#f2c230" metalness={0.3} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={skids} args={[skidGeometry(), undefined, MAX]} frustumCulled={false}>
        <meshStandardMaterial color="#3a4250" metalness={0.6} roughness={0.5} />
      </instancedMesh>
    </group>
  );
}

function merge(parts: THREE.BufferGeometry[]) {
  // Простое объединение без зависимостей: только position/normal, индексы приведены к неиндексированным
  const geos = parts.map((p) => p.toNonIndexed());
  const pos = geos.flatMap((g) => Array.from(g.attributes.position.array as Float32Array));
  const nor = geos.flatMap((g) => Array.from(g.attributes.normal.array as Float32Array));
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

let _hanger: THREE.BufferGeometry | null = null;
function hangerGeometry() {
  // Две С-образные стойки по торцам кузова + верхняя балка (над крышей), подхват под порогами
  if (_hanger) return _hanger;
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-0.98, 0.98]) {
    parts.push(box(0.07, 1.25, 0.07, x, 0.62, -0.5)); // стойка с внешней стороны
    parts.push(box(0.07, 0.07, 1.05, x, 1.22, 0)); // верх
    parts.push(box(0.07, 0.07, 1.05, x, 0.02, 0)); // подхват
  }
  parts.push(box(2.05, 0.09, 0.09, 0, 1.25, -0.5)); // продольная балка
  parts.push(box(0.05, 0.6, 0.05, 0, 1.55, -0.5)); // подвеска к цепи
  _hanger = merge(parts);
  return _hanger;
}

let _skid: THREE.BufferGeometry | null = null;
function skidGeometry() {
  if (_skid) return _skid;
  _skid = merge([box(1.9, 0.06, 0.08, 0, 0.03, 0.28), box(1.9, 0.06, 0.08, 0, 0.03, -0.28), box(0.08, 0.06, 0.64, 0.7, 0.03, 0), box(0.08, 0.06, 0.64, -0.7, 0.03, 0)]);
  return _skid;
}
