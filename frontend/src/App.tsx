import type { ReactNode } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { STATIC } from "./api/client";
import type { Role } from "./api/types";
import { PageTitle } from "./components/ui";
import { useAuth } from "./lib/auth";
import RoleSelect from "./pages/RoleSelect";
import EmployeeIncidents from "./pages/people/EmployeeIncidents";
import EmployeeShift from "./pages/people/EmployeeShift";
import IdeasPage from "./pages/people/IdeasPage";
import WorkLog from "./pages/people/WorkLog";
import ManagerIdeas from "./pages/people/ManagerIdeas";
import Rating from "./pages/people/Rating";
import StudentProfile from "./pages/people/StudentProfile";
import { DateSwitch } from "./components/DateSwitch";
import { MotionToggle } from "./components/MotionToggle";
import { TourButton } from "./components/Tour";
import Overview from "./pages/Overview";
import Production from "./pages/Production";
import Quality from "./pages/Quality";
import Downtime from "./pages/Downtime";
import AiRisk from "./pages/AiRisk";
import Executive from "./pages/Executive";
import WhatIf from "./pages/WhatIf";
import Section from "./pages/Section";
import Plan from "./pages/Plan";
import Editor from "./pages/Editor";
import Assumptions from "./pages/Assumptions";

interface NavItem { to: string; label: string; icon: string }
const ROLE_LABEL: Record<Role, string> = { manager: "Руководитель", employee: "Сотрудник", student: "Обучающийся" };

const NAV: NavItem[] = [
  { to: "/", label: "Обзор завода", icon: "M3 12l9-8 9 8M5 10v10h14V10" },
  { to: "/editor", label: "3D-редактор", icon: "M12 2l9 5v10l-9 5-9-5V7zM12 22V12M21 7l-9 5-9-5" },
  { to: "/production", label: "Линии", icon: "M4 20V10l5 3V10l5 3V6l6 4v10z" },
  { to: "/plan", label: "План", icon: "M8 3v4M16 3v4M4 9h16M5 5h14v16H5zM9 14l2 2 4-4" },
  { to: "/quality", label: "Качество", icon: "M9 12l2 2 4-4M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" },
  { to: "/downtime", label: "Простои", icon: "M12 8v4l3 2M12 3a9 9 0 100 18 9 9 0 000-18z" },
  { to: "/ai", label: "AI Risk", icon: "M12 3v3M12 18v3M3 12h3M18 12h3M7 7l2 2M15 15l2 2M7 17l2-2M15 9l2-2M12 9a3 3 0 100 6 3 3 0 000-6z" },
  { to: "/whatif", label: "Что если", icon: "M4 6h10M4 12h16M4 18h7M17 4v4M10 10v4M14 16v4" },
  { to: "/executive", label: "Руководителю", icon: "M4 19h16M6 16V9M11 16V5M16 16v-5" },
  { to: "/ideas", label: "Идеи и грант", icon: "M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z" },
];

function Shell({ nav, children, manager }: { nav: NavItem[]; children: ReactNode; manager?: boolean }) {
  const { user, logout } = useAuth();
  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line bg-panel md:flex">
        <div className="px-5 py-5">
          <div className="text-lg font-bold tracking-tight"><span className="text-brand">allur</span> twin</div>
          <div className="text-[11px] text-muted">Цифровой двойник завода</div>
        </div>
        <nav className="flex flex-col gap-0.5 px-3">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  isActive ? "bg-panel2 text-white" : "text-muted hover:bg-panel2/60 hover:text-slate-200"
                }`
              }
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={n.icon} />
              </svg>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-5 py-4 text-[11px] leading-relaxed text-muted">
          {manager && <NavLink to="/assumptions" className="underline decoration-dotted hover:text-slate-200">Допущения и методика</NavLink>}
          <div className="mt-1">Данные: тестовый набор кейса</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur md:px-6">
          <nav className="flex gap-1 overflow-x-auto md:hidden">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === "/"}
                className={({ isActive }) => `whitespace-nowrap rounded-md px-2 py-1 text-xs ${isActive ? "bg-panel2 text-white" : "text-muted"}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden text-sm text-muted md:block">Кейс №2 · АО «Группа компаний АЛЛЮР»</div>
          <div className="flex items-center gap-2">
            {manager && <span className="hidden sm:block"><TourButton /></span>}
            <span className="hidden sm:block"><MotionToggle /></span>
            {manager && <DateSwitch />}
            {user && (
              <div className="flex items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs">
                <span className="hidden text-muted lg:inline">{ROLE_LABEL[user.role]} ·</span>
                <span className="font-mono text-slate-200">{user.login}</span>
                {!STATIC && <button onClick={logout} className="ml-1 text-muted hover:text-white" title="Сменить роль">⇄ Сменить роль</button>}
              </div>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1720px] flex-1 px-4 py-5 md:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}


const MANAGER_NAV: NavItem[] = NAV;
const EMPLOYEE_NAV: NavItem[] = [
  { to: "/", label: "Моя смена", icon: "M12 8v4l3 2M12 3a9 9 0 100 18 9 9 0 000-18z" },
  { to: "/work", label: "Выполнено", icon: "M9 12l2 2 4-4M5 4h14v16H5z" },
  { to: "/incidents", label: "Инциденты", icon: "M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" },
  { to: "/ideas", label: "Идеи", icon: "M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z" },
];
const STUDENT_NAV: NavItem[] = [
  { to: "/", label: "Профиль", icon: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0" },
  { to: "/ideas", label: "Мои идеи", icon: "M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z" },
  { to: "/rating", label: "Рейтинг и грант", icon: "M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0zM17 5h3v2a3 3 0 01-3 3M7 5H4v2a3 3 0 003 3" },
];

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-full items-center justify-center text-sm text-muted">Загрузка…</div>;
  if (!user) return <RoleSelect />;
  if (user.role === "employee") {
    return (
      <Shell nav={EMPLOYEE_NAV}>
        <Routes>
          <Route path="/" element={<EmployeeShift />} />
          <Route path="/work" element={<WorkLog />} />
          <Route path="/incidents" element={<EmployeeIncidents />} />
          <Route path="/ideas" element={<IdeasPage />} />
          <Route path="/rating" element={<Rating />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    );
  }
  if (user.role === "student") {
    return (
      <Shell nav={STUDENT_NAV}>
        <Routes>
          <Route path="/" element={<StudentProfile />} />
          <Route path="/ideas" element={<IdeasPage />} />
          <Route path="/rating" element={<Rating />} />
          <Route path="/check3d" element={<Placeholder title="Проверка идеи на 3D-модели" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    );
  }
  return (
    <Shell nav={MANAGER_NAV} manager>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/production" element={<Production />} />
        <Route path="/quality" element={<Quality />} />
        <Route path="/downtime" element={<Downtime />} />
        <Route path="/ai" element={<AiRisk />} />
        <Route path="/whatif" element={<WhatIf />} />
        <Route path="/executive" element={<Executive />} />
        <Route path="/sections/:id" element={<Section />} />
        <Route path="/assumptions" element={<Assumptions />} />
        <Route path="/ideas" element={<ManagerIdeas />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/editor" element={<Editor />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

function Placeholder({ title }: { title: string }) {
  return <PageTitle title={title} subtitle="Раздел в разработке" />;
}
