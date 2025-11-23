// src/components/layout/AppShell.tsx
import React from "react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const { user, logout } = useAuth();
  const [flowsOpen, setFlowsOpen] = React.useState(true); // menú desplegable

  const baseLink =
    "group flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors";
  const inactiveLink =
    "text-slate-300 hover:bg-slate-800/60 hover:text-white";
  const activeLink = "bg-slate-100/10 text-white";

  const nestedLink =
    "group flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors";

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-col bg-slate-900 text-slate-100 md:flex">
        {/* Logo / Marca */}
        <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500 text-lg font-bold shadow-lg">
            FP
          </div>
          <div>
            <div className="text-sm font-semibold">Fire Prevention</div>
            <div className="text-xs text-slate-400">
              Sistema de inventario
            </div>
          </div>
        </div>

        {/* Navegación */}
        <nav className="mt-4 flex-1 space-y-4 px-3 pb-4">
          {/* Sección principal */}
          <div className="space-y-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `${baseLink} ${isActive ? activeLink : inactiveLink}`
              }
            >
              <span className="text-base">🏠</span>
              <span>Panel</span>
            </NavLink>

            <NavLink
              to="/productos"
              className={({ isActive }) =>
                `${baseLink} ${isActive ? activeLink : inactiveLink}`
              }
            >
              <span className="text-base">📦</span>
              <span>Inventario</span>
              </NavLink>
              <NavLink
                to="/proveedores"
                className={({ isActive }) =>
                  `${baseLink} ${isActive ? activeLink : inactiveLink}`
                }>
              <span className="text-base">👥</span>
              <span>Proveedores</span>
              </NavLink>


            {/* 🔧 Si después quieres más menús “grandes”, agrégalos aquí */}
            {/*
            <NavLink
              to="/reportes"
              className={({ isActive }) =>
                `${baseLink} ${isActive ? activeLink : inactiveLink}`
              }
            >
              <span className="text-base">📈</span>
              <span>Reportes</span>
            </NavLink>
            */}
          </div>

          {/* Separador visual */}
          <div className="mx-1 h-px bg-slate-800/70" />

          {/* Grupo desplegable: Ingresos, egresos y devoluciones */}
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setFlowsOpen((prev) => !prev)}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:bg-slate-800/70"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">🔁</span>
                <span>Ingresos, egresos y devoluciones</span>
              </div>
              <span
                className={`text-[10px] transition-transform ${
                  flowsOpen ? "rotate-90" : ""
                }`}
              >
                ▶
              </span>
            </button>

            {flowsOpen && (
              <div className="mt-1 space-y-1 pl-4">
                {/* Ingresos de compra */}
                <NavLink
                  to="/ingresos"
                  className={({ isActive }) =>
                    `${nestedLink} ${
                      isActive ? activeLink : inactiveLink
                    }`
                  }
                >
                  <span className="text-sm">📥</span>
                  <span>Ingresos de compra</span>
                </NavLink>
                

                {/* Salidas y retornos de proyecto (egresos) */}
                <NavLink
                  to="/movimientos"
                  className={({ isActive }) =>
                    `${nestedLink} ${
                      isActive ? activeLink : inactiveLink
                    }`
                  }
                >
                  <span className="text-sm">📤</span>
                  <span>Salidas y retornos de proyecto</span>
                </NavLink>

                {/* Devoluciones a proveedor */}
                <NavLink
                  to="/DevolucionesProveedor"
                  className={({ isActive }) =>
                    `${nestedLink} ${
                      isActive ? activeLink : inactiveLink
                    }`
                  }
                >
                  <span className="text-sm">↩️</span>
                  <span>Devoluciones a proveedor</span>
                </NavLink>
              </div>
            )}
          </div>
        </nav>

        {/* Footer sidebar */}
        <div className="border-t border-slate-800 px-5 py-3 text-xs text-slate-500">
          <div>© {new Date().getFullYear()} Fire Prevention</div>
          <div className="text-[11px] text-slate-600">
            Trazabilidad por PPP y proyectos.
          </div>
        </div>
      </aside>

      {/* Contenido principal */}
      <div className="flex min-h-screen flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-md md:px-6">
          <div>
            <h1 className="text-base font-semibold text-slate-900 md:text-lg">
              Panel de inventario
            </h1>
            <p className="text-xs text-slate-500 md:text-sm">
              Control de stock, PPP y flujos entre bodegas, proyectos y proveedores.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {user && (
              <>
                <div className="hidden text-right md:block">
                  <div className="text-sm font-medium text-slate-900">
                    {user.email}
                  </div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    {user.role}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Cerrar sesión
                </button>
              </>
            )}
          </div>
        </header>

        {/* Main */}
        <main className="flex-1 p-4 md:p-6">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
            {/* Tarjeta de marco visual común para todas las páginas */}
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm md:p-6">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
