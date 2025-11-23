// src/pages/CentroCostos.tsx
import React, {
  Fragment,
  useMemo,
  useState,
  useEffect,
  FormEvent,
} from "react";
import { Dialog, Transition } from "@headlessui/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "../lib/http";

/* =========================
   Tipos
   ========================= */

type Proyecto = {
  id: number;
  nombre: string;
  codigo?: string | null;
  descripcion?: string | null;
  activo: boolean;
  creadoEn: string;
  actualizadoEn: string;
  movimientosCount?: number;
};

type ProyectoFormState = {
  id?: number;
  nombre: string;
  codigo: string;
  descripcion: string;
  activo: boolean;
};

/* =========================
   Helpers
   ========================= */

const emptyForm: ProyectoFormState = {
  nombre: "",
  codigo: "",
  descripcion: "",
  activo: true,
};

function formatDateShort(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function estadoBadgeClasses(activo: boolean): string {
  return activo
    ? "bg-emerald-100 text-emerald-700"
    : "bg-slate-200 text-slate-600";
}

/* =========================
   Página
   ========================= */

export default function CentroCostosPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [soloActivos, setSoloActivos] = useState(true);

  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Proyecto | null>(null);
  const [form, setForm] = useState<ProyectoFormState>(emptyForm);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // =========================
  // Data: proyectos
  // =========================

  const {
    data: proyectos,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["proyectos", { soloActivos }],
    queryFn: async () => {
      const res = await http.get<Proyecto[]>("/proyectos", {
        params: {
          soloActivos: soloActivos ? "1" : "0",
        },
      });
      return res.data;
    },
  });

  // =========================
  // Filtro en memoria
  // =========================

  const filtered = useMemo(() => {
    const list = proyectos ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return list;

    return list.filter((p) => {
      const nombre = (p.nombre ?? "").toLowerCase();
      const codigo = (p.codigo ?? "").toLowerCase();
      const descripcion = (p.descripcion ?? "").toLowerCase();
      return (
        nombre.includes(term) ||
        codigo.includes(term) ||
        descripcion.includes(term)
      );
    });
  }, [proyectos, search]);

  // =========================
  // helpers abrir/cerrar formulario
  // =========================

  function openCreate() {
    setEditing(null);
    setForm({
      ...emptyForm,
      activo: true,
    });
    setIsOpen(true);
  }

  function openEdit(p: Proyecto) {
    setEditing(p);
    setForm({
      id: p.id,
      nombre: p.nombre ?? "",
      codigo: p.codigo ?? "",
      descripcion: p.descripcion ?? "",
      activo: p.activo,
    });
    setIsOpen(true);
  }

  function closePanel() {
    if (saving) return;
    setIsOpen(false);
    setEditing(null);
    setForm(emptyForm);
  }

  // =========================
  // Guardar (crear / editar)
  // =========================

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!form.nombre.trim()) {
      alert("El nombre del centro de costo / proyecto es obligatorio.");
      return;
    }

    const payload = {
      nombre: form.nombre.trim(),
      codigo: form.codigo.trim() || null,
      descripcion: form.descripcion.trim() || null,
      activo: form.activo,
    };

    setSaving(true);
    try {
      if (editing) {
        await http.put(`/proyectos/${editing.id}`, payload);
      } else {
        await http.post("/proyectos", payload);
      }

      await queryClient.invalidateQueries({
        queryKey: ["proyectos"],
      });
      closePanel();
    } catch (err: any) {
      console.error("Error guardando proyecto/centro de costo:", err);
      alert(
        err?.response?.data?.error ??
          "Error guardando el centro de costo. Revisa la consola."
      );
    } finally {
      setSaving(false);
    }
  }

  // =========================
  // Eliminar
  // =========================

  async function handleDelete(p: Proyecto) {
    const ok = window.confirm(
      `¿Seguro que quieres eliminar el centro de costo/proyecto "${p.nombre}"?\n` +
        "Si tiene movimientos asociados, el sistema podría bloquear la eliminación."
    );
    if (!ok) return;

    setDeletingId(p.id);
    try {
      await http.delete(`/proyectos/${p.id}`);
      await queryClient.invalidateQueries({
        queryKey: ["proyectos"],
      });
    } catch (err: any) {
      console.error("Error eliminando proyecto/centro de costo:", err);
      alert(
        err?.response?.data?.error ??
          "Error eliminando el centro de costo. Revisa la consola."
      );
    } finally {
      setDeletingId(null);
    }
  }

  // =========================
  // Render
  // =========================

  if (error) {
    return (
      <div className="text-sm text-red-600">
        Error cargando centros de costo:{" "}
        {String((error as any).message)}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Encabezado */}
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Centros de costo por proyecto
            </h2>
            <p className="text-sm text-slate-500">
              Define y gestiona los centros de costo asociados a cada
              proyecto. Estos se usan luego en los movimientos de stock.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700"
          >
            <span>＋</span>
            <span>Nuevo centro de costo</span>
          </button>
        </div>

        {/* Filtros / buscador */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, código o descripción..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-600">
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={soloActivos}
                onChange={(e) => {
                  setSoloActivos(e.target.checked);
                  // refrescamos remoto al cambiar
                  setTimeout(() => {
                    refetch();
                  }, 0);
                }}
                className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span>Mostrar solo activos</span>
            </label>
            {isLoading && (
              <span className="text-slate-400">
                Cargando centros de costo...
              </span>
            )}
          </div>
        </div>

        {/* Grid de centros de costo */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            <div className="col-span-full rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
              Cargando centros de costo...
            </div>
          ) : !filtered || filtered.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-sm text-slate-500">
              Aún no hay centros de costo configurados. Crea uno con el
              botón{" "}
              <span className="font-semibold">
                “Nuevo centro de costo”
              </span>
              .
            </div>
          ) : (
            filtered.map((p) => (
              <div
                key={p.id}
                className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {p.codigo || "SIN CÓDIGO"}
                    </div>
                    <h3 className="mt-1 text-sm font-semibold text-slate-900">
                      {p.nombre}
                    </h3>
                    {p.descripcion && (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                        {p.descripcion}
                      </p>
                    )}
                  </div>
                  <span
                    className={
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium " +
                      estadoBadgeClasses(p.activo)
                    }
                  >
                    {p.activo ? "Activo" : "Inactivo"}
                  </span>
                </div>

                <div className="mt-3 space-y-1 text-[11px] text-slate-600">
                  <div>
                    <span className="font-medium">Movimientos:</span>{" "}
                    {p.movimientosCount ?? 0}
                  </div>
                  <div>
                    <span className="font-medium">Creado:</span>{" "}
                    {formatDateShort(p.creadoEn)}
                  </div>
                  <div>
                    <span className="font-medium">Actualizado:</span>{" "}
                    {formatDateShort(p.actualizadoEn)}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(p)}
                    className="flex-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Ver / Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(p)}
                    disabled={deletingId === p.id}
                    className="rounded-full border border-red-100 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                  >
                    {deletingId === p.id ? "Eliminando..." : "Eliminar"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Slide-over formulario */}
      <Transition.Root show={isOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={closePanel}
        >
          <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm" />

          <div className="fixed inset-0 overflow-hidden">
            <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-300"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-300"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <Dialog.Panel className="pointer-events-auto w-screen max-w-md bg-white shadow-xl">
                  <form
                    onSubmit={handleSubmit}
                    className="flex h-full flex-col"
                  >
                    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                      <Dialog.Title className="text-sm font-semibold text-slate-900">
                        {editing
                          ? "Editar centro de costo / proyecto"
                          : "Nuevo centro de costo / proyecto"}
                      </Dialog.Title>
                      <button
                        type="button"
                        onClick={closePanel}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
                      {/* Nombre + Código */}
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium text-slate-700">
                            Nombre
                          </label>
                          <input
                            type="text"
                            value={form.nombre}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                nombre: e.target.value,
                              }))
                            }
                            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                          <p className="mt-1 text-[11px] text-slate-500">
                            Nombre del proyecto / centro de costo.
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700">
                            Código (opcional)
                          </label>
                          <input
                            type="text"
                            value={form.codigo}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                codigo: e.target.value,
                              }))
                            }
                            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                          <p className="mt-1 text-[11px] text-slate-500">
                            Código contable o identificador de centro
                            de costo.
                          </p>
                        </div>
                      </div>

                      {/* Descripción */}
                      <div>
                        <label className="block text-xs font-medium text-slate-700">
                          Descripción (opcional)
                        </label>
                        <textarea
                          value={form.descripcion}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              descripcion: e.target.value,
                            }))
                          }
                          rows={3}
                          className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          placeholder="Ej: Proyecto mantención planta X, centro de costo 1234..."
                        />
                      </div>

                      {/* Activo */}
                      <div>
                        <label className="block text-xs font-medium text-slate-700">
                          Estado
                        </label>
                        <div className="mt-1 inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                activo: true,
                              }))
                            }
                            className={
                              "rounded-full px-3 py-1 text-xs font-medium " +
                              (form.activo
                                ? "bg-emerald-600 text-white"
                                : "bg-slate-100 text-slate-600")
                            }
                          >
                            Activo
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                activo: false,
                              }))
                            }
                            className={
                              "rounded-full px-3 py-1 text-xs font-medium " +
                              (!form.activo
                                ? "bg-slate-700 text-white"
                                : "bg-slate-100 text-slate-600")
                            }
                          >
                            Inactivo
                          </button>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Si marcas un centro de costo como inactivo,
                          dejará de aparecer por defecto en los
                          formularios de movimientos.
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
                      <button
                        type="button"
                        onClick={closePanel}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
                      >
                        {saving
                          ? "Guardando..."
                          : editing
                          ? "Guardar cambios"
                          : "Crear centro de costo"}
                      </button>
                    </div>
                  </form>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition.Root>
    </>
  );
}
