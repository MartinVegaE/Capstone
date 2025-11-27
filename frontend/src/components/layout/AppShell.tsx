import { useState } from "react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { SessionTimeoutManager } from "../session/SessionTimeoutManager";

import fpLogo from "../../assets/fp-icon.png";

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const { user, logout } = useAuth();
  const [flowsOpen, setFlowsOpen] = useState(true);

  const baseLink =
    "group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors";
  const inactiveLink =
    "text-slate-200/80 hover:bg-white/10 hover:text-white";
  const activeLink =
    "bg-white/90 text-sky-700 shadow-sm shadow-sky-900/10";

  const nestedLink =
    "group flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors";

  const userInitial = user?.email?.charAt(0).toUpperCase() ?? "?";

  return (
    <SessionTimeoutManager>
      <div className="flex min-h-screen bg-slate-50">
        {/* SIDEBAR */}
        <aside className="hidden w-64 flex-col bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-slate-100 md:flex">
          {/* Logo / Marca */}
          <div className="flex h-16 items-center gap-3 border-b border-slate-800/70 px-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900/90 shadow-lg shadow-black/40">
              {/* Icono */}
              <img
                src={fpLogo}
                alt="Fire Prevention"
                className="h-6 w-6"
              />
            </div>
            <div>
              <div className="text-sm font-semibold">
                Fire Prevention
              </div>
              <div className="text-[11px] text-slate-400">
                Sistema de inventario
              </div>
            </div>
          </div>

          {/* Navegación */}
          <nav className="mt-4 flex-1 space-y-5 px-3 pb-4">
            <div className="px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Navegación
            </div>

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
                }
              >
                <span className="text-base">👥</span>
                <span>Proveedores</span>
              </NavLink>

              <NavLink
                to="/centros-costo"
                className={({ isActive }) =>
                  `${baseLink} ${isActive ? activeLink : inactiveLink}`
                }
              >
                <span className="text-base">📂</span>
                <span>Centros de costo</span>
              </NavLink>

              {user?.role === "ADMIN" && (
                <NavLink
                  to="/usuarios"
                  className={({ isActive }) =>
                    `${baseLink} ${isActive ? activeLink : inactiveLink}`
                  }
                >
                  <span className="text-base">🧑‍💻</span>
                  <span>Usuarios</span>
                </NavLink>
              )}
            </div>

            <div className="mx-1 h-px bg-slate-800/60" />

            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setFlowsOpen((prev) => !prev)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 hover:bg-white/10"
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

          <div className="mt-auto border-t border-slate-800/70 px-5 py-3 text-[11px] text-slate-500">
            <div>© {new Date().getFullYear()} Fire Prevention</div>
            <div className="text-[10px] text-slate-600">
              Trazabilidad por PPP y proyectos.
            </div>
          </div>
        </aside>

        {/* CONTENIDO PRINCIPAL */}
        <div className="flex min-h-screen flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md md:px-6">
            <div>
              <h1 className="text-base font-semibold text-slate-900 md:text-lg">
                Panel de inventario
              </h1>
              <p className="text-xs text-slate-500 md:text-sm">
                Control de stock, PPP y flujos entre bodegas, proyectos y
                proveedores.
              </p>
            </div>

            {user && (
              <div className="flex items-center gap-3">
                <div className="hidden text-right text-xs md:block">
                  <div className="text-sm font-medium text-slate-900">
                    {user.email}
                  </div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    {user.role}
                  </div>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-600 text-xs font-semibold text-white shadow-sm">
                  {userInitial}
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Cerrar sesión
                </button>
              </div>
            )}
          </header>

          <main className="flex-1 px-4 py-4 md:px-6 md:py-6">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm md:p-6">
                {children}
              </div>
            </div>
          </main>
        </div>
      </div>
    </SessionTimeoutManager>
  );
}
