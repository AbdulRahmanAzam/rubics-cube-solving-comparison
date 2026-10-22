import { NavLink, Route, Routes } from 'react-router-dom';
import StudentBadge from './components/StudentBadge.jsx';
import Race from './pages/Race.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Slide from './pages/Slide.jsx';

const NAV = [
  { to: '/', label: 'Race' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/slide', label: 'Results slide' },
];

export default function App() {
  return (
    <div className="flex min-h-full flex-col gap-3 p-2 sm:p-3 lg:h-screen lg:overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
        <h1 className="text-xl font-black tracking-tight sm:text-2xl">RUBIK'S CUBE RACE</h1>
        <nav className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-card p-1 shadow-sm">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end
              className={({ isActive }) =>
                `whitespace-nowrap rounded-full px-3 py-1 text-sm font-bold ${isActive ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto">
          <StudentBadge />
        </div>
      </header>
      <main className="min-h-0 flex-1 lg:overflow-y-auto">
        <Routes>
          <Route path="/" element={<Race />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/slide" element={<Slide />} />
        </Routes>
      </main>
    </div>
  );
}
