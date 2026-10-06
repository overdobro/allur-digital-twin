import { NavLink, Route, Routes } from "react-router-dom";
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
import Assumptions from "./pages/Assumptions";

const NAV = [
  { to: "/", label: "Обзор завода", icon: "M3 12l9-8 9 8M5 10v10h14V10" },
  { to: "/production", label: "Производство", icon: "M4 20V10l5 3V10l5 3V6l6 4v10z" },
  { to: "/quality", label: "Качество", icon: "M9 12l2 2 4-4M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" },
  { to: "/downtime", label: "Простои", icon: "M12 8v4l3 2M12 3a9 9 0 100 18 9 9 0 000-18z" },
  { to: "/ai", label: "AI Risk", icon: "M12 3v3M12 18v3M3 12h3M18 12h3M7 7l2 2M15 15l2 2M7 17l2-2M15 9l2-2M12 9a3 3 0 100 6 3 3 0 000-6z" },
  { to: "/whatif", label: "Что если", icon: "M4 6h10M4 12h16M4 18h7M17 4v4M10 10v4M14 16v4" },
  { to: "/executive", label: "Руководителю", icon: "M4 19h16M6 16V9M11 16V5M16 16v-5" },
];

export default function App() {
  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line bg-panel md:flex">
        <div className="px-5 py-5">
          <div className="text-lg font-bold tracking-tight"><span className="text-brand">allur</span> twin</div>
          <div className="text-[11px] text-muted">Цифровой двойник завода</div>
        </div>
        <nav className="flex flex-col gap-0.5 px-3">
          {NAV.map((n) => (
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
          <NavLink to="/assumptions" className="underline decoration-dotted hover:text-slate-200">Допущения и методика</NavLink>
          <div className="mt-1">Данные: тестовый набор кейса</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur md:px-6">
          <nav className="flex gap-1 overflow-x-auto md:hidden">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === "/"}
                className={({ isActive }) => `whitespace-nowrap rounded-md px-2 py-1 text-xs ${isActive ? "bg-panel2 text-white" : "text-muted"}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden text-sm text-muted md:block">Кейс №2 · АО «Группа компаний АЛЛЮР»</div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:block"><TourButton /></span>
            <span className="hidden sm:block"><MotionToggle /></span>
            <DateSwitch />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1720px] flex-1 px-4 py-5 md:px-6">
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
          </Routes>
        </main>
      </div>
    </div>
  );
}
