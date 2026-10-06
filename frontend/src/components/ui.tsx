import type { ReactNode } from "react";
import type { Status } from "../api/types";
import { STATUS_HEX, STATUS_LABEL } from "../lib/format";

export function Dot({ status, pulse = false, size = 10 }: { status: Status; pulse?: boolean; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {pulse && status === "critical" && (
        <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: STATUS_HEX[status] }} />
      )}
      <span className="relative rounded-full w-full h-full" style={{ background: STATUS_HEX[status] }} />
    </span>
  );
}

export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ background: STATUS_HEX[status] + "22", color: STATUS_HEX[status] }}
    >
      <Dot status={status} size={7} />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}

export function Card({ title, extra, children, className = "" }: { title?: ReactNode; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-panel ${className}`}>
      {(title || extra) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold tracking-wide text-slate-200">{title}</h2>
          {extra}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function CalcTag({ title = "Расчётный показатель — см. допущения" }: { title?: string }) {
  return (
    <span title={title} className="rounded border border-line px-1 py-px text-[10px] uppercase tracking-wider text-muted">
      расчётный
    </span>
  );
}

export function Loading({ error }: { error?: string | null }) {
  return (
    <div className="flex h-40 items-center justify-center text-sm text-muted">
      {error ? `Ошибка загрузки: ${error}` : "Загрузка…"}
    </div>
  );
}

export function PageTitle({ title, subtitle, extra }: { title: string; subtitle?: string; extra?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {extra}
    </div>
  );
}
