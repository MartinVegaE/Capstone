// src/pages/Ingresos.tsx
import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCategorias } from "../api/catalogs";

const API_URL = "http://localhost:4000";

/* =========================
   Tipos
   ========================= */

type IngresoItemFromApi = {
  sku: string;
  cantidad: number;
  costo?: number | null;
};

type IngresoFromApi = {
  id: number;
  proveedor: string;
  documento?: string | null;
  observacion?: string | null;
  fecha: string; // ISO
  estado?: string | null;
  items: IngresoItemFromApi[];

  // Nuevos: el backend puede enviar tipo y número
  tipoDocumento?: string | null;
  numeroDocumento?: string | null;
};

type IngresosResponse = {
  data: IngresoFromApi[];
  total: number;
};

type Proveedor = {
  id: number;
  nombre: string;
  rut: string | null;
  email: string | null;
  telefono: string | null;
  activo: boolean;
};

type Bodega = {
  id: number;
  nombre: string;
  codigo: string | null;
};

type CategoriaCodigo = "EXT" | "DET" | "ACF" | "FUN";

type Categoria = {
  id: number;
  codigo: CategoriaCodigo;
  nombre: string;
};

type Subcategoria = {
  id: number;
  nombre: string;
  categoriaId: number;
  categoria?: Categoria;
};

type ItemDraft = {
  id: string;
  sku: string;
  nombre: string;
  categoriaCodigo: CategoriaCodigo | "";
  subcategoriaId: number | "" | null;
  cantidad: string;
  costoUnitario: string;
  stockMinimo: string;
};

/* =========================
   Constantes
   ========================= */

const CATEGORIAS_STATIC: { value: CategoriaCodigo; label: string }[] = [
  { value: "EXT", label: "EXT · Extinción" },
  { value: "DET", label: "DET · Detección" },
  { value: "ACF", label: "ACF · Activos fijos" },
  { value: "FUN", label: "FUN · Fungibles" },
];

const TIPO_DOC_OPCIONES: { value: string; label: string }[] = [
  { value: "FACTURA", label: "Factura" },
  { value: "GUIA", label: "Guía de despacho" },
  { value: "NC", label: "Nota de crédito" },
];

/* =========================
   Helpers UI
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

function calcTotal(items: IngresoItemFromApi[]): number {
  return items.reduce((acc, it) => {
    const c = it.costo ?? 0;
    return acc + it.cantidad * c;
  }, 0);
}

function money(n: number) {
  return n.toLocaleString("es-CL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function getTipoDocumentoLabel(tipo?: string | null): string {
  if (!tipo) return "—";
  const opt = TIPO_DOC_OPCIONES.find((o) => o.value === tipo);
  return opt ? opt.label : tipo;
}

function buildDocumentoLabel(ing: {
  tipoDocumento?: string | null;
  numeroDocumento?: string | null;
  documento?: string | null;
}): string {
  const tipoLabel = getTipoDocumentoLabel(ing.tipoDocumento);
  const nro = ing.numeroDocumento?.trim() || "";

  // Si el backend antiguo solo mandaba `documento`, usamos eso.
  if (!ing.tipoDocumento && !nro) {
    return ing.documento || "—";
  }

  if (!ing.tipoDocumento) {
    return nro || "—";
  }

  if (!nro) {
    return tipoLabel;
  }

  return `${tipoLabel} ${nro}`;
}

/* =========================
   Hooks de datos
   ========================= */

async function fetchIngresos(): Promise<IngresosResponse> {
  const url = new URL("/ingresos", API_URL);
  url.searchParams.set("page", "1");
  url.searchParams.set("pageSize", "20");
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error("Error cargando ingresos");
  }
  return res.json();
}

async function fetchProveedores(search: string): Promise<Proveedor[]> {
  const url = new URL("/proveedores", API_URL);
  url.searchParams.set("incluirInactivos", "0");
  if (search.trim()) {
    url.searchParams.set("q", search.trim());
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Error cargando proveedores");
  return res.json();
}

async function fetchBodegaPrincipal(): Promise<Bodega | null> {
  const res = await fetch(`${API_URL}/bodegas`);
  if (!res.ok) throw new Error("Error cargando bodegas");
  const bodegas: Bodega[] = await res.json();
  const principal =
    bodegas.find((b) => b.codigo === "BODEGA_INICIAL") ||
    bodegas.find((b) => (b as any).esPrincipal) ||
    bodegas[0] ||
    null;
  return principal;
}

async function fetchSubcategorias(): Promise<Subcategoria[]> {
  const res = await fetch(`${API_URL}/subcategorias`);
  if (!res.ok) throw new Error("Error cargando subcategorías");
  return res.json();
}

/* =========================
   Página
   ========================= */

export default function IngresosPage() {
  const queryClient = useQueryClient();
  const [nuevoAbierto, setNuevoAbierto] = useState(false);

  // Listado de ingresos
  const { data, isLoading, isError } = useQuery({
    queryKey: ["ingresos"],
    queryFn: fetchIngresos,
  });

  // Catálogo de categorías y subcategorías (desde backend)
  const {
    data: categorias,
    isLoading: loadingCategorias,
    isError: errorCategorias,
  } = useCategorias();

  const {
    data: subcategorias,
    isLoading: loadingSubcategorias,
    isError: errorSubcategorias,
  } = useQuery({
    queryKey: ["subcategorias"],
    queryFn: fetchSubcategorias,
    enabled: !!categorias && categorias.length > 0,
  });

  const categoriasByCodigo = useMemo(() => {
    const map: Record<string, Categoria> = {};
    (categorias ?? []).forEach((c: any) => {
      map[c.codigo as string] = c as Categoria;
    });
    return map;
  }, [categorias]);

  const subcategoriasByCategoriaId = useMemo(() => {
    const grouped: Record<number, Subcategoria[]> = {};
    (subcategorias ?? []).forEach((sc) => {
      if (!grouped[sc.categoriaId]) grouped[sc.categoriaId] = [];
      grouped[sc.categoriaId].push(sc);
    });
    return grouped;
  }, [subcategorias]);

  const categoriaOptions = useMemo(
    () =>
      (categorias ?? []).map((c: any) => ({
        value: c.codigo as CategoriaCodigo,
        label: `${c.codigo} · ${c.nombre}`,
      })),
    [categorias]
  );

  // Datos del drawer (nuevo ingreso)
  const [tipoDocumento, setTipoDocumento] = useState("FACTURA");
  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [observacion, setObservacion] = useState("");

  const [items, setItems] = useState<ItemDraft[]>([
    {
      id: "item-1",
      sku: "",
      nombre: "",
      categoriaCodigo: "",
      subcategoriaId: null,
      cantidad: "",
      costoUnitario: "",
      stockMinimo: "",
    },
  ]);

  // Proveedor combo
  const [proveedorSearch, setProveedorSearch] = useState("");
  const [selectedProveedor, setSelectedProveedor] =
    useState<Proveedor | null>(null);

  const { data: proveedoresData } = useQuery({
    queryKey: ["proveedores", proveedorSearch],
    queryFn: () => fetchProveedores(proveedorSearch),
    enabled: proveedorSearch.trim().length > 0 && nuevoAbierto,
  });

  const proveedores = proveedoresData ?? [];

  // Bodega principal
  const { data: bodegaPrincipal } = useQuery({
    queryKey: ["bodega-principal"],
    queryFn: fetchBodegaPrincipal,
    enabled: nuevoAbierto,
  });

  // Detalle de ingreso (usamos los datos del listado; no hacemos fetch extra)
  const [detalleAbierto, setDetalleAbierto] = useState(false);
  const [ingresoSeleccionado, setIngresoSeleccionado] =
    useState<IngresoFromApi | null>(null);

  function openDetalle(ing: IngresoFromApi) {
    setIngresoSeleccionado(ing);
    setDetalleAbierto(true);
  }

  function closeDetalle() {
    setDetalleAbierto(false);
    setIngresoSeleccionado(null);
  }

  /* ========== Mutación: crear ingreso ========== */

  const crearIngresoMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProveedor) {
        throw new Error("Debes seleccionar un proveedor.");
      }

      const cleanedItems = items
        .map((it) => ({
          ...it,
          cantidadNum: Number(it.cantidad),
          costoNum: Number(it.costoUnitario),
          stockMinNum: it.stockMinimo
            ? Number(it.stockMinimo)
            : undefined,
        }))
        .filter(
          (it) =>
            it.sku.trim() &&
            it.nombre.trim() &&
            Number.isFinite(it.cantidadNum) &&
            it.cantidadNum > 0 &&
            Number.isFinite(it.costoNum) &&
            it.costoNum >= 0
        );

      if (cleanedItems.length === 0) {
        throw new Error(
          "Debes agregar al menos un ítem válido (SKU, nombre, cantidad y costo)."
        );
      }

      const payload = {
        tipoDocumento,
        numeroDocumento: numeroDocumento.trim() || null,
        observacion: observacion.trim() || null,
        proveedorId: selectedProveedor.id,
        proveedor: {
          id: selectedProveedor.id,
          nombre: selectedProveedor.nombre,
          rut: selectedProveedor.rut,
          email: selectedProveedor.email,
          telefono: selectedProveedor.telefono,
        },
        items: cleanedItems.map((it) => ({
          sku: it.sku.trim(),
          nombre: it.nombre.trim(),
          categoriaCodigo: it.categoriaCodigo || undefined,
          subcategoriaId:
            it.subcategoriaId && it.subcategoriaId !== ""
              ? Number(it.subcategoriaId)
              : undefined,
          cantidad: it.cantidadNum,
          costoUnitario: it.costoNum,
          stockMinimo: it.stockMinNum,
        })),
      };

      const res = await fetch(`${API_URL}/ingresos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || (json as any).ok === false) {
        throw new Error(
          (json as any).error || "Error creando ingreso de compra"
        );
      }

      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingresos"] });
      resetForm();
      setNuevoAbierto(false);
    },
  });

  function resetForm() {
    setTipoDocumento("FACTURA");
    setNumeroDocumento("");
    setObservacion("");
    setItems([
      {
        id: "item-1",
        sku: "",
        nombre: "",
        categoriaCodigo: "",
        subcategoriaId: null,
        cantidad: "",
        costoUnitario: "",
        stockMinimo: "",
      },
    ]);
    setProveedorSearch("");
    setSelectedProveedor(null);
  }

  /* ========== Mutación: eliminar ingreso ========== */

  const [eliminandoId, setEliminandoId] = useState<number | null>(null);

  const eliminarIngresoMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_URL}/ingresos/${id}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (json as any).error || "Error eliminando ingreso"
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingresos"] });
    },
    onError: (error: any) => {
      console.error("Error eliminando ingreso:", error);
      alert(
        error?.message ||
          "Error al eliminar ingreso. Revisa la consola."
      );
    },
    onSettled: () => {
      setEliminandoId(null);
    },
  });

  function handleEliminarIngreso(ing: IngresoFromApi) {
    const ok = window.confirm(
      `¿Seguro que quieres eliminar el ingreso #${ing.id}?\n` +
        "Esta acción no se puede deshacer."
    );
    if (!ok) return;
    setEliminandoId(ing.id);
    eliminarIngresoMutation.mutate(ing.id);
  }

  /* ========== Handlers items ========== */

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

  function handleCategoriaChange(id: string, value: string) {
    const val = value as CategoriaCodigo | "";
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              categoriaCodigo: val,
              // al cambiar categoría, limpiamos subcategoría para evitar inconsistencias
              subcategoriaId: "",
            }
          : it
      )
    );
  }

  function handleSubcategoriaChange(id: string, value: string) {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              subcategoriaId: value ? Number(value) : "",
            }
          : it
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
        categoriaCodigo: "",
        subcategoriaId: null,
        cantidad: "",
        costoUnitario: "",
        stockMinimo: "",
      },
    ]);
  }

  function handleEliminarItem(id: string) {
    setItems((prev) =>
      prev.length > 1 ? prev.filter((it) => it.id !== id) : prev
    );
  }

  /* ========== Render ========== */

  const ingresos = data?.data ?? [];

  const hayProveedoresSugeridos =
    proveedorSearch.trim().length > 0 &&
    proveedores.length > 0;

  return (
    <div className="space-y-4">
      {/* Header de la página */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Ingresos de compra
          </h2>
          <p className="text-sm text-slate-500">
            Registra compras a proveedores y actualiza el PPP de
            los productos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setNuevoAbierto(true);
          }}
          className="inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700"
        >
          + Nuevo ingreso
        </button>
      </div>

      {/* Tabla de ingresos */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Últimos ingresos
        </div>

        {isLoading && (
          <div className="p-4 text-sm text-slate-500">
            Cargando ingresos...
          </div>
        )}

        {isError && !isLoading && (
          <div className="p-4 text-sm text-red-600">
            Error cargando ingresos.
          </div>
        )}

        {!isLoading && !isError && ingresos.length === 0 && (
          <div className="p-4 text-sm text-slate-500">
            Aún no hay ingresos registrados.
          </div>
        )}

        {!isLoading && !isError && ingresos.length > 0 && (
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
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ingresos.map((ing) => {
                const total = calcTotal(ing.items);
                const resumenItems = ing.items
                  .slice(0, 3)
                  .map((it, idx) => `${it.sku} x${it.cantidad}`)
                  .join(" · ");
                const mas =
                  ing.items.length > 3
                    ? ` (+${ing.items.length - 3} más)`
                    : "";
                const docLabel = buildDocumentoLabel(ing);

                return (
                  <tr key={ing.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-slate-700">
                      {formatDateShort(ing.fecha)}
                    </td>
                    <td className="max-w-xs px-4 py-2 text-slate-800">
                      <div className="truncate">
                        {ing.proveedor || "—"}
                      </div>
                      {ing.observacion && (
                        <div className="truncate text-xs text-slate-500">
                          {ing.observacion}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {docLabel}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-600">
                      {resumenItems}
                      {mas}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-slate-900">
                      {total > 0 ? `$${money(total)}` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-xs">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openDetalle(ing)}
                          className="rounded-full border border-slate-200 px-3 py-1 font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Ver detalle
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleEliminarIngreso(ing)
                          }
                          disabled={
                            eliminandoId === ing.id ||
                            eliminarIngresoMutation.isPending
                          }
                          className="rounded-full border border-red-100 px-3 py-1 font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                        >
                          {eliminandoId === ing.id
                            ? "Eliminando..."
                            : "Eliminar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal de detalle de ingreso (solo lectura, sin llamadas extra) */}
      {detalleAbierto && ingresoSeleccionado && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Detalle de ingreso #{ingresoSeleccionado.id}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {formatDateShort(ingresoSeleccionado.fecha)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {getTipoDocumentoLabel(
                    ingresoSeleccionado.tipoDocumento
                  )}{" "}
                  · Nº{" "}
                  {ingresoSeleccionado.numeroDocumento?.trim() ||
                    "—"}
                </p>
                {ingresoSeleccionado.observacion && (
                  <p className="mt-1 text-xs text-slate-500">
                    Obs: {ingresoSeleccionado.observacion}
                  </p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  Proveedor:{" "}
                  <span className="font-medium">
                    {ingresoSeleccionado.proveedor || "—"}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={closeDetalle}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                <span className="text-lg" aria-hidden>
                  ×
                </span>
              </button>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Producto
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      SKU
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Cantidad
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Costo unitario
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Subtotal
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {ingresoSeleccionado.items.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-3 text-center text-sm text-slate-500"
                      >
                        Este ingreso no tiene ítems registrados.
                      </td>
                    </tr>
                  ) : (
                    ingresoSeleccionado.items.map((it, idx) => {
                      const costo =
                        typeof it.costo === "number"
                          ? it.costo
                          : 0;
                      const sub =
                        it.cantidad *
                        (Number.isFinite(costo) ? costo : 0);

                      return (
                        <tr key={idx}>
                          <td className="px-3 py-2 text-sm text-slate-700">
                            {`Ítem ${idx + 1}`}
                          </td>
                          <td className="px-3 py-2 text-sm text-slate-500">
                            {it.sku}
                          </td>
                          <td className="px-3 py-2 text-right text-sm text-slate-700">
                            {it.cantidad}
                          </td>
                          <td className="px-3 py-2 text-right text-sm text-slate-700">
                            $
                            {Number.isFinite(costo)
                              ? money(costo)
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-right text-sm text-slate-700">
                            $
                            {Number.isFinite(sub)
                              ? money(sub)
                              : "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Total del ingreso */}
            <div className="mt-4 flex justify-end">
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-right">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Total ingreso
                </div>
                <div className="text-base font-semibold text-slate-900">
                  {(() => {
                    const total = calcTotal(
                      ingresoSeleccionado.items
                    );
                    return total > 0
                      ? `$${money(total)}`
                      : "—";
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Drawer de nuevo ingreso */}
      {nuevoAbierto && (
        <div className="fixed inset-0 z-40 flex items-stretch justify-end bg-black/20 backdrop-blur-sm">
          <div className="h-full w-full max-w-3xl transform bg-white shadow-2xl transition">
            {/* Header drawer */}
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Nuevo ingreso de compra
                </h2>
                <p className="text-sm text-slate-500">
                  Selecciona un proveedor ya registrado y completa
                  los ítems a ingresar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!crearIngresoMutation.isPending) {
                    setNuevoAbierto(false);
                  }
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                <span className="text-lg" aria-hidden>
                  ×
                </span>
              </button>
            </div>

            {/* Contenido drawer */}
            <div className="flex h-[calc(100%-56px)] flex-col overflow-y-auto px-6 pb-4 pt-3">
              {/* Proveedor / tipo doc */}
              <div className="grid gap-4 md:grid-cols-3">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Proveedor
                  </label>
                  <div className="mt-1">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Busca por nombre o RUT..."
                        value={proveedorSearch}
                        onChange={(e) =>
                          setProveedorSearch(e.target.value)
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                      />
                      {/* Dropdown sugerencias */}
                      {hayProveedoresSugeridos && (
                        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                          {proveedores.map((prov) => (
                            <button
                              key={prov.id}
                              type="button"
                              onClick={() => {
                                setSelectedProveedor(prov);
                                setProveedorSearch("");
                              }}
                              className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50"
                            >
                              <span className="font-medium text-slate-900">
                                {prov.nombre}
                              </span>
                              <span className="text-xs text-slate-500">
                                {prov.rut || "Sin RUT"}
                                {prov.email
                                  ? ` · ${prov.email}`
                                  : ""}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Tarjeta proveedor seleccionado */}
                    {selectedProveedor && (
                      <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Proveedor seleccionado
                        </div>
                        <div className="mt-1 font-medium">
                          {selectedProveedor.nombre}
                        </div>
                        <div className="text-xs text-slate-500">
                          {selectedProveedor.rut || "Sin RUT"}
                          {selectedProveedor.email
                            ? ` · ${selectedProveedor.email}`
                            : ""}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="md:col-span-1">
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Tipo de documento
                  </label>
                  <select
                    value={tipoDocumento}
                    onChange={(e) =>
                      setTipoDocumento(e.target.value)
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  >
                    {TIPO_DOC_OPCIONES.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  {bodegaPrincipal && (
                    <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2 text-xs text-slate-600">
                      <div className="font-semibold text-slate-700">
                        Bodega inicial
                      </div>
                      <div>{bodegaPrincipal.nombre}</div>
                      {bodegaPrincipal.codigo && (
                        <div className="text-[11px] text-slate-500">
                          {bodegaPrincipal.codigo}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Documento / observación */}
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div className="md:col-span-1">
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Número de documento
                  </label>
                  <input
                    type="text"
                    value={numeroDocumento}
                    onChange={(e) =>
                      setNumeroDocumento(e.target.value)
                    }
                    placeholder="F-1001"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Observación (opcional)
                  </label>
                  <input
                    type="text"
                    value={observacion}
                    onChange={(e) =>
                      setObservacion(e.target.value)
                    }
                    placeholder="Ej: Reposición por proyecto X..."
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
              </div>

              {/* Ítems */}
              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Ítems del ingreso
                  </h3>
                  <button
                    type="button"
                    onClick={handleAgregarItem}
                    className="text-xs font-medium text-sky-600 hover:text-sky-700"
                  >
                    + Agregar ítem
                  </button>
                </div>

                <div className="mt-3 space-y-3">
                  {items.map((it, index) => {
                    const cat = it.categoriaCodigo
                      ? categoriasByCodigo[it.categoriaCodigo]
                      : undefined;
                    const subcats = cat
                      ? subcategoriasByCategoriaId[cat.id] ?? []
                      : [];

                    const categoriaOptsToUse =
                      categoriaOptions.length > 0
                        ? categoriaOptions
                        : CATEGORIAS_STATIC;

                    return (
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

                        <div className="mt-2 grid gap-3 md:grid-cols-6">
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
                              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                            />
                          </div>

                          {/* Nombre producto */}
                          <div className="md:col-span-2">
                            <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                              Nombre del producto
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
                              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
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
                              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                            />
                          </div>

                          {/* Categoría */}
                          <div className="md:col-span-1">
                            <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                              Categoría
                            </label>
                            <select
                              value={it.categoriaCodigo}
                              onChange={(e) =>
                                handleCategoriaChange(
                                  it.id,
                                  e.target.value
                                )
                              }
                              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                            >
                              <option value="">
                                Seleccionar...
                              </option>
                              {categoriaOptsToUse.map((c) => (
                                <option
                                  key={c.value}
                                  value={c.value}
                                >
                                  {c.label}
                                </option>
                              ))}
                            </select>
                            {errorCategorias && (
                              <p className="mt-1 text-[11px] text-red-600">
                                Error cargando categorías.
                              </p>
                            )}
                          </div>

                          {/* Subcategoría */}
                          <div className="md:col-span-1">
                            <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                              Subcategoría
                            </label>
                            <select
                              value={it.subcategoriaId ?? ""}
                              onChange={(e) =>
                                handleSubcategoriaChange(
                                  it.id,
                                  e.target.value
                                )
                              }
                              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                              disabled={
                                !cat ||
                                loadingSubcategorias ||
                                !!errorSubcategorias
                              }
                            >
                              <option value="">
                                {cat
                                  ? "Sin subcategoría específica"
                                  : "Selecciona categoría primero"}
                              </option>
                              {subcats.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.nombre}
                                </option>
                              ))}
                            </select>
                            <p className="mt-1 text-[11px] text-slate-500">
                              {!cat
                                ? "Primero selecciona una categoría."
                                : loadingSubcategorias
                                ? "Cargando subcategorías..."
                                : subcats.length === 0
                                ? "Esta categoría aún no tiene subcategorías configuradas."
                                : "Opcional: ayuda a ordenar mejor el catálogo."}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-3 md:grid-cols-3">
                          {/* Costo unitario */}
                          <div>
                            <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                              Costo unitario
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={it.costoUnitario}
                              onChange={(e) =>
                                handleItemChange(
                                  it.id,
                                  "costoUnitario",
                                  e.target.value
                                )
                              }
                              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                            />
                          </div>

                          {/* Stock mínimo */}
                          <div>
                            <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                              Stock mínimo (crítico)
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={it.stockMinimo}
                              onChange={(e) =>
                                handleItemChange(
                                  it.id,
                                  "stockMinimo",
                                  e.target.value
                                )
                              }
                              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footer acciones */}
              <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    if (!crearIngresoMutation.isPending) {
                      setNuevoAbierto(false);
                    }
                  }}
                  className="text-sm font-medium text-slate-600 hover:text-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => crearIngresoMutation.mutate()}
                  disabled={crearIngresoMutation.isPending}
                  className="inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
                >
                  {crearIngresoMutation.isPending
                    ? "Guardando..."
                    : "Registrar ingreso"}
                </button>
              </div>

              {crearIngresoMutation.isError && (
                <div className="mt-2 text-sm text-red-600">
                  {(crearIngresoMutation.error as Error)?.message ||
                    "Error al registrar ingreso"}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
