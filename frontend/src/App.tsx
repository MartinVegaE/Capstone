// src/App.tsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppShell from "./components/layout/AppShell";

// Páginas
import ProductsPage from "./pages/Products";
import MovementsPage from "./pages/Movements";
import IngresosPage from "./pages/Ingresos";
import LoginPage from "./pages/Login";
import DashboardPage from "./pages/Dashboard";
import { useAuth } from "./app/AuthContext";
import DevolucionesProveedorPage from "./pages/DevolucionesProveedor";
import SalidasProyectoPage from "./pages/SalidasProyecto";
import RetornosProyectoPage from "./pages/RetornosProyecto";
import ProveedoresPage from "./pages/Proveedores";

// 404
function NotFound() {
  return (
    <div className="mx-auto max-w-7xl p-6">
      <h1 className="text-xl font-semibold">404 - Página no encontrada</h1>
      <p className="mt-2 text-slate-600">
        La ruta solicitada no existe en el sistema.
      </p>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  // Mientras vemos si hay sesión guardada
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 text-slate-500">
        Cargando sesión...
      </div>
    );
  }

  return (
    <BrowserRouter>
      {user ? (
        // ✅ Usuario autenticado: panel dentro del AppShell
        <AppShell>
          <Routes>
            {/* Panel principal */}
            <Route path="/" element={<DashboardPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />

            {/* Inventario */}
            <Route path="/productos" element={<ProductsPage />} />
            <Route path="/movimientos" element={<MovementsPage />} />
            <Route path="/ingresos" element={<IngresosPage />} />
            <Route path="/proveedores" element={<ProveedoresPage />} />

            {/* Proyectos */}
            <Route path="/proyectos/salidas" element={<SalidasProyectoPage />} />
            <Route path="/proyectos/retornos" element={<RetornosProyectoPage />} />

            {/* Devoluciones a proveedor */}
            <Route
              path="/DevolucionesProveedor"
              element={<DevolucionesProveedorPage />}
            />

            {/* Si un usuario logueado intenta ir a /login, lo mandamos al panel */}
            <Route path="/login" element={<Navigate to="/dashboard" replace />} />

            {/* 404 */}
            <Route path="/404" element={<NotFound />} />
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Routes>
        </AppShell>
      ) : (
        // 🚪 Sin usuario: sólo existe /login
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* Cualquier otra ruta redirige a /login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      )}
    </BrowserRouter>
  );
}
