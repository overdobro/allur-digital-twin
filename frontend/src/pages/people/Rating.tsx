import { useApi } from "../../api/client";
import { Card, Loading, PageTitle } from "../../components/ui";
import { SECTION_NAME, useAuth } from "../../lib/auth";
import { GRANT_CHAIN, ideasApi, STATUS_IDEA } from "../../lib/ideas";

export default function Rating() {
  const { user } = useAuth();
  const r = useApi(ideasApi.rating, []);
  if (!r.data) return <Loading error={r.error} />;
  return (
    <>
      <PageTitle title="Рейтинг идей и грант" subtitle="ALLUR IDEA GRANT — лучшие идеи обучающихся и сотрудников" />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card title="Рейтинг">
          <table className="num w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-line"><th className="py-2 pr-2">#</th><th>Идея</th><th className="pr-3">Автор</th><th className="pr-3 text-right" title="Без эксперта — балл AI; с экспертом — 40% AI + 60% эксперт">Балл</th><th>Статус</th></tr>
            </thead>
            <tbody>
              {r.data.map((i, k) => {
                const st = STATUS_IDEA[i.status];
                const mine = i.author?.id === user?.id;
                return (
                  <tr key={i.id} className={`border-b border-line/60 ${mine ? "bg-brand/5" : ""} ${i.status === "rejected" ? "opacity-50" : ""}`}>
                    <td className="py-2 pr-2 text-muted">{k + 1}</td>
                    <td className="py-2 pr-3">
                      <div className="font-medium text-slate-100">{i.title}</div>
                      <div className="text-[11px] text-muted">{i.section_id ? SECTION_NAME[i.section_id] : "участок не указан"}</div>
                    </td>
                    <td className="pr-3 font-mono text-xs text-muted">{i.author?.login}{mine && " (вы)"}</td>
                    <td className="pr-3 text-right text-base font-semibold">{i.final_score ?? "—"}</td>
                    <td><span className="whitespace-nowrap rounded px-1.5 py-px text-[11px] font-semibold" style={{ color: st.color, background: st.color + "22" }}>{st.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        <Card title="Как работает грант">
          <ol className="space-y-2 text-sm text-slate-300">
            {["Обучающийся отправляет идею.", "AI проводит предварительный анализ и даёт балл.", "Идея попадает в рейтинг.",
              "Эксперт или руководитель АЛЛЮР оценивает её (1–10).", "Лучшие идеи становятся финалистами.",
              "Победитель получает грант или другое заранее утверждённое вознаграждение.", "Перспективная идея может перейти в пилот на цифровой модели и на производстве."]
              .map((t, i) => <li key={t} className="flex gap-2.5"><span className="num flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-panel2 text-[11px]">{i + 1}</span>{t}</li>)}
          </ol>
          <div className="mt-4 flex flex-wrap items-center gap-1 text-[11px]">
            {GRANT_CHAIN.map((s, i) => <span key={s} className="text-muted">{s}{i < GRANT_CHAIN.length - 1 && " →"}</span>)}
          </div>
          <p className="mt-4 rounded-lg bg-warn/10 px-3 py-2 text-xs text-slate-200">AI не принимает окончательное решение о гранте. Финальное решение — за экспертной комиссией АЛЛЮР. Размер гранта утверждает АЛЛЮР.</p>
        </Card>
      </div>
    </>
  );
}
