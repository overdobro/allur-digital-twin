import type { ThreeEvent } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import type { Status } from "../../api/types";
import { NoBatch } from "./batch";
import { CATALOG, type Item } from "./editorModel";
import { BufferRack, CompressorStation, InspectionArch, Jig, Robot, SensorUnit, Workstation } from "./equipment";
import { Andon } from "./hall";

/** Отрисовка объектов редактора. В режиме редактора — выбор и перетаскивание, подсветка габаритов. */

export interface EditorHandlers {
  selectedId: string | null;
  invalid: Set<string>;
  onPointerDown: (id: string, e: ThreeEvent<PointerEvent>) => void;
}

function Body({ item, status, motion }: { item: Item; status: (item: Item) => Status; motion: boolean }) {
  switch (item.type) {
    case "robot": return <Robot p={[0, 0, 0]} flip={-1} status={status(item)} phase={item.x * 0.7} motion={motion} />;
    case "jig": return <Jig />;
    case "compressor": return <CompressorStation />;
    case "andon": return <Andon position={[0, 0, 0]} status={status(item)} />;
    case "sensor": return <SensorUnit status={status(item)} />;
    case "buffer": return <BufferRack />;
    case "workstation": return <Workstation />;
    case "inspection": return <InspectionArch />;
  }
}

/** Контур габарита на полу: жёлтый — выбран, красный — конфликт. */
function Footprint({ item, color }: { item: Item; color: string }) {
  const c = CATALOG[item.type];
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), toneMapped: false }), [color]);
  const t = 0.06;
  return (
    <group position={[0, 0.02, 0]}>
      {[[0, -c.d / 2, c.w, t], [0, c.d / 2, c.w, t], [-c.w / 2, 0, t, c.d], [c.w / 2, 0, t, c.d]].map(([x, z, a, b], i) => (
        <mesh key={i} position={[x, 0, z]} rotation={[-Math.PI / 2, 0, 0]} material={mat}>
          <planeGeometry args={[a, b]} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[c.w, c.d]} />
        <meshBasicMaterial color={color} transparent opacity={0.16} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function EditableObjects({ items, status, motion, editor }: {
  items: Item[]; status: (item: Item) => Status; motion: boolean; editor?: EditorHandlers;
}) {
  const content = items.map((it) => {
    const sel = editor?.selectedId === it.id;
    const bad = editor?.invalid.has(it.id);
    // Невидимая «ручка» по габариту: по ней удобно кликать и тащить, даже если модель тонкая
    const c = CATALOG[it.type];
    return (
      <group key={it.id} position={[it.x, 0, it.z]} rotation={[0, it.rot, 0]}>
        <Body item={it} status={status} motion={motion} />
        {editor && (
          <>
            <mesh position={[0, 0.9, 0]} onPointerDown={(e) => editor.onPointerDown(it.id, e)} visible={false}>
              <boxGeometry args={[c.w, 1.8, c.d]} />
            </mesh>
            {(sel || bad) && <Footprint item={it} color={bad ? "#ff3b3b" : "#ffd23f"} />}
          </>
        )}
      </group>
    );
  });
  // В редакторе объекты двигаются — пакетная отрисовка (статичные матрицы) для них не подходит
  return editor ? <NoBatch>{content}</NoBatch> : <>{content}</>;
}
