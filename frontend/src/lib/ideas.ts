import { send } from "../api/client";
import type { User } from "../api/types";
import type { Status } from "../api/types";

export type Level = "low" | "medium" | "high";
export type IdeaStatus = "submitted" | "shortlisted" | "finalist" | "winner" | "rejected";

export interface AiEval {
  summary: string; section_id: string | null; realism: Level; effect: Level; complexity: Level;
  risks: string[]; checks: string[]; next_step: "pilot" | "3d_check" | "expert";
  scenario: { action: "add" | "move" | "remove"; object: string; section_id: string; note: string } | null;
  score: number; specificity: number; source: "claude" | "rules"; model: string | null; fallback_reason: string | null;
}

export interface Idea {
  id: number; author_id: number; title: string; text: string; section_id: string | null; created_at: string;
  ai: AiEval | null; ai_source: string | null; status: IdeaStatus; expert_score: number | null; expert_comment: string | null;
  reviewed_at: string | null; final_score: number | null; author: User | null;
  check3d: Check3d | null;
}

export interface Check3d {
  changes: string[]; before: number; after: number; bottleneck_before: string; bottleneck_after: string;
  conflicts: string[]; consequences: string[]; checked_at: string;
}

export const ideasApi = {
  mine: () => send<Idea[]>("GET", "/ideas/mine"),
  rating: () => send<Idea[]>("GET", "/ideas/rating"),
  get: (id: number) => send<Idea>("GET", `/ideas/${id}`),
  create: (body: { title: string; text: string; section_id: string | null }) => send<Idea>("POST", "/ideas", body),
  reevaluate: (id: number) => send<Idea>("POST", `/ideas/${id}/reevaluate`),
  check3d: (id: number, body: Omit<Check3d, "checked_at">) => send<Idea>("POST", `/ideas/${id}/check3d`, body),
  /** Идея по параметру ссылки: число — id; «demo» — демо-идея презентации (id меняется после сброса демо-данных). */
  find: async (param: string): Promise<Idea> => {
    if (/^\d+$/.test(param)) return send<Idea>("GET", `/ideas/${param}`);
    const found = param === "demo" ? (await send<Idea[]>("GET", "/ideas/rating")).find(isDemoIdea) : undefined;
    if (!found) throw new Error("Идея не найдена");
    return found;
  },
  review: (id: number, body: { status: IdeaStatus; expert_score?: number | null; expert_comment?: string | null }) =>
    send<Idea>("PATCH", `/ideas/${id}/review`, body),
};

/** Демо-идея для презентации: «Второй робот на посту геометрии сварки» из начального набора. */
export const isDemoIdea = (i: Idea) => i.title.startsWith("Второй робот на посту геометрии");

export const STATUS_IDEA: Record<IdeaStatus, { label: string; color: string }> = {
  submitted: { label: "Подана", color: "#8696a8" },
  shortlisted: { label: "В шорт-листе", color: "#7aa6e8" },
  finalist: { label: "Финалист", color: "#f59e0b" },
  winner: { label: "Победитель 🏆", color: "#22c55e" },
  rejected: { label: "Отклонена", color: "#64748b" },
};

/** Цвет уровня: для реалистичности и эффекта «высокий» — хорошо, для сложности — наоборот. */
export function levelStatus(kind: "realism" | "effect" | "complexity", l: Level): Status {
  const good = kind === "complexity" ? l === "low" : l === "high";
  const bad = kind === "complexity" ? l === "high" : l === "low";
  return good ? "ok" : bad ? "critical" : "warning";
}

export const LEVEL_LABEL: Record<"realism" | "effect" | "complexity", Record<Level, string>> = {
  realism: { high: "Высокая", medium: "Средняя", low: "Низкая" },
  effect: { high: "Высокий", medium: "Средний", low: "Низкий" },
  complexity: { low: "Низкая", medium: "Средняя", high: "Высокая" },
};

export const NEXT_STEP: Record<AiEval["next_step"], string> = {
  pilot: "Пилот", "3d_check": "Проверка на 3D-модели", expert: "Экспертная оценка",
};

export const GRANT_CHAIN = ["Предложи", "Проанализируй", "Проверь в 3D", "Оцени", "Получи грант", "Внедри"];

export const OBJECT_LABEL: Record<string, string> = {
  robot: "робот", sensor: "датчик", buffer: "буфер", workstation: "рабочий пост", inspection: "пост контроля",
  compressor: "компрессор", andon: "андон",
};
