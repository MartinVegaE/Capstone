// src/pages/DevolucionesProveedor.tsx
import React, {
  Fragment,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { Dialog, Transition } from "@headlessui/react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { http } from "../lib/http";

/* ========= Tipos DTO que vienen del backend ========= */

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

type ProductoCombo = {
  id: number;
  sku: string;
  nombre: string;
  codigoBarras?: string | null;
};

/* ========= Helpers ========= */

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

/* ========= Fetchers (http wrapper) ========= */

async function fetchProveedores(): Promise<ProveedorDTO[]> {
  const res = await http.get<ProveedorDTO[]>("/proveedores");
  return res.data;
}

async function fetchDevolucionesProveedor(params: {
  search: string;
  proveedorFilter: string;
  page: number;
  pageSize: number;
}): Promise<DevolucionListResponse> {
  const { search, proveedorFilter, page, pageSize } = params;
  const res = await http.get<DevolucionListResponse>(
    "/devoluciones/proveedor",
    {
      params: {
        page,
        pageSize,
        q: search.trim() || undefined,
        proveedorId: proveedorFilter || undefined,
      },
    }
  );
  return res.data;
}

// Igual lógica que Movements.tsx: toleramos varias formas de respuesta
async function fetchProductosCombo(): Promise<ProductoCombo[]> {
  const res = await http.get("/productos", {
    params: {
      page: 1,
      pageSize: 500,
    },
  });

  const body: any = res.data;
  console.log("Respuesta /productos (combo devoluciones):", body);

  let productos: any[] = [];

  if (Array.isArray(body)) {
    productos = body;
  } else if (Array.isArray(body.data)) {
    productos = body.data;
  } else if (Array.isArray(body.productos)) {
    productos = body.productos;
  } else {
    productos = [];
  }

  return productos.map((p) => ({
    id: p.id,
    sku: p.sku ?? "",
    nombre: p.nombre ?? "",
    codigoBarras:
      p.codigoBarras ?? p.codigo_barra ?? p.codigo ?? null,
  }));
}

/* ========= Tipos para el formulario ========= */

type NewItemRow = {
  id: string;
  sku: string;
  cantidad: string;
  search: string;
  nombre: string;
};

type NewDevolucionPayload = {
  tipoDocumento?: string;
  numeroDocumento?: string | null;
  observacion?: string | null;
  proveedorId: number;
  items: { sku: string; cantidad: number }[];
};

/* ========= Página principal ========= */

export default function DevolucionesProveedorPage() {
  const queryClient = useQueryClient();

  /* --- Listado / filtros --- */
  const [search, setSearch] = useState("");
  const [proveedorFilter, setProveedorFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const devolucionesQuery = useQuery({
    queryKey: [
      "devolucionesProveedor",
      { search, proveedorFilter, page, pageSize },
    ],
    queryFn: () =>
      fetchDevolucionesProveedor({
        search,
        proveedorFilter,
        page,
        pageSize,
      }),
    keepPreviousData: true,
  });

  const proveedoresFiltroQuery = useQuery({
    queryKey: ["proveedores", "filtro"],
    queryFn: fetchProveedores,
  });

  const devoluciones = devolucionesQuery.data?.data ?? [];
  const total = devolucionesQuery.data?.total ?? 0;
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize]
  );

  /* --- Estado slide-over formulario --- */

  const [isOpen, setIsOpen] = useState(false);

  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [observacion, setObservacion] = useState("");

  const [proveedorSearch, setProveedorSearch] = useState("");
  const [selectedProveedor, setSelectedProveedor] =
    useState<ProveedorDTO | null>(null);

  const [items, setItems] = useState<NewItemRow[]>([
    {
      id: "item-1",
      sku: "",
      cantidad: "1",
      search: "",
      nombre: "",
    },
  ]);

  const [formError, setFormError] = useState<string | null>(null);

  /* --- Datos para combos del formulario --- */

  const {
    data: proveedoresData,
    isLoading: loadingProveedores,
    isError: errorProveedores,
  } = useQuery({
    queryKey: ["proveedores", "combo-devoluciones"],
    queryFn: fetchProveedores,
    enabled: isOpen,
  });

  const proveedores = proveedoresData ?? [];

  const proveedoresFiltrados = useMemo(() => {
    const term = proveedorSearch.trim().toLowerCase();
    if (!term) return [];
    return proveedores.filter((p) => {
      const nombre = (p.nombre ?? "").toLowerCase();
      const rut = (p.rut ?? "").toLowerCase();
      return nombre.includes(term) || rut.includes(term);
    });
  }, [proveedores, proveedorSearch]);

  const hayProveedoresSugeridos =
    proveedorSearch.trim().length > 0 &&
    proveedoresFiltrados.length > 0;

  const {
    data: productosData,
    isLoading: loadingProductos,
    isError: errorProductos,
  } = useQuery({
    queryKey: ["productos", "combo-devoluciones"],
    queryFn: fetchProductosCombo,
    enabled: isOpen,
  });

  const productos = productosData ?? [];

  /* --- Mutación crear devolución --- */

  const crearDevolucionMutation = useMutation({
    mutationKey: ["crearDevolucionProveedor"],
    mutationFn: async (payload: NewDevolucionPayload) => {
      const res = await http.post(
        "/devoluciones/proveedor",
        payload
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["devolucionesProveedor"],
      });
      resetForm();
      setIsOpen(false);
    },
  });

  const saving = crearDevolucionMutation.isPending;

  /* --- Helpers formulario --- */

  function resetForm() {
    setNumeroDocumento("");
    setObservacion("");
    setProveedorSearch("");
    setSelectedProveedor(null);
    setItems([
      {
        id: "item-1",
        sku: "",
        cantidad: "1",
        search: "",
        nombre: "",
      },
    ]);
    setFormError(null);
    crearDevolucionMutation.reset();
  }

  function openForm() {
    resetForm();
    setIsOpen(true);
  }

  function closePanel() {
    if (!saving) {
      setIsOpen(false);
    }
  }

  function handleItemChange(
    id: string,
    field: keyof NewItemRow,
    value: string
  ) {
    setItems((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              [field]: value,
            }
          : r
      )
    );
  }

  function handleAgregarItem() {
    setItems((prev) => [
      ...prev,
      {
        id: `item-${prev.length + 1}-${Date.now()}`,
        sku: "",
        cantidad: "1",
        search: "",
        nombre: "",
      },
    ]);
  }

  function handleEliminarItem(id: string) {
    setItems((prev) =>
      prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!selectedProveedor) {
      setFormError("Debes seleccionar un proveedor.");
      return;
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
      setFormError(
        "Debes agregar al menos un ítem con producto y cantidad mayor a 0."
      );
      return;
    }

    const payload: NewDevolucionPayload = {
      tipoDocumento: "NC",
      numeroDocumento: numeroDocumento.trim() || null,
      observacion: observacion.trim() || null,
      proveedorId: selectedProveedor.id,
      items: cleanedItems.map((it) => ({
        sku: it.sku.trim(),
        cantidad: it.cantidadNum,
      })),
    };

    crearDevolucionMutation.mutate(payload);
  }

  /* --- Render --- */

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        {/* Header página + botón nueva devolución */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Devoluciones a proveedor
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Registra devoluciones de productos a proveedores. El
              stock y el costo promedio se ajustan automáticamente.
            </p>
          </div>
          <button
            type="button"
            onClick={openForm}
            className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-700"
          >
            + Nueva devolución
          </button>
        </header>

        {/* Filtros rápidos */}
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <input
              type="text"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
              placeholder="Buscar por proveedor, RUT, documento u observación..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 sm:w-56"
              value={proveedorFilter}
              onChange={(e) => {
                setProveedorFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos los proveedores</option>
              {proveedoresFiltroQuery.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                  {p.rut ? ` (${p.rut})` : ""}
                </option>
              ))}
            </select>

            <span className="inline-flex items-center justify-center rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
              {devolucionesQuery.isLoading
                ? "Cargando devoluciones..."
                : `Total: ${total} devoluciones`}
            </span>
          </div>
        </section>

        {/* Tabla de devoluciones (mismo formato que Ingresos) */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Últimas devoluciones
            </span>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              Devoluciones a proveedor
            </span>
          </div>

          {devolucionesQuery.isError && (
            <div className="p-4 text-sm text-red-600">
              Error: {(devolucionesQuery.error as Error).message}
            </div>
          )}

          {devolucionesQuery.isLoading && (
            <div className="p-4 text-sm text-slate-600">
              Cargando devoluciones…
            </div>
          )}

          {!devolucionesQuery.isLoading &&
            !devolucionesQuery.isError &&
            devoluciones.length === 0 && (
              <div className="p-4 text-sm text-slate-600">
                No hay devoluciones registradas.
              </div>
            )}

          {!devolucionesQuery.isLoading &&
            !devolucionesQuery.isError &&
            devoluciones.length > 0 && (
              <>
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Fecha
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Proveedor
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
                    {devoluciones.map((d) => {
                      const resumenItems = d.items
                        .slice(0, 3)
                        .map(
                          (it) => `${it.sku} x${it.cantidad}`
                        )
                        .join(" · ");
                      const mas =
                        d.items.length > 3
                          ? ` (+${d.items.length - 3} más)`
                          : "";

                      return (
                        <tr
                          key={d.id}
                          className="hover:bg-slate-50/60"
                        >
                          <td className="whitespace-nowrap px-4 py-2 text-slate-700">
                            {formatDate(d.fecha)}
                          </td>
                          <td className="max-w-xs px-4 py-2 text-slate-800">
                            <div className="truncate font-medium">
                              {d.proveedor
                                ? d.proveedor.nombre
                                : "—"}
                            </div>
                            {d.observacion && (
                              <div className="truncate text-xs text-slate-500">
                                {d.observacion}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2 text-slate-700">
                            {d.numeroDocumento || "—"}
                          </td>
                          <td className="px-4 py-2 text-xs text-slate-600">
                            {resumenItems}
                            {mas}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-right text-slate-900">
                            {formatCurrencyCLP(d.totalValor)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Paginación simple, pegada abajo como en otras tablas */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-2 text-xs text-slate-700">
                    <button
                      type="button"
                      onClick={() =>
                        setPage((p) => Math.max(1, p - 1))
                      }
                      disabled={page <= 1}
                      className="rounded-lg border border-slate-300 px-2 py-1 shadow-sm disabled:opacity-50"
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
                      className="rounded-lg border border-slate-300 px-2 py-1 shadow-sm disabled:opacity-50"
                    >
                      Siguiente
                    </button>
                  </div>
                )}
              </>
            )}
        </section>
      </div>

      {/* Slide-over formulario nueva devolución */}
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
                <Dialog.Panel className="pointer-events-auto w-screen max-w-3xl bg-white shadow-xl">
                  <form
                    onSubmit={handleSubmit}
                    className="flex h-full flex-col"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
                      <div>
                        <Dialog.Title className="text-base font-semibold text-slate-900">
                          Nueva devolución a proveedor
                        </Dialog.Title>
                        <p className="mt-1 text-sm text-slate-500">
                          Selecciona el proveedor, indica el
                          documento (si aplica) y los productos que
                          estás devolviendo.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={closePanel}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
                      >
                        <span className="text-lg" aria-hidden>
                          ×
                        </span>
                      </button>
                    </div>

                    {/* Contenido scrollable */}
                    <div className="flex-1 space-y-6 overflow-y-auto px-6 pb-4 pt-3">
                      {/* Proveedor + documento/obs */}
                      <div className="grid gap-4 md:grid-cols-3">
                        {/* Proveedor buscable */}
                        <div className="md:col-span-1">
                          <label className="text-xs font-medium text-slate-700">
                            Proveedor
                          </label>
                          <div className="mt-1">
                            <div className="relative">
                              <input
                                type="text"
                                placeholder={
                                  loadingProveedores
                                    ? "Cargando proveedores..."
                                    : "Busca por nombre o RUT..."
                                }
                                value={proveedorSearch}
                                onChange={(e) =>
                                  setProveedorSearch(
                                    e.target.value
                                  )
                                }
                                disabled={loadingProveedores}
                                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                              />
                              {hayProveedoresSugeridos && (
                                <div className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                                  {proveedoresFiltrados.map(
                                    (p) => (
                                      <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => {
                                          setSelectedProveedor(
                                            p
                                          );
                                          setProveedorSearch(
                                            ""
                                          );
                                        }}
                                        className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50"
                                      >
                                        <span className="font-medium text-slate-900">
                                          {p.nombre}
                                        </span>
                                        {p.rut && (
                                          <span className="text-xs text-slate-500">
                                            RUT: {p.rut}
                                          </span>
                                        )}
                                      </button>
                                    )
                                  )}
                                </div>
                              )}
                            </div>

                            {errorProveedores && (
                              <p className="mt-1 text-xs text-red-600">
                                Error cargando proveedores.
                              </p>
                            )}

                            {selectedProveedor && (
                              <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Proveedor seleccionado
                                </div>
                                <div className="mt-1 font-medium">
                                  {selectedProveedor.nombre}
                                  {selectedProveedor.rut
                                    ? ` (${selectedProveedor.rut})`
                                    : ""}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Documento */}
                        <div className="flex flex-col gap-2 md:col-span-1">
                          <div>
                            <label className="text-xs font-medium text-slate-700">
                              Número de documento
                            </label>
                            <input
                              type="text"
                              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                              value={numeroDocumento}
                              onChange={(e) =>
                                setNumeroDocumento(
                                  e.target.value
                                )
                              }
                              placeholder="NC-0001"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-slate-700">
                              Comentario (opcional)
                            </label>
                            <input
                              type="text"
                              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                              value={observacion}
                              onChange={(e) =>
                                setObservacion(e.target.value)
                              }
                              placeholder="Motivo de la devolución"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Ítems */}
                      <div>
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-slate-900">
                            Ítems a devolver
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
                          {items.map((row, index) => {
                            const term =
                              row.search.trim().toLowerCase();
                            const sugerencias =
                              term && productos.length > 0
                                ? productos
                                    .filter((p) => {
                                      const sku = (
                                        p.sku ?? ""
                                      ).toLowerCase();
                                      const nombre = (
                                        p.nombre ?? ""
                                      ).toLowerCase();
                                      const cb = (
                                        p.codigoBarras ?? ""
                                      ).toLowerCase();
                                      return (
                                        sku.includes(term) ||
                                        nombre.includes(term) ||
                                        cb.includes(term)
                                      );
                                    })
                                    .slice(0, 10)
                                : [];
                            const haySugerencias =
                              term.length > 0 &&
                              sugerencias.length > 0;

                            return (
                              <div
                                key={row.id}
                                className="rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-3"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Ítem #{index + 1}
                                  </span>
                                  <button
                                    type="button"
                                    className="text-xs text-slate-500 hover:text-red-600"
                                    onClick={() =>
                                      handleEliminarItem(
                                        row.id
                                      )
                                    }
                                    disabled={
                                      items.length <= 1
                                    }
                                  >
                                    Eliminar
                                  </button>
                                </div>

                                <div className="mt-2 grid gap-3 md:grid-cols-[2fr_1fr]">
                                  {/* Búsqueda de producto */}
                                  <div>
                                    <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                      Producto (SKU, nombre o
                                      código de barras)
                                    </label>
                                    <div className="relative mt-1">
                                      <input
                                        type="text"
                                        value={row.search}
                                        onChange={(e) =>
                                          handleItemChange(
                                            row.id,
                                            "search",
                                            e.target.value
                                          )
                                        }
                                        placeholder={
                                          loadingProductos
                                            ? "Cargando productos..."
                                            : "Escanea o busca por SKU, nombre o código..."
                                        }
                                        disabled={
                                          loadingProductos
                                        }
                                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500/30"
                                      />

                                      {haySugerencias && (
                                        <div className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                                          {sugerencias.map(
                                            (p) => (
                                              <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => {
                                                  setItems(
                                                    (
                                                      prev
                                                    ) =>
                                                      prev.map(
                                                        (
                                                          r
                                                        ) =>
                                                          r.id ===
                                                          row.id
                                                            ? {
                                                                ...r,
                                                                sku: p.sku,
                                                                nombre:
                                                                  p.nombre,
                                                                search: `${p.sku} – ${p.nombre}`,
                                                              }
                                                            : r
                                                      )
                                                  );
                                                }}
                                                className="flex w-full flex-col items-start px-3 py-2 text-left text-xs hover:bg-slate-50"
                                              >
                                                <span className="font-medium text-slate-900">
                                                  {p.sku} ·{" "}
                                                  {p.nombre}
                                                </span>
                                                {p.codigoBarras && (
                                                  <span className="text-[11px] text-slate-500">
                                                    Cód. barras:{" "}
                                                    {
                                                      p.codigoBarras
                                                    }
                                                  </span>
                                                )}
                                              </button>
                                            )
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    {errorProductos && (
                                      <p className="mt-1 text-[11px] text-red-600">
                                        Error cargando productos.
                                      </p>
                                    )}
                                    {row.sku && (
                                      <p className="mt-1 text-[11px] text-slate-600">
                                        Producto
                                        seleccionado:{" "}
                                        <span className="font-mono">
                                          {row.sku}
                                        </span>
                                        {row.nombre
                                          ? ` – ${row.nombre}`
                                          : ""}
                                      </p>
                                    )}
                                  </div>

                                  {/* Cantidad */}
                                  <div>
                                    <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                      Cantidad
                                    </label>
                                    <input
                                      type="number"
                                      min={1}
                                      className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500/30"
                                      placeholder="Cantidad"
                                      value={row.cantidad}
                                      onChange={(e) =>
                                        handleItemChange(
                                          row.id,
                                          "cantidad",
                                          e.target.value
                                        )
                                      }
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {formError && (
                        <div className="text-sm text-red-600">
                          {formError}
                        </div>
                      )}
                      {crearDevolucionMutation.isError && (
                        <div className="text-sm text-red-600">
                          {(
                            crearDevolucionMutation.error as Error
                          ).message || "Error al registrar devolución."}
                        </div>
                      )}
                    </div>

                    {/* Footer acciones */}
                    <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3">
                      <button
                        type="button"
                        onClick={closePanel}
                        className="text-sm font-medium text-slate-600 hover:text-slate-800"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-700 disabled:opacity-60"
                      >
                        {saving
                          ? "Guardando..."
                          : "Registrar devolución"}
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
