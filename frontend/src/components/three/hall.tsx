import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Status } from "../../api/types";
import { STATUS_HEX } from "../../lib/format";
import { pointAt, ROW, TOP_LEN, ZONES, type ZoneSpan } from "./layout";

/** Цех: пол с разметкой, колонны, линейные светильники; андон-колонны и контуры зон — индикаторы статуса. */

const HALL_W = TOP_LEN + 2 * ROW + 14;
const HALL_D = 2 * ROW + 16;

export function Hall() {
  // Колонны по сетке 7 м (инстансы)
  const cols = useMemo(() => {
    const out: [number, number][] = [];
    // Только дальний ряд колонн: ближние перекрывали бы обзор камеры
    for (let x = -HALL_W / 2 + 2; x <= HALL_W / 2 - 2; x += 7) out.push([x, -HALL_D / 2 + 1]);
    return out;
  }, []);
  const colRef = useRef<THREE.InstancedMesh>(null);
  const lampRef = useRef<THREE.InstancedMesh>(null);
  useFrame(() => {
    const c = colRef.current, l = lampRef.current;
    if (!c || !l || c.userData.done) return;
    const o = new THREE.Object3D();
    cols.forEach(([x, z], i) => { o.position.set(x, 3, z); o.updateMatrix(); c.setMatrixAt(i, o.matrix); });
    c.instanceMatrix.needsUpdate = true;
    // Светильники над рядами линии
    let n = 0;
    // Светильники над дальним рядом: над ближним они перечёркивали бы кадр
    for (let x = -HALL_W / 2 + 4; x < HALL_W / 2 - 4; x += 3.2) { o.position.set(x, 6.2, -ROW - 1); o.updateMatrix(); l.setMatrixAt(n++, o.matrix); }
    l.count = n; l.instanceMatrix.needsUpdate = true;
    c.userData.done = true;
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[HALL_W, HALL_D]} />
        <meshStandardMaterial color="#59616b" roughness={0.85} metalness={0.05} />
      </mesh>
      {/* Проходы — жёлтая разметка вдоль рядов, как на фото */}
      {[-ROW - 1.6, -ROW + 1.6, ROW - 1.6, ROW + 1.6].map((z) => (
        <mesh key={z} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, z]}>
          <planeGeometry args={[HALL_W - 6, 0.07]} />
          <meshBasicMaterial color="#e3b400" />
        </mesh>
      ))}
      <instancedMesh ref={colRef} args={[undefined, undefined, cols.length]}>
        <boxGeometry args={[0.35, 6, 0.35]} />
        <meshStandardMaterial color="#d7dde4" roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={lampRef} args={[undefined, undefined, 60]}>
        <boxGeometry args={[2.6, 0.05, 0.12]} />
        <meshBasicMaterial color={new THREE.Color("#ffffff").multiplyScalar(1.6)} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/** Контур зоны на полу (цвет — статус) */
export function ZoneOutline({ zone, status, highlight }: { zone: ZoneSpan; status: Status; highlight: boolean }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const col = useMemo(() => new THREE.Color(STATUS_HEX[status]), [status]);
  const p = pointAt((zone.start + zone.end) / 2);
  const len = zone.end - zone.start;
  useFrame(({ clock }) => {
    if (!mat.current) return;
    const pulse = status === "critical" ? 0.6 + 0.4 * Math.sin(clock.elapsedTime * 3) : 1;
    mat.current.color.copy(col).multiplyScalar(status === "no_data" ? 0.5 : (highlight ? 2.4 : 1.4) * pulse);
  });
  const w = 4.2;
  const t = highlight ? 0.12 : 0.07;
  return (
    <group position={[p.x, 0.012, p.z]} rotation={[0, p.heading, 0]}>
      {[[0, -w / 2, len, t], [0, w / 2, len, t], [-len / 2, 0, t, w], [len / 2, 0, t, w]].map(([x, z, a, b], i) => (
        <mesh key={i} position={[x, 0, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[a, b]} />
          <meshBasicMaterial ref={i === 0 ? mat : undefined} color={col} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Андон-колонна: три секции (красный / жёлтый / зелёный), горит секция текущего статуса. */
export function Andon({ position, status }: { position: [number, number, number]; status: Status }) {
  const refs = [useRef<THREE.MeshBasicMaterial>(null), useRef<THREE.MeshBasicMaterial>(null), useRef<THREE.MeshBasicMaterial>(null)];
  const lamps: { s: Status; c: string }[] = [{ s: "critical", c: "#ff3030" }, { s: "warning", c: "#ffb000" }, { s: "ok", c: "#22e06b" }];
  useFrame(({ clock }) => {
    lamps.forEach((l, i) => {
      const m = refs[i].current;
      if (!m) return;
      const on = l.s === status;
      const blink = on && status === "critical" ? (Math.sin(clock.elapsedTime * 6) > 0 ? 1 : 0.25) : 1;
      m.color.set(l.c).multiplyScalar(on ? 3 * blink : 0.12);
    });
  });
  return (
    <group position={position}>
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 2.2, 8]} />
        <meshStandardMaterial color="#8a939e" />
      </mesh>
      {lamps.map((l, i) => (
        <mesh key={l.s} position={[0, 2.75 - i * 0.24, 0]}>
          <cylinderGeometry args={[0.11, 0.11, 0.22, 16]} />
          <meshBasicMaterial ref={refs[i]} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

export { ZONES };
