import { useEffect, useMemo, useRef, useState } from "react";
import type { FactoryNode } from "../api/types";

/**
 * Симуляция потока кузовов — общая для 2D и 3D.
 * Координата кузова — расстояние вдоль трассы (единицы задаёт вызывающий: px или метры сцены).
 * Скорость в зоне ∝ факт/план (усиление для наглядности); кузова не обгоняют → очередь перед медленной зоной.
 * Брак детерминирован: каждый N-й кузов на выходе зоны, N = 100 / %брака — доля брака = данным.
 */

export interface SimZone { id: string; start: number; end: number }
export interface SimCar { id: number; x: number; defectAt: string | null; drop: number; zone: number }
export interface SimGeometry { zones: SimZone[]; trackStart: number; trackEnd: number; carGap: number; baseSpeed: number }

const SPEED_GAIN = 4;
const SPAWN_EVERY = 0.36; // c
const DROP_SECONDS = 0.9;

export function zoneParams(nodes: FactoryNode[]) {
  return nodes.map((n) => {
    const m = n.metrics;
    const pace = m ? Math.min(m.fact / m.plan, 1) : 1;
    return {
      id: n.id,
      speedFactor: Math.max(0.35, 1 - (1 - pace) * SPEED_GAIN),
      defectEvery: m && m.defect_pct > 0 ? Math.round(100 / m.defect_pct) : 0,
    };
  });
}

/**
 * manual=false — свой цикл requestAnimationFrame и перерисовка React каждый кадр (2D SVG).
 * manual=true  — вызывающий сам вызывает step(dt) (3D: внутри useFrame, без перерисовки React).
 */
export function useFlowSim(nodes: FactoryNode[], geo: SimGeometry, running: boolean, manual = false) {
  const params = useMemo(() => zoneParams(nodes), [nodes]);
  const [, setTick] = useState(0);
  const cars = useRef<SimCar[]>([]);
  const counters = useRef<Record<string, { passed: number; defects: number }>>({});
  const nextId = useRef(0);
  const spawnAcc = useRef(0);
  const geoRef = useRef(geo);
  geoRef.current = geo;
  const paramsRef = useRef(params);
  paramsRef.current = params;

  // Сброс при смене данных: равномерно заполненная лента
  useEffect(() => {
    const g = geoRef.current;
    counters.current = Object.fromEntries(params.map((p) => [p.id, { passed: 0, defects: 0 }]));
    const span = g.trackEnd - g.trackStart;
    const count = Math.floor(span / (g.carGap * 2.3));
    cars.current = Array.from({ length: count }, (_, i) => ({
      id: nextId.current++, x: g.trackStart + g.carGap + i * (span / count), defectAt: null, drop: 0, zone: 0,
    }));
    for (const c of cars.current) c.zone = zoneIndex(g, c.x);
    setTick((t) => t + 1);
  }, [params]);

  const step = useRef((dt: number) => {
    const g = geoRef.current;
    const p = paramsRef.current;
    const list = cars.current.sort((a, b) => b.x - a.x);
    let aheadX = Infinity;
    for (const c of list) {
      if (c.defectAt) { c.drop += dt; continue; }
      const z = zoneIndex(g, c.x);
      c.x = Math.min(c.x + g.baseSpeed * p[z].speedFactor * dt, aheadX - g.carGap);
      // Выход из зоны, в которой кузов числится: учёт выпуска и брака
      const own = g.zones[c.zone];
      if (own && c.x > own.end) {
        const zp = p[c.zone];
        const cnt = counters.current[zp.id];
        cnt.passed += 1;
        if (zp.defectEvery && cnt.passed % zp.defectEvery === 0) {
          cnt.defects += 1;
          c.defectAt = zp.id;
          c.x = own.end - g.carGap * 0.7;
        }
        c.zone += 1;
      }
      if (!c.defectAt) aheadX = c.x;
    }
    cars.current = list.filter((c) => c.x < g.trackEnd + g.carGap && c.drop < DROP_SECONDS);
    spawnAcc.current += dt;
    const minX = Math.min(...cars.current.filter((c) => !c.defectAt).map((c) => c.x), Infinity);
    if (spawnAcc.current >= SPAWN_EVERY && minX > g.trackStart + g.carGap) {
      spawnAcc.current = 0;
      cars.current.push({ id: nextId.current++, x: g.trackStart, defectAt: null, drop: 0, zone: 0 });
    }
  }).current;

  useEffect(() => {
    if (!running || manual) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      step(Math.min((now - last) / 1000, 0.05));
      last = now;
      setTick((t) => (t + 1) % 1e6);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, manual, step]);

  return {
    cars: cars.current, counters: counters.current, dropSeconds: DROP_SECONDS,
    /** Актуальные кузова (для manual-режима — читать после step) */
    getCars: () => cars.current, getCounters: () => counters.current, step,
  };
}

function zoneIndex(g: SimGeometry, x: number): number {
  // Зона, в которой кузов сейчас или в которую въезжает (промежутки между зонами относятся к следующей)
  for (let i = 0; i < g.zones.length; i++) if (x <= g.zones[i].end) return i;
  return g.zones.length - 1;
}
