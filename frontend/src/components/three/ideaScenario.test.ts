import { describe, expect, it } from "vitest";
import type { StageInput } from "../../lib/whatif";
import { assess, conflicts } from "./editorChecks";
import { baseLayout } from "./editorModel";
import { draftFromIdea, type IdeaScenario } from "./ideaScenario";

const baseline: StageInput[] = [
  { id: "welding", name: "Сварка", pace: 111, defectPct: 2.7 },
  { id: "painting", name: "Окраска", pace: 116, defectPct: 5.2 },
  { id: "assembly", name: "Сборка", pace: 119, defectPct: 1.7 },
];
const sc = (action: IdeaScenario["action"], object: string, section_id: string): IdeaScenario => ({ action, object, section_id, note: "" });

describe("идея → 3D", () => {
  it("сценарии демо-идей ставятся без конфликтов", () => {
    const base = baseLayout();
    for (const s of [sc("add", "sensor", "painting"), sc("add", "robot", "welding"), sc("add", "buffer", "assembly"), sc("add", "sensor", "assembly"),
      sc("add", "andon", "welding"), sc("move", "compressor", "painting"), sc("add", "inspection", "painting"), sc("add", "robot", "assembly")]) {
      const d = draftFromIdea(base, s);
      expect(d.ok, `${s.action} ${s.object} ${s.section_id}: ${d.message}`).toBe(true);
      expect(conflicts(d.items)).toEqual([]);
    }
  });

  it("второй робот на посту геометрии → Сварка +4, узкое место смещается", () => {
    const base = baseLayout();
    const d = draftFromIdea(base, sc("add", "robot", "welding"));
    const a = assess(base, d.items, baseline, 5500);
    expect(a.deltas.welding.pace).toBe(4);
    expect(a.after.monthly).toBeGreaterThan(a.before.monthly);
  });

  it("перенос компрессорной — тот же объект на новом месте", () => {
    const base = baseLayout();
    const d = draftFromIdea(base, sc("move", "compressor", "painting"));
    const from = base.find((i) => i.id === "compressors")!, to = d.items.find((i) => i.id === "compressors")!;
    expect(d.focusId).toBe("compressors");
    expect(Math.hypot(to.x - from.x, to.z - from.z)).toBeGreaterThan(1);
    expect(d.items).toHaveLength(base.length);
  });

  it("без сценария и с удалением", () => {
    const base = baseLayout();
    expect(draftFromIdea(base, null).ok).toBe(false);
    const r = draftFromIdea(base, sc("remove", "robot", "welding"));
    expect(r.ok && r.items.length === base.length - 1).toBe(true);
    expect(draftFromIdea(base, sc("remove", "buffer", "qc")).ok).toBe(false);
  });
});
