import { Link } from "react-router-dom";
import { useApi } from "../../api/client";
import { Card, Loading, PageTitle } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { GRANT_CHAIN, ideasApi, STATUS_IDEA } from "../../lib/ideas";

export default function StudentProfile() {
  const { user } = useAuth();
  const mine = useApi(ideasApi.mine, []);
  if (!user || !mine.data) return <Loading error={mine.error} />;
  const ideas = mine.data;
  const best = ideas.reduce((m, i) => Math.max(m, i.final_score ?? 0), 0);
  const top = ideas.find((i) => ["winner", "finalist", "shortlisted"].includes(i.status));
  return (
    <>
      <PageTitle title="Профиль обучающегося" subtitle="АЛЛЮР Университет · участник ALLUR IDEA GRANT" />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-panel2 text-2xl">🎓</div>
            <div>
              <div className="text-lg font-semibold">{user.name}</div>
              <div className="font-mono text-sm text-muted">{user.login}</div>
              <div className="text-sm text-slate-300">{user.title} · {user.course} курс</div>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            {[["Идей", ideas.length], ["Лучший балл", best || "—"], ["Статус", top ? STATUS_IDEA[top.status].label : "—"]].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-panel2 p-3"><div className="text-[11px] text-muted">{k}</div><div className="num mt-1 text-lg font-semibold">{v}</div></div>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-muted">Демо-профиль. В реальной версии данные заполняет сам обучающийся — по правилам доступа и защиты персональных данных.</p>
        </Card>
        <Card title="🏆 ALLUR IDEA GRANT">
          <ol className="flex flex-wrap items-center gap-1.5 text-xs">
            {GRANT_CHAIN.map((s, i) => (
              <li key={s} className="flex items-center gap-1.5">
                <span className="rounded-md border border-line bg-panel2 px-2 py-1 text-slate-200">{s}</span>
                {i < GRANT_CHAIN.length - 1 && <span className="text-muted">→</span>}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-slate-300">Предложите идею — AI проверит её на данных завода, цифровой двойник покажет её в действии, а лучшие идеи получат грант АЛЛЮР и могут перейти в пилот.</p>
          <div className="mt-4 flex gap-2">
            <Link to="/ideas" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:brightness-110">Предложить идею</Link>
            <Link to="/rating" className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-white">Рейтинг</Link>
          </div>
        </Card>
      </div>
    </>
  );
}
