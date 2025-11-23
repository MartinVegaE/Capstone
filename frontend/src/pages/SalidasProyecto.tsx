// src/pages/SalidasProyecto.tsx
import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const API_URL = "http://localhost:4000";

/* =========================
   Tipos
   ========================= */

type MovimientoItem = {
  sku: string;
  nombre: string;
  cantidad: number;
  costoUnitario?: number;
};

type MovimientoSalida = {
  id: number;
  fecha: string; // ISO
  tipo: "Salida" | "Retorno";
  proyecto: string;
  documento: string;
  observacion: string;
  items: MovimientoItem[];
};

type MovimientosResponse = {
  data: MovimientoSalida[];
  total: number;
};

type Proyecto = {
  id: number;
  nombre: string;
};

type ItemDraft = {
  id: string;
  sku: string;
  nombre: string;
  cantidad: string;
};

/* =========================
   Helpers
   ========================= */

function formatDateShort(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function money(n: number) {
  return n.toLocaleString("es-CL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function calcTotal(items: MovimientoItem[]) {
  return items.reduce((acc, it) => {
    const c = it.costoUnitario ?? 0;
    return acc + it.cantidad * c;
  }, 0);
}

/* =========================
   Fetchers
   ========================= */

async function fetchSalidas(): Promise<MovimientosResponse> {
  const url = new URL("/proyectos/movimientos", API_URL);
  url.searchParams.set("tipo", "SALIDA");
  url.searchParams.set("page", "1");
  url.searchParams.set("pageSize", "20");
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Error cargando salidas de proyecto");
  return res.json();
}

async function fetchProyectosAll(): Promise<Proyecto[]> {
  const res = await fetch(`${API_URL}/proyectos`);
  if (!res.ok) throw new Error("Error cargando proyectos");
  return res.json();
}

/* =========================
   Página
   ========================= */

export default function SalidasProyectoPage() {
  const queryClient = useQueryClient();

  const [drawerAbierto, setDrawerAbierto] = useState(false);

  // Filtros básicos del formulario
  const [documento, setDocumento] = useState("");
  const [observacion, setObservacion] = useState("");

  // Proyecto seleccionado
  const [proyectoSearch, setProyectoSearch] = useState("");
  const [selectedProyecto, setSelectedProyecto] =
    useState<Proyecto | null>(null);

  // Ítems
  const [items, setItems] = useState<ItemDraft[]>([
    { id: "item-1", sku: "", nombre: "", cantidad: "" },
  ]);

  /* ========== Datos del listado ========== */

  const {
    data: salidasData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["proyectos", "salidas"],
    queryFn: fetchSalidas,
  });

  const salidas = salidasData?.data ?? [];

  /* ========== Proyectos para el combo ========== */

  const { data: proyectosData } = useQuery({
    queryKey: ["proyectos", "all"],
    queryFn: fetchProyectosAll,
    enabled: drawerAbierto,
  });

  const proyectos = proyectosData ?? [];

  const proyectosFiltrados = useMemo(() => {
    const term = proyectoSearch.trim().toLowerCase();
    if (!term) return [];
    return proyectos.filter((p) =>
      p.nombre.toLowerCase().includes(term)
    );
  }, [proyectos, proyectoSearch]);

  const hayProyectosSugeridos =
    proyectoSearch.trim().length > 0 && proyectosFiltrados.length > 0;

  /* ========== Mutación: crear salida ========== */

  const crearSalidaMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProyecto) {
        throw new Error("Debes seleccionar un proyecto.");
      }

      const cleanedItems = items
        .map((it) => ({
          ...it,
          cantidadNum: Number(it.cantidad),
        }))
        .filter(
          (it) =>
            it.sku.trim() &&
            Number.isFinite(it.cantidadNum) &&
            it.cantidadNum > 0
        );

      if (cleanedItems.length === 0) {
        throw new Error(
          "Debes agregar al menos un ítem con SKU y cantidad > 0."
        );
      }

      const payload = {
        proyectoId: selectedProyecto.id,
        documento: documento.trim() || null,
        observacion: observacion.trim() || null,
        items: cleanedItems.map((it) => ({
          sku: it.sku.trim(),
          cantidad: it.cantidadNum,
        })),
      };

      const res = await fetch(`${API_URL}/proyectos/salidas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Error creando salida");
      }
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["proyectos", "salidas"],
      });
      resetForm();
      setDrawerAbierto(false);
    },
  });

  function resetForm() {
    setDocumento("");
    setObservacion("");
    setProyectoSearch("");
    setSelectedProyecto(null);
    setItems([{ id: "item-1", sku: "", nombre: "", cantidad: "" }]);
  }

  /* ========== Handlers ítems ========== */

  function handleItemChange(
    id: string,
    field: keyof ItemDraft,
    value: string
  ) {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, [field]: value } : it
      )
    );
  }

  function handleAgregarItem() {
    setItems((prev) => [
      ...prev,
      {
        id: `item-${prev.length + 1}-${Date.now()}`,
        sku: "",
        nombre: "",
        cantidad: "",
      },
    ]);
  }

  function handleEliminarItem(id: string) {
    setItems((prev) =>
      prev.length > 1 ? prev.filter((it) => it.id !== id) : prev
    );
  }

  /* ========== Render ========== */

  return (
    <div className="space-y-4">
      {/* Header página */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Salidas a proyecto
          </h2>
          <p className="text-sm text-slate-500">
            Registra egresos de bodega hacia proyectos. El costo usa
            el PPP vigente del producto.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setDrawerAbierto(true);
          }}
          className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-700"
        >
          + Nueva salida a proyecto
        </button>
      </div>

      {/* Tabla de salidas */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Últimas salidas
        </div>

        {isLoading && (
          <div className="p-4 text-sm text-slate-500">
            Cargando salidas...
          </div>
        )}

        {isError && !isLoading && (
          <div className="p-4 text-sm text-red-600">
            Error cargando salidas de proyecto.
          </div>
        )}

        {!isLoading && !isError && salidas.length === 0 && (
          <div className="p-4 text-sm text-slate-500">
            Aún no hay salidas registradas.
          </div>
        )}

        {!isLoading && !isError && salidas.length > 0 && (
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Fecha
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Proyecto
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Documento
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Ítems
                </th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Total aprox.
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {salidas.map((mov) => {
                const total = calcTotal(mov.items);
                const resumenItems = mov.items
                  .slice(0, 3)
                  .map((it) => `${it.sku} x${it.cantidad}`)
                  .join(" · ");
                const mas =
                  mov.items.length > 3
                    ? ` (+${mov.items.length - 3} más)`
                    : "";

                return (
                  <tr key={mov.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-slate-700">
                      {formatDateShort(mov.fecha)}
                    </td>
                    <td className="max-w-xs px-4 py-2 text-slate-800">
                      <div className="truncate">
                        {mov.proyecto || "—"}
                      </div>
                      {mov.observacion && (
                        <div className="truncate text-xs text-slate-500">
                          {mov.observacion}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {mov.documento || "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-600">
                      {resumenItems}
                      {mas}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-slate-900">
                      {total > 0 ? `$${money(total)}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Drawer nueva salida */}
      {drawerAbierto && (
        <div className="fixed inset-0 z-40 flex items-stretch justify-end bg-black/20 backdrop-blur-sm">
          <div className="h-full w-full max-w-3xl transform bg-white shadow-2xl transition">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Nueva salida a proyecto
                </h2>
                <p className="text-sm text-slate-500">
                  Selecciona el proyecto y los ítems que saldrán de
                  bodega.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!crearSalidaMutation.isPending) {
                    setDrawerAbierto(false);
                  }
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                <span className="text-lg" aria-hidden>
                  ×
                </span>
              </button>
            </div>

            {/* Contenido */}
            <div className="flex h-[calc(100%-56px)] flex-col overflow-y-auto px-6 pb-4 pt-3">
              {/* Proyecto + documento/obs */}
              <div className="grid gap-4 md:grid-cols-3">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Proyecto
                  </label>
                  <div className="mt-1">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Busca proyecto por nombre..."
                        value={proyectoSearch}
                        onChange={(e) =>
                          setProyectoSearch(e.target.value)
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                      />
                      {hayProyectosSugeridos && (
                        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                          {proyectosFiltrados.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setSelectedProyecto(p);
                                setProyectoSearch("");
                              }}
                              className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50"
                            >
                              <span className="font-medium text-slate-900">
                                {p.nombre}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {selectedProyecto && (
                      <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Proyecto seleccionado
                        </div>
                        <div className="mt-1 font-medium">
                          {selectedProyecto.nombre}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="md:col-span-1">
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Documento (opcional)
                  </label>
                  <input
                    type="text"
                    value={documento}
                    onChange={(e) =>
                      setDocumento(e.target.value)
                    }
                    placeholder="OC-123, GD-5..."
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                  />

                  <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Observación (opcional)
                  </label>
                  <input
                    type="text"
                    value={observacion}
                    onChange={(e) =>
                      setObservacion(e.target.value)
                    }
                    placeholder="Ej: Envío a proyecto X..."
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                  />
                </div>
              </div>

              {/* Ítems */}
              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Ítems de la salida
                  </h3>
                  <button
                    type="button"
                    onClick={handleAgregarItem}
                    className="text-xs font-medium text-rose-600 hover:text-rose-700"
                  >
                    + Agregar ítem
                  </button>
                </div>

                <div className="mt-3 space-y-3">
                  {items.map((it, index) => (
                    <div
                      key={it.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50/60 px-3 py-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Ítem #{index + 1}
                        </span>
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              handleEliminarItem(it.id)
                            }
                            className="text-xs text-slate-500 hover:text-red-600"
                          >
                            Eliminar ítem
                          </button>
                        )}
                      </div>

                      <div className="mt-2 grid gap-3 md:grid-cols-4">
                        {/* SKU */}
                        <div className="md:col-span-1">
                          <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                            SKU
                          </label>
                          <input
                            type="text"
                            value={it.sku}
                            onChange={(e) =>
                              handleItemChange(
                                it.id,
                                "sku",
                                e.target.value
                              )
                            }
                            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-900 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                          />
                        </div>

                        {/* Nombre (solo referencia visual) */}
                        <div className="md:col-span-2">
                          <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                            Nombre (opcional)
                          </label>
                          <input
                            type="text"
                            value={it.nombre}
                            onChange={(e) =>
                              handleItemChange(
                                it.id,
                                "nombre",
                                e.target.value
                              )
                            }
                            placeholder="Solo referencia, el costo se toma del PPP."
                            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                          />
                        </div>

                        {/* Cantidad */}
                        <div className="md:col-span-1">
                          <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                            Cantidad
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={it.cantidad}
                            onChange={(e) =>
                              handleItemChange(
                                it.id,
                                "cantidad",
                                e.target.value
                              )
                            }
                            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-900 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer acciones */}
              <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    if (!crearSalidaMutation.isPending) {
                      setDrawerAbierto(false);
                    }
                  }}
                  className="text-sm font-medium text-slate-600 hover:text-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => crearSalidaMutation.mutate()}
                  disabled={crearSalidaMutation.isPending}
                  className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-700 disabled:opacity-60"
                >
                  {crearSalidaMutation.isPending
                    ? "Guardando..."
                    : "Registrar salida"}
                </button>
              </div>

              {crearSalidaMutation.isError && (
                <div className="mt-2 text-sm text-red-600">
                  {(crearSalidaMutation.error as Error)?.message ||
                    "Error al registrar salida"}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
