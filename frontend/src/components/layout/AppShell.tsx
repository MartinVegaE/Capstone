import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import Badge from "../ui/Badge";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full bg-slate-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

function Topbar() {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center border-b bg-white/80 backdrop-blur px-6">
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold tracking-tight">Fire Prevention</span>
          <Badge tone="brand">Inventario</Badge>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600" />
            <div className="text-sm">
              <div className="font-medium">Usuario</div>
              <div className="text-xs text-slate-500">admin@example.com</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function Sidebar() {
  const { pathname } = useLocation();
  const links = [
    { to: "/", label: "Panel", icon: "🏠", exact: true },
    { to: "/productos", label: "Productos", icon: "📦" },
    { to: "/movimientos", label: "Movimientos", icon: "🔄" },
    { to: "/ingresos", label: "Ingresos", icon: "🧾" },
  ];

  return (
    <aside className="hidden w-64 shrink-0 border-r bg-white md:block">
      <div className="flex h-14 items-center border-b px-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600" />
          <span className="text-base font-semibold">FP Admin</span>
        </div>
      </div>
      <nav className="p-3">
        <ul className="space-y-1">
          {links.map((l) => {
            const isActive = l.exact ? pathname === l.to : pathname.startsWith(l.to);
            return (
              <li key={l.to}>
                <NavLink
                  to={l.to}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
                    isActive ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-700 hover:bg-slate-50"
                  }`}
                  end={l.exact}
                >
                  <span className="text-base leading-none">{l.icon}</span>
                  <span>{l.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-auto p-3">
        <div className="rounded-2xl border border-slate-200 p-3 text-xs text-slate-600">
          <div className="mb-1 font-medium text-slate-800">Consejo</div>
          Usa Lista/Kanban y los filtros para encontrar rápido.
        </div>
      </div>
    </aside>
  );
}
