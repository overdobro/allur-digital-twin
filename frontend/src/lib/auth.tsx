import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { auth, STATIC } from "../api/client";
import type { User } from "../api/types";

/**
 * Сессия пользователя. В статической сборке сервера нет — сразу демо-руководитель (просмотр без входа).
 */
interface AuthCtx {
  user: User | null;
  loading: boolean;
  loginManager: (login: string, password: string) => Promise<void>;
  loginDemo: (login: string) => Promise<void>;
  logout: () => Promise<void>;
}

const STATIC_MANAGER: User = { id: 0, login: "manager", role: "manager", name: "Руководитель (демо, без входа)", title: "Статическая версия", section_id: null, course: null };

const Ctx = createContext<AuthCtx>({ user: null, loading: true, loginManager: async () => {}, loginDemo: async () => {}, logout: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(STATIC ? STATIC_MANAGER : null);
  const [loading, setLoading] = useState(!STATIC);
  useEffect(() => {
    if (STATIC) return;
    auth.me().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);
  const loginManager = useCallback(async (l: string, p: string) => setUser(await auth.login(l, p)), []);
  const loginDemo = useCallback(async (l: string) => setUser(await auth.demo(l)), []);
  const logout = useCallback(async () => { if (!STATIC) { await auth.logout().catch(() => null); setUser(null); } }, []);
  return <Ctx.Provider value={{ user, loading, loginManager, loginDemo, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

export const SECTION_NAME: Record<string, string> = {
  warehouse_in: "Склад комплектующих", welding: "Сварка", painting: "Окраска", assembly: "Сборка", qc: "Контроль качества", warehouse_out: "Склад готовой продукции",
};
