// src/pages/Login.tsx
import React, { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../app/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(email, password);
      // No redirigimos manualmente: App.tsx se re-renderiza
      // y mostrará el panel en vez del login.
    } catch (err: any) {
      const msg =
        err?.message && typeof err.message === "string"
          ? err.message
          : "Error interno al iniciar sesión";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-slate-50">
      <div className="mx-auto flex min-h-screen max-w-5xl items-center px-4 py-8 sm:px-6 lg:px-8">
        {/* Contenedor principal */}
        <div className="grid w-full gap-6 rounded-3xl border border-slate-800 bg-slate-900/70 p-4 shadow-2xl backdrop-blur-md md:grid-cols-2 md:p-6 lg:p-8">
          {/* Panel de marca / texto lateral */}
          <div className="hidden flex-col justify-between border-b border-slate-800/60 pr-0 pb-4 md:flex md:border-b-0 md:border-r md:pr-6 lg:pr-8">
            <div>
              <div className="inline-flex items-center gap-3 rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-200 ring-1 ring-rose-500/40">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-xs font-bold text-white shadow-sm">
                  FP
                </span>
                <span>Sistema de inventario Fire Prevention</span>
              </div>

              <h1 className="mt-6 text-2xl font-semibold leading-tight text-slate-50 lg:text-3xl">
                Controla tu inventario<br />
                <span className="text-rose-300">
                  sin perder trazabilidad.
                </span>
              </h1>

              <p className="mt-3 text-sm text-slate-300/90">
                Registra ingresos desde proveedores, salidas a proyectos
                y devoluciones con precio promedio ponderado (PPP)
                actualizado automáticamente.
              </p>
            </div>

            <ul className="mt-4 space-y-2 text-xs text-slate-400">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Trazabilidad por proyecto / centro de costo.
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                Control de stock crítico por bodega.
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                Roles separados: Admin, Bodega, Chofer, Supervisor.
              </li>
            </ul>
          </div>

          {/* Panel de formulario */}
          <div className="flex flex-col justify-center rounded-2xl bg-slate-950/60 p-5 shadow-inner ring-1 ring-slate-800/70">
            <div className="mb-5 text-center md:hidden">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-500 text-lg font-bold text-white shadow-md">
                FP
              </div>
              <h2 className="text-lg font-semibold text-slate-50">
                Fire Prevention
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Inicia sesión para acceder al panel de inventario.
              </p>
            </div>

            <div className="hidden md:block">
              <h2 className="text-lg font-semibold text-slate-50">
                Iniciar sesión
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Usa tus credenciales asignadas por el administrador.
              </p>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-red-400/60 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              className="mt-5 space-y-4"
              noValidate
            >
              {/* Email */}
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-300">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  required
                  autoFocus
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 shadow-sm outline-none placeholder:text-slate-500 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/40"
                  placeholder="bodega@fireprevention.cl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>

              {/* Password + toggle */}
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-300">
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    type={passwordVisible ? "text" : "password"}
                    required
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 pr-11 text-sm text-slate-50 shadow-sm outline-none placeholder:text-slate-500 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/40"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setPasswordVisible((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs font-medium text-slate-400 hover:text-slate-200"
                    aria-label={
                      passwordVisible
                        ? "Ocultar contraseña"
                        : "Mostrar contraseña"
                    }
                  >
                    {passwordVisible ? "Ocultar" : "Ver"}
                  </button>
                </div>
              </div>

              {/* Botón */}
              <button
                type="submit"
                disabled={submitting}
                className="mt-1 inline-flex w-full items-center justify-center rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? "Verificando credenciales..." : "Iniciar sesión"}
              </button>

              {/* Texto auxiliar */}
              <div className="mt-2 space-y-1 text-[11px] text-slate-400">
                <p>
                  El acceso y los permisos se asignan según tu rol:
                  <span className="font-medium text-slate-200">
                    {" "}
                    Admin, Bodeguero, Chofer, Supervisor
                  </span>
                  .
                </p>
                <p className="text-slate-500">
                  Si olvidaste tu contraseña, contacta al administrador
                  del sistema para restablecerla.
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
