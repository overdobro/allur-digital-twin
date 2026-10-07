import { useApp } from "../lib/context";
import { Card, Loading, PageTitle } from "../components/ui";

export default function Assumptions() {
  const { meta } = useApp();
  if (!meta) return <Loading />;
  const t = meta.targets;
  return (
    <>
      <PageTitle title="Допущения и методика" subtitle="Всё, что вычислено, а не взято из тестовых данных напрямую" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Допущения">
          <ol className="space-y-2 text-sm">
            {meta.assumptions.map((a) => (
              <li key={a.id} className="flex gap-3">
                <span className="font-mono text-xs text-brand">{a.id}</span>
                <span className="text-slate-300">{a.text}</span>
              </li>
            ))}
          </ol>
        </Card>
        <Card title="Нормативы завода">
          <ul className="space-y-2 text-sm text-slate-300">
            <li>Режим: {t.shifts_per_day} смены по {t.shift_hours} ч</li>
            <li>OEE ≥ {t.oee_min_pct}%</li>
            <li>Брак ≤ {t.defect_max_pct}%</li>
            <li>Простой критического оборудования ≤ {t.critical_downtime_max_min_per_day} мин/сутки</li>
            <li>Выпуск ≥ {t.monthly_output_min.toLocaleString("ru-RU")} авто/месяц</li>
          </ul>
          <h3 className="mt-5 mb-2 text-sm font-semibold">Пороги статусов</h3>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr><th className="py-1">Метрика</th><th>Норма</th><th>Внимание</th><th>Критично</th></tr>
            </thead>
            <tbody className="text-slate-300">
              <tr><td className="py-1">Брак</td><td>≤ 2%</td><td>2–3%</td><td>&gt; 3%</td></tr>
              <tr><td className="py-1">OEE</td><td>≥ 85%</td><td>75–85%</td><td>&lt; 75%</td></tr>
              <tr><td className="py-1">Выполнение плана</td><td>≥ 98%</td><td>95–98%</td><td>&lt; 95%</td></tr>
              <tr><td className="py-1">Аварийный простой ед. оборуд.</td><td>&lt; 45 мин</td><td>45–60 мин</td><td>&gt; 60 мин</td></tr>
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
