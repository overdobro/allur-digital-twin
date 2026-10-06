import { fmtDate } from "../lib/format";
import { useApp } from "../lib/context";

export function DateSwitch() {
  const { meta, date, setDate } = useApp();
  if (!meta) return null;
  const options: { value: string | null; label: string }[] = [
    ...meta.dates.map((d) => ({ value: d, label: fmtDate(d) })),
    { value: null, label: "Период" },
  ];
  return (
    <div className="inline-flex rounded-lg border border-line bg-panel p-0.5" role="group" aria-label="Выбор даты">
      {options.map((o) => (
        <button
          key={o.label}
          onClick={() => setDate(o.value)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
            date === o.value ? "bg-panel2 text-white shadow" : "text-muted hover:text-slate-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
