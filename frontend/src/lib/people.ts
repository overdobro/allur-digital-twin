import { send } from "../api/client";
import type { User } from "../api/types";

export interface Attendance { id: number; user_id: number; day: string; check_in: string; check_out: string | null }
export interface WorkItem { id: number; user_id: number; created_at: string; text: string; units: number | null }
export interface Incident {
  id: number; author_id: number; section_id: string; equipment: string | null; text: string;
  severity: "warning" | "critical"; status: "open" | "ack" | "closed"; created_at: string; author: User | null;
}

export const peopleApi = {
  attendance: () => send<Attendance[]>("GET", "/attendance/mine"),
  checkIn: () => send<Attendance>("POST", "/attendance/check-in"),
  checkOut: () => send<Attendance>("POST", "/attendance/check-out"),
  work: () => send<WorkItem[]>("GET", "/worklog/mine"),
  addWork: (text: string, units: number | null) => send<WorkItem>("POST", "/worklog", { text, units }),
  incidents: () => send<Incident[]>("GET", "/incidents"),
  report: (body: { section_id: string; equipment: string | null; text: string; severity: "warning" | "critical" }) => send<Incident>("POST", "/incidents", body),
  setIncident: (id: number, status: Incident["status"]) => send<Incident>("PATCH", `/incidents/${id}`, { status }),
};

export const INCIDENT_STATUS: Record<Incident["status"], { label: string; color: string }> = {
  open: { label: "Новый", color: "#ef4444" }, ack: { label: "Принят в работу", color: "#f59e0b" }, closed: { label: "Закрыт", color: "#22c55e" },
};

/** Время в часовом поясе Костаная. */
export const timeKz = (iso: string) => new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z").toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Qostanay" });
export const dateTimeKz = (iso: string) => new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z").toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Qostanay" });
