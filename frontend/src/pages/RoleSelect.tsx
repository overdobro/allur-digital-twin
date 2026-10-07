import { AnimatePresence, motion } from "framer-motion";
import { useState, type FormEvent } from "react";
import { auth, useApi } from "../api/client";
import type { User } from "../api/types";
import { SECTION_NAME, useAuth } from "../lib/auth";

/** Первый экран: «Как вы хотите войти?» — руководитель (пароль), сотрудник или обучающийся (демо-аккаунт). */

type Mode = null | "manager" | "employee" | "student";

const ROLES: { mode: Exclude<Mode, null>; icon: string; title: string; text: string }[] = [
  { mode: "manager", icon: "👔", title: "Руководитель", text: "3D-модель и редактор, показатели, AI-аналитика, отбор идей" },
  { mode: "employee", icon: "👷", title: "Сотрудник", text: "Моя смена, отметка, выполненная работа, инциденты, идеи" },
  { mode: "student", icon: "🎓", title: "Обучающийся", text: "АЛЛЮР Университет: идеи, AI-оценка, проверка в 3D, грант" },
];

function ManagerLogin() {
  const { loginManager } = useAuth();
  const [login, setLogin] = useState("manager");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await loginManager(login, password); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  const input = "w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none";
  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-xs text-muted">Логин<input className={`${input} mt-1`} value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" /></label>
      <label className="block text-xs text-muted">Пароль<input className={`${input} mt-1`} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus /></label>
      {error && <p className="text-sm text-crit">{error}</p>}
      <button disabled={busy || !password} className="w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50">
        {busy ? "Вход…" : "Войти"}
      </button>
      <p className="text-[11px] text-muted">Демо: логин <b>manager</b>, пароль <b>allur2026</b></p>
    </form>
  );
}

function AccountPicker({ role }: { role: "employee" | "student" }) {
  const { loginDemo } = useAuth();
  const list = useApi(() => auth.accounts(role), [role]);
  const [busy, setBusy] = useState<string | null>(null);
  const pick = async (u: User) => { setBusy(u.login); try { await loginDemo(u.login); } finally { setBusy(null); } };
  if (!list.data) return <p className="text-sm text-muted">{list.error ?? "Загрузка…"}</p>;
  return (
    <div>
      <ul className="grid max-h-[46vh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {list.data.map((u) => (
          <li key={u.login}>
            <button onClick={() => pick(u)} disabled={!!busy}
              className="w-full rounded-lg border border-line bg-panel2 px-3 py-2.5 text-left transition hover:border-slate-400 disabled:opacity-50">
              <div className="flex items-center justify-between font-mono text-sm text-slate-100">{u.login}{busy === u.login && <span className="text-xs text-muted">…</span>}</div>
              <div className="text-xs text-muted">
                {role === "student" ? `${u.title} · ${u.course} курс` : `${u.title} · ${SECTION_NAME[u.section_id ?? ""] ?? ""}`}
              </div>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-muted">
        Демонстрационные аккаунты. В реальной версии данные профиля заполняет сам пользователь — по правилам доступа и защиты персональных данных.
      </p>
    </div>
  );
}

export default function RoleSelect() {
  const [mode, setMode] = useState<Mode>(null);
  const role = ROLES.find((r) => r.mode === mode);
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-3xl">
        <div className="mb-8 text-center">
          <div className="text-2xl font-bold tracking-tight"><span className="text-brand">allur</span> twin</div>
          <div className="text-sm text-muted">Цифровой двойник автомобильного завода</div>
        </div>
        <AnimatePresence mode="wait">
          {!role ? (
            <motion.div key="pick" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <h1 className="mb-6 text-center text-xl font-semibold tracking-wide">КАК ВЫ ХОТИТЕ ВОЙТИ?</h1>
              <div className="grid gap-4 sm:grid-cols-3">
                {ROLES.map((r, i) => (
                  <motion.button key={r.mode} onClick={() => setMode(r.mode)}
                    initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i }}
                    className="group rounded-2xl border border-line bg-panel p-6 text-left transition hover:-translate-y-1 hover:border-brand/70">
                    <div className="text-4xl">{r.icon}</div>
                    <div className="mt-3 text-lg font-semibold">{r.title}</div>
                    <div className="mt-1 text-sm text-muted">{r.text}</div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div key={role.mode} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="mx-auto max-w-xl rounded-2xl border border-line bg-panel p-6">
              <button onClick={() => setMode(null)} className="mb-4 text-xs text-muted hover:text-white">← Выбор роли</button>
              <div className="mb-5 flex items-center gap-3">
                <span className="text-3xl">{role.icon}</span>
                <div>
                  <div className="text-lg font-semibold">{role.title}</div>
                  <div className="text-xs text-muted">{role.mode === "manager" ? "Вход по логину и паролю" : "Выберите демо-аккаунт"}</div>
                </div>
              </div>
              {role.mode === "manager" ? <ManagerLogin /> : <AccountPicker role={role.mode} />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
