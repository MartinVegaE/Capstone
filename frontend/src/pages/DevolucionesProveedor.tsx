// src/pages/DevolucionesProveedor.tsx
import React, { useMemo, useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:4000";

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // si no hay JSON, lo dejamos en null
  }

  if (!res.ok) {
    const msg =
      data && data.error
        ? data.error
        : `Error HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data as T;
}

// ==== Tipos DTO que vienen del backend ====

type ProveedorDTO = {
  id: number;
  nombre: string;
  rut: string | null;
};

type BodegaDTO = {
  id: number;
  nombre: string;
};

type DevolucionItemDTO = {
  id: number;
  productoId: number;
  sku: string;
  nombreProducto: string;
  cantidad: number;
  costoUnitario: number;
};

type DevolucionDTO = {
  id: number;
  fecha: string;
  numeroDocumento: string;
  observacion: string;
  proveedor: {
    id: number;
    nombre: string;
    rut: string;
  } | null;
  bodega: BodegaDTO | null;
  totalCantidad: number;
  totalValor: number;
  items: DevolucionItemDTO[];
};

type DevolucionListResponse = {
  data: DevolucionDTO[];
  total: number;
};

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatCurrencyCLP(value: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

// ===============================
//   Formulario: Nueva devolución
// ===============================

type NewItemRow = {
  id: number;
  sku: string;
  cantidad: number;
};

type NewDevolucionPayload = {
  tipoDocumento?: string;
  numeroDocumento?: string;
  observacion?: string;
  proveedorId: number;
  items: { sku: string; cantidad: number }[];
};

function NuevaDevolucionForm(props: { onCreated?: () => void }) {
  const { onCreated } = props;
  const queryClient = useQueryClient();

  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [observacion, setObservacion] = useState("");
  const [proveedorId, setProveedorId] = useState<string>("");
  const [items, setItems] = useState<NewItemRow[]>([
    { id: 1, sku: "", cantidad: 1 },
  ]);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  // Lista de proveedores para el select
  const proveedoresQuery = useQuery({
    queryKey: ["proveedores"],
    queryFn: () => fetchJson<ProveedorDTO[]>("/proveedores"),
  });

  const mutation = useMutation({
    mutationKey: ["crearDevolucionProveedor"],
    mutationFn: (payload: NewDevolucionPayload) =>
      fetchJson<{ ok: boolean; devolucionId: number }>(
        "/devoluciones/proveedor",
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      ),
    onSuccess: () => {
      // refrescar listado
      queryClient.invalidateQueries({
        queryKey: ["devolucionesProveedor"],
      });
      // limpiar formulario
      setNumeroDocumento("");
      setObservacion("");
      setProveedorId("");
      setItems([{ id: 1, sku: "", cantidad: 1 }]);
      setErrorLocal(null);
      onCreated?.();
    },
  });

  function addItemRow() {
    setItems((prev) => [
      ...prev,
      {
        id: prev.length ? prev[prev.length - 1].id + 1 : 1,
        sku: "",
        cantidad: 1,
      },
    ]);
  }

  function removeItemRow(id: number) {
    setItems((prev) =>
      prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)
    );
  }

  function updateItem(
    id: number,
    field: keyof NewItemRow,
    value: string
  ) {
    setItems((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              [field]:
                field === "cantidad"
                  ? Number(value) || 0
                  : value,
            }
          : r
      )
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorLocal(null);

    const pid = Number(proveedorId);
    if (!Number.isFinite(pid) || pid <= 0) {
      setErrorLocal("Debes seleccionar un proveedor.");
      return;
    }

    const itemsValidos = items
      .map((it) => ({
        sku: it.sku.trim(),
        cantidad: Number(it.cantidad),
      }))
      .filter((it) => it.sku && it.cantidad > 0);

    if (!itemsValidos.length) {
      setErrorLocal(
        "Debes ingresar al menos un ítem con SKU y cantidad > 0."
      );
      return;
    }

    const payload: NewDevolucionPayload = {
      tipoDocumento: "NC", // el backend hoy lo ignora, pero queda coherente
      numeroDocumento: numeroDocumento.trim() || undefined,
      observacion: observacion.trim() || undefined,
      proveedorId: pid,
      items: itemsValidos,
    };

    mutation.mutate(payload);
  }

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold mb-3">
        Nueva devolución a proveedor
      </h2>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">
              Proveedor
            </label>
            <select
              className="rounded-lg border px-3 py-2 text-sm"
              value={proveedorId}
              onChange={(e) =>
                setProveedorId(e.target.value)
              }
              disabled={proveedoresQuery.isLoading}
            >
              <option value="">Selecciona proveedor…</option>
              {proveedoresQuery.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                  {p.rut ? ` (${p.rut})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">
              Número de documento (NC)
            </label>
            <input
              type="text"
              className="rounded-lg border px-3 py-2 text-sm"
              value={numeroDocumento}
              onChange={(e) =>
                setNumeroDocumento(e.target.value)
              }
              placeholder="NC-0001"
            />
          </div>

          <div className="flex flex-col gap-1 md:col-span-1">
            <label className="text-sm font-medium">
              Observación
            </label>
            <input
              type="text"
              className="rounded-lg border px-3 py-2 text-sm"
              value={observacion}
              onChange={(e) =>
                setObservacion(e.target.value)
              }
              placeholder="Motivo de la devolución"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              Ítems a devolver
            </span>
            <button
              type="button"
              className="text-sm text-blue-600 hover:underline"
              onClick={addItemRow}
            >
              + Agregar ítem
            </button>
          </div>

          <div className="space-y-2">
            {items.map((row) => (
              <div
                key={row.id}
                className="grid gap-2 md:grid-cols-[2fr_1fr_auto]"
              >
                <input
                  type="text"
                  className="rounded-lg border px-3 py-2 text-sm"
                  placeholder="SKU"
                  value={row.sku}
                  onChange={(e) =>
                    updateItem(row.id, "sku", e.target.value)
                  }
                />
                <input
                  type="number"
                  min={1}
                  className="rounded-lg border px-3 py-2 text-sm"
                  placeholder="Cantidad"
                  value={row.cantidad}
                  onChange={(e) =>
                    updateItem(row.id, "cantidad", e.target.value)
                  }
                />
                <button
                  type="button"
                  className="text-sm text-red-600 hover:underline self-center"
                  onClick={() => removeItemRow(row.id)}
                  disabled={items.length <= 1}
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        </div>

        {errorLocal && (
          <p className="text-sm text-red-600">{errorLocal}</p>
        )}
        {mutation.isError && (
          <p className="text-sm text-red-600">
            {(mutation.error as Error).message}
          </p>
        )}

        <button
          type="submit"
          disabled={mutation.isLoading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {mutation.isLoading
            ? "Guardando..."
            : "Registrar devolución"}
        </button>
      </form>
    </div>
  );
}

// ===============================
//   Página principal (cards)
// ===============================

export default function DevolucionesProveedorPage() {
  const [search, setSearch] = useState("");
  const [proveedorFilter, setProveedorFilter] = useState<string>(
    ""
  );
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [expandedId, setExpandedId] = useState<number | null>(
    null
  );

  const devolucionesQuery = useQuery({
    queryKey: [
      "devolucionesProveedor",
      { search, proveedorFilter, page, pageSize },
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (search.trim()) params.set("q", search.trim());
      if (proveedorFilter)
        params.set("proveedorId", proveedorFilter);

      return fetchJson<DevolucionListResponse>(
        `/devoluciones/proveedor?${params.toString()}`
      );
    },
    keepPreviousData: true,
  });

  const proveedoresQuery = useQuery({
    queryKey: ["proveedores"],
    queryFn: () => fetchJson<ProveedorDTO[]>("/proveedores"),
  });

  const total = devolucionesQuery.data?.total ?? 0;
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize]
  );

  function toggleExpand(id: number) {
    setExpandedId((cur) => (cur === id ? null : id));
  }

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            Devoluciones a proveedor
          </h1>
          <p className="text-sm text-slate-600">
            Registra y revisa las devoluciones de productos a
            proveedores. El stock y el PPP se actualizan
            automáticamente.
          </p>
        </div>
      </header>

      {/* Formulario nueva devolución */}
      <NuevaDevolucionForm
        onCreated={() => {
          setPage(1);
        }}
      />

      {/* Filtros */}
      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">
          Filtros
        </h2>
        <div className="grid gap-3 md:grid-cols-[2fr_2fr_auto]">
          <input
            type="text"
            className="rounded-lg border px-3 py-2 text-sm"
            placeholder="Buscar por proveedor, RUT, documento u observación..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />

          <select
            className="rounded-lg border px-3 py-2 text-sm"
            value={proveedorFilter}
            onChange={(e) => {
              setProveedorFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos los proveedores</option>
            {proveedoresQuery.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
                {p.rut ? ` (${p.rut})` : ""}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2 justify-end text-xs text-slate-600">
            <span>
              Total:{" "}
              <strong>{devolucionesQuery.data?.total ?? 0}</strong>{" "}
              devoluciones
            </span>
          </div>
        </div>
      </section>

      {/* Listado en cards */}
      <section className="space-y-3">
        {devolucionesQuery.isLoading && (
          <p className="text-sm text-slate-600">
            Cargando devoluciones…
          </p>
        )}
        {devolucionesQuery.isError && (
          <p className="text-sm text-red-600">
            Error:{" "}
            {(devolucionesQuery.error as Error).message}
          </p>
        )}

        {!devolucionesQuery.isLoading &&
          devolucionesQuery.data?.data.length === 0 && (
            <p className="text-sm text-slate-600">
              No hay devoluciones registradas.
            </p>
          )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {devolucionesQuery.data?.data.map((d) => {
            const expanded = expandedId === d.id;
            return (
              <article
                key={d.id}
                className="flex flex-col rounded-xl border bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Devolución #{d.id}
                    </p>
                    <h3 className="text-sm font-semibold">
                      Documento:{" "}
                      {d.numeroDocumento || "Sin número"}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Fecha: {formatDate(d.fecha)}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
                    Devolución
                  </span>
                </div>

                <div className="mt-3 space-y-1 text-sm">
                  <p>
                    <span className="font-medium">
                      Proveedor:
                    </span>{" "}
                    {d.proveedor
                      ? `${d.proveedor.nombre}${
                          d.proveedor.rut
                            ? ` (${d.proveedor.rut})`
                            : ""
                        }`
                      : "Sin proveedor"}
                  </p>
                  <p className="text-xs text-slate-600">
                    Bodega:{" "}
                    {d.bodega?.nombre || "Bodega principal"}
                  </p>
                  {d.observacion && (
                    <p className="text-xs text-slate-600">
                      Observación: {d.observacion}
                    </p>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between text-sm">
                  <div className="space-y-0.5">
                    <p>
                      <span className="font-medium">
                        Unidades:
                      </span>{" "}
                      {d.totalCantidad}
                    </p>
                    <p>
                      <span className="font-medium">
                        Ítems:
                      </span>{" "}
                      {d.items.length}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">
                      Valor total estimado
                    </p>
                    <p className="text-sm font-semibold">
                      {formatCurrencyCLP(d.totalValor)}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className="mt-3 text-xs font-medium text-blue-600 hover:underline self-start"
                  onClick={() => toggleExpand(d.id)}
                >
                  {expanded
                    ? "Ocultar detalle"
                    : "Ver detalle de ítems"}
                </button>

                {expanded && (
                  <div className="mt-2 rounded-lg border bg-slate-50 p-2">
                    <table className="w-full border-collapse text-[11px]">
                      <thead>
                        <tr className="text-left text-slate-500">
                          <th className="px-1 py-1">
                            SKU
                          </th>
                          <th className="px-1 py-1">
                            Producto
                          </th>
                          <th className="px-1 py-1 text-right">
                            Cant.
                          </th>
                          <th className="px-1 py-1 text-right">
                            Costo
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.items.map((it) => (
                          <tr key={it.id}>
                            <td className="px-1 py-0.5">
                              {it.sku}
                            </td>
                            <td className="px-1 py-0.5">
                              {it.nombreProducto}
                            </td>
                            <td className="px-1 py-0.5 text-right">
                              {it.cantidad}
                            </td>
                            <td className="px-1 py-0.5 text-right">
                              {formatCurrencyCLP(
                                it.costoUnitario
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {/* Paginación simple */}
        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 text-xs">
            <button
              type="button"
              onClick={() =>
                setPage((p) => Math.max(1, p - 1))
              }
              disabled={page <= 1}
              className="rounded-lg border px-2 py-1 disabled:opacity-50"
            >
              Anterior
            </button>
            <span>
              Página {page} de {totalPages}
            </span>
            <button
              type="button"
              onClick={() =>
                setPage((p) =>
                  Math.min(totalPages, p + 1)
                )
              }
              disabled={page >= totalPages}
              className="rounded-lg border px-2 py-1 disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
