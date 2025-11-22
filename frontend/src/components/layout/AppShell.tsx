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

  const baseLink =
    "group flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors";
  const inactiveLink =
    "text-slate-300 hover:bg-slate-800/60 hover:text-white";
  const activeLink = "bg-slate-100/10 text-white";

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
              Inventario &amp; PPP
            </div>
          </div>
        </div>

        {/* Navegación */}
        <nav className="mt-4 flex-1 space-y-1 px-3">
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
            to="/ingresos"
            className={({ isActive }) =>
              `${baseLink} ${isActive ? activeLink : inactiveLink}`
            }
          >
            <span className="text-base">📥</span>
            <span>Ingresos</span>
          </NavLink>

          <NavLink
            to="/movimientos"
            className={({ isActive }) =>
              `${baseLink} ${isActive ? activeLink : inactiveLink}`
            }
          >
            <span className="text-base">📊</span>
            <span>Movimientos</span>
          </NavLink>

          {/* 🔁 Nuevo menú: Devoluciones a proveedor */}
          <NavLink
            to="/devoluciones-proveedor"
            className={({ isActive }) =>
              `${baseLink} ${isActive ? activeLink : inactiveLink}`
            }
          >
            <span className="text-base">↩️</span>
            <span>Devoluciones proveedor</span>
          </NavLink>
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
              Control de stock, PPP y movimientos.
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
