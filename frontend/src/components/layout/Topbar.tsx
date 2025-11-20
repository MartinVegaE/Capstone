// src/components/layout/Topbar.tsx
import React from "react";
import { useAuth } from "../../app/AuthContext";

export default function Topbar() {
  const { user, logout } = useAuth();

  const displayName =
    user?.worker?.fullName || "Usuario";
  const displayEmail = user?.email || "";

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      {/* Lado izquierdo: título */}
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-slate-900">
          Fire Prevention
        </h1>
        <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
          Inventario
        </span>
      </div>

      {/* Lado derecho: usuario + botón salir */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={logout}
          className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Cerrar sesión
        </button>

        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 text-sm font-semibold text-white">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-slate-800">
              {displayName}
            </span>
            <span className="text-xs text-slate-500">
              {displayEmail}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
