export type Status = "ok" | "warning" | "critical" | "no_data";

export interface Assumption { id: string; text: string }

export interface Meta {
  dates: string[];
  targets: {
    shifts_per_day: number; shift_hours: number; oee_min_pct: number; defect_max_pct: number;
    critical_downtime_max_min_per_day: number; monthly_output_min: number;
  };
  monthly_plan: { model: string; plan: number }[];
  assumptions: Assumption[];
  thresholds: Record<string, { ok: number; critical: number; higher_is_better: boolean }>;
}

export interface LineMetrics {
  line: string; section_id: string; section: string;
  plan: number; fact: number; defects: number; shifts: number; hours: number; load_pct: number;
  plan_completion_pct: number; defect_pct: number; defect_norm_ratio: number;
  availability_pct: number; performance_pct: number; quality_pct: number; oee_pct: number;
  statuses: { plan_completion: Status; defect: Status; oee: Status };
  status: Status;
}

export interface DowntimeEvent {
  date: string; section: string; section_id: string; equipment: string; reason: string; minutes: number;
  planned: boolean; equipment_day_unplanned_min: number; status: Status; limit_usage_pct: number;
}

export interface Downtime {
  events: DowntimeEvent[]; total_min: number; unplanned_min: number; planned_min: number; incidents: number;
  max_equipment_day_min: number; factory_per_day_min: Record<string, number>; longest: DowntimeEvent | null; status: Status;
}

export interface Equipment { name: string; status: Status; downtime_min: number; events: DowntimeEvent[] }

export interface FactoryNode {
  id: string; name: string; line: string | null; order: number; status: Status;
  metrics: Pick<LineMetrics, "plan" | "fact" | "plan_completion_pct" | "load_pct" | "oee_pct" | "defect_pct" | "defect_norm_ratio" | "statuses"> | null;
  equipment: Equipment[];
}

export interface Kpi {
  date: string | null;
  oee: { value_pct: number; target_pct: number; delta_pct: number; worst: { section: string; value_pct: number }; status: Status; calculated: boolean };
  defect: { value_pct: number; target_pct: number; worst: { section: string; value_pct: number; norm_ratio: number }; status: Status };
  downtime: { max_equipment_day_min: number; target_min: number; incidents: number; total_min: number; status: Status };
  output: { plan: number; fact: number; completion_pct: number; status: Status };
}

export interface Overview { kpi: Kpi; nodes: FactoryNode[] }

export interface SectionDetail extends FactoryNode { trend: (LineMetrics & { date: string })[] }

export interface QualityRow {
  date: string; section_id: string; section: string; produced: number; defects: number;
  defect_pct: number; norm_ratio: number; status: Status;
}

export interface Factor { key: string; contribution: number; evidence: string }

export interface Recommendation { what: string; why: string[]; risk: string; actions: string[] }

export interface Risk {
  section_id: string; section: string; date: string; risk_index: number;
  level: { code: "low" | "medium" | "high"; label: string };
  kind: "quality" | "throughput" | "equipment"; stage: "realized" | "emerging";
  factors: Factor[]; downtime_events: DowntimeEvent[]; recommendation: Recommendation;
}

export interface BottleneckRow {
  section_id: string; section: string; plan: number; good: number; lost_units: number; underproduction: number; defects: number;
}

export interface RiskResponse {
  risks: Risk[];
  bottleneck: {
    current: BottleneckRow & { date: string }; previous: (BottleneckRow & { date: string }) | null;
    period: BottleneckRow; by_date: { date: string; ranking: BottleneckRow[] }[]; shifted: boolean; method: string;
  };
  model: { type: string; weights: Record<string, number>; limitations: string };
}

export interface Advice {
  source: "claude" | "rules"; model?: string; fallback_reason?: string; summary: string;
  items: (Recommendation & { section_id: string })[];
}

export interface Forecast {
  working_days: number; shifts: number; avg_output_per_shift: number; forecast: number; forecast_formula: string;
  target: number; gap: number; capacity_at_plan: number; capacity_formula: string; required_per_shift: number;
  models_plan_total: number; models_plan: { model: string; plan: number }[]; models_gap: number; status: Status;
}

export interface EffectScenario {
  id: string; title: string; units: number; unit_label: string; formula: string; negative?: boolean; money: number | null;
}

export interface Effect { working_days: number; margin_per_car: number | null; scenarios: EffectScenario[]; note: string }

export interface ReplayStep {
  index: number; date: string; kind: "day" | "production" | "downtime" | "quality"; section_id: string | null;
  severity: Status | "info"; text: string; nodes: Record<string, Status>;
}
