// src/pages/Proveedores.tsx
import React, { useEffect, useMemo, useState } from "react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

interface Proveedor {
  id: number;
  nombre: string;
  rut: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  activo: boolean;
}

interface ProveedorForm {
  nombre: string;
  rut: string;
  email: string;
  telefono: string;
  direccion: string;
  activo: boolean;
}

const emptyForm: ProveedorForm = {
  nombre: "",
  rut: "",
  email: "",
  telefono: "",
  direccion: "",
  activo: true,
};

const ProveedoresPage: React.FC = () => {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [mostrarInactivos, setMostrarInactivos] = useState(false);

  const [openForm, setOpenForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ProveedorForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ==========================
  // Cargar proveedores
  // ==========================

  async function loadProveedores() {
    try {
      setLoading(true);
      const qs = mostrarInactivos ? "?incluirInactivos=1" : "";
      const resp = await fetch(`${API_BASE_URL}/proveedores${qs}`);
      if (!resp.ok) throw new Error("Error cargando proveedores");
      const data: Proveedor[] = await resp.json();
      setProveedores(data);
    } catch (e) {
      console.error("Error /proveedores:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProveedores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarInactivos]);

  // ==========================
  // Filtro en memoria
  // ==========================

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return proveedores;
    return proveedores.filter((p) => {
      const nombre = p.nombre?.toLowerCase() ?? "";
      const rut = p.rut?.toLowerCase() ?? "";
      const email = p.email?.toLowerCase() ?? "";
      return (
        nombre.includes(q) || rut.includes(q) || email.includes(q)
      );
    });
  }, [proveedores, search]);

  // ==========================
  // Helpers formulario
  // ==========================

  function openNewForm() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      activo: true,
    });
    setErrorMsg(null);
    setOpenForm(true);
  }

  function openEditForm(p: Proveedor) {
    setEditingId(p.id);
    setForm({
      nombre: p.nombre ?? "",
      rut: p.rut ?? "",
      email: p.email ?? "",
      telefono: p.telefono ?? "",
      direccion: p.direccion ?? "",
      activo: p.activo,
    });
    setErrorMsg(null);
    setOpenForm(true);
  }

  function closeForm() {
    setOpenForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setErrorMsg(null);
  }

  function handleFormChange<K extends keyof ProveedorForm>(
    field: K,
    value: ProveedorForm[K]
  ) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  // ==========================
  // Guardar (create / update)
  // ==========================

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    const payload = {
      nombre: form.nombre.trim(),
      rut: form.rut.trim() || undefined,
      email: form.email.trim() || undefined,
      telefono: form.telefono.trim() || undefined,
      direccion: form.direccion.trim() || undefined,
      activo: form.activo,
    };

    if (!payload.nombre) {
      setErrorMsg("El nombre del proveedor es obligatorio.");
      return;
    }

    try {
      setSaving(true);

      let url = `${API_BASE_URL}/proveedores`;
      let method: "POST" | "PUT" = "POST";

      if (editingId != null) {
        url = `${API_BASE_URL}/proveedores/${editingId}`;
        method = "PUT";
      }

      const resp = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok || (json as any).error) {
        throw new Error(
          (json as any).error || "Error al guardar proveedor."
        );
      }

      await loadProveedores();
      closeForm();
    } catch (e: any) {
      console.error("Error guardando proveedor:", e);
      setErrorMsg(e?.message || "Error al guardar proveedor.");
    } finally {
      setSaving(false);
    }
  }

  // ==========================
  // Desactivar / Reactivar
  // ==========================

  async function desactivarProveedor(p: Proveedor) {
    if (!window.confirm(`¿Desactivar proveedor "${p.nombre}"?`)) return;

    try {
      const resp = await fetch(
        `${API_BASE_URL}/proveedores/${p.id}`,
        { method: "DELETE" }
      );
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || (json as any).error) {
        throw new Error(
          (json as any).error || "Error al desactivar proveedor."
        );
      }
      await loadProveedores();
    } catch (e) {
      console.error("Error desactivando proveedor:", e);
      alert("No se pudo desactivar el proveedor.");
    }
  }

  async function reactivarProveedor(p: Proveedor) {
    try {
      const resp = await fetch(
        `${API_BASE_URL}/proveedores/${p.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activo: true }),
        }
      );
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || (json as any).error) {
        throw new Error(
          (json as any).error || "Error al reactivar proveedor."
        );
      }
      await loadProveedores();
    } catch (e) {
      console.error("Error reactivando proveedor:", e);
      alert("No se pudo reactivar el proveedor.");
    }
  }

  // ==========================
  // Render
  // ==========================

  return (
    <>
      {/* Contenido principal de la página */}
      <div className="space-y-6">
        {/* Encabezado */}
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Proveedores
            </h2>
            <p className="text-sm text-slate-500">
              Mantén el catálogo de proveedores que luego se usan en
              ingresos y devoluciones.
            </p>
          </div>

          <button
            type="button"
            onClick={openNewForm}
            className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
          >
            + Nuevo proveedor
          </button>
        </div>

        {/* Filtros y búsqueda */}
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 items-center gap-2">
            <div className="relative flex-1">
              <input
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                placeholder="Buscar por nombre, RUT o email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              checked={mostrarInactivos}
              onChange={(e) => setMostrarInactivos(e.target.checked)}
            />
            Mostrar también inactivos
          </label>
        </div>

        {/* Lista */}
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              Proveedores ({filtered.length}
              {loading ? " ⋯" : ""})
            </h3>
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-slate-500">
              {loading
                ? "Cargando proveedores..."
                : "No hay proveedores para mostrar."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2">Nombre</th>
                    <th className="px-2 py-2">RUT</th>
                    <th className="px-2 py-2">Email</th>
                    <th className="px-2 py-2">Teléfono</th>
                    <th className="px-2 py-2">Estado</th>
                    <th className="px-2 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100">
                      <td className="px-2 py-2 text-sm text-slate-900">
                        {p.nombre}
                      </td>
                      <td className="px-2 py-2 text-xs text-slate-700">
                        {p.rut || "—"}
                      </td>
                      <td className="px-2 py-2 text-xs text-slate-700">
                        {p.email || "—"}
                      </td>
                      <td className="px-2 py-2 text-xs text-slate-700">
                        {p.telefono || "—"}
                      </td>
                      <td className="px-2 py-2 text-xs">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            p.activo
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                              : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                          }`}
                        >
                          {p.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right text-xs">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditForm(p)}
                            className="text-sky-700 hover:text-sky-900"
                          >
                            Editar
                          </button>
                          {p.activo ? (
                            <button
                              type="button"
                              onClick={() => desactivarProveedor(p)}
                              className="text-red-500 hover:text-red-700"
                            >
                              Desactivar
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => reactivarProveedor(p)}
                              className="text-emerald-600 hover:text-emerald-800"
                            >
                              Reactivar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Slide-over tipo Ingresos */}
      {openForm && (
        <div className="fixed inset-0 z-40 flex">
          {/* Fondo oscurecido */}
          <div
            className="flex-1 bg-slate-900/40"
            onClick={closeForm}
          />

          {/* Panel lateral */}
          <div className="relative flex w-full max-w-md flex-col bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  {editingId ? "Editar proveedor" : "Nuevo proveedor"}
                </h3>
                <p className="text-xs text-slate-500">
                  Completa los datos básicos del proveedor.
                </p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            {/* Mensaje de error */}
            {errorMsg && (
              <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {errorMsg}
              </div>
            )}

            {/* Formulario */}
            <form
              onSubmit={handleSubmit}
              className="flex flex-1 flex-col overflow-hidden"
            >
              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Nombre *
                    </label>
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      value={form.nombre}
                      onChange={(e) =>
                        handleFormChange("nombre", e.target.value)
                      }
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      RUT
                    </label>
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      placeholder="11.111.111-1"
                      value={form.rut}
                      onChange={(e) =>
                        handleFormChange("rut", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Email
                    </label>
                    <input
                      type="email"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      value={form.email}
                      onChange={(e) =>
                        handleFormChange("email", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Teléfono
                    </label>
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      value={form.telefono}
                      onChange={(e) =>
                        handleFormChange("telefono", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Dirección
                    </label>
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      value={form.direccion}
                      onChange={(e) =>
                        handleFormChange("direccion", e.target.value)
                      }
                    />
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    checked={form.activo}
                    onChange={(e) =>
                      handleFormChange("activo", e.target.checked)
                    }
                  />
                  Proveedor activo
                </label>
              </div>

              {/* Footer botones */}
              <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                >
                  {saving
                    ? "Guardando..."
                    : editingId
                    ? "Guardar cambios"
                    : "Crear proveedor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default ProveedoresPage;
