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
  costo?: number;
};

type IngresoFromApi = {
  id: number;
  proveedor: string;
  documento: string;
  observacion: string;
  fecha: string; // ISO
  estado: string;
  items: IngresoItemFromApi[];
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

type ProductoBusqueda = {
  id: number;
  sku: string;
  nombre: string;
  categoriaCodigo?: CategoriaCodigo;
  subcategoriaId?: number | null;
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
  // estado solo de UI para el buscador de productos
  searchTerm?: string;
  searchResults?: ProductoBusqueda[];
  searchLoading?: boolean;
  searchError?: string | null;
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

async function buscarProductos(term: string): Promise<ProductoBusqueda[]> {
  const url = new URL("/productos", API_URL);
  url.searchParams.set("page", "1");
  url.searchParams.set("pageSize", "20");
  if (term.trim()) {
    url.searchParams.set("q", term.trim());
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error("Error buscando productos");
  }
  const json = await res.json();
  const list = Array.isArray(json) ? json : json.data ?? [];

  return (list as any[]).map((p) => ({
    id: p.id,
    sku: p.sku,
    nombre: p.nombre,
    categoriaCodigo:
      (p.categoriaCodigo as CategoriaCodigo | undefined) ??
      (p.categoria?.codigo as CategoriaCodigo | undefined),
    subcategoriaId: p.subcategoriaId ?? p.subcategoria?.id ?? null,
  }));
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

  // Datos del drawer
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
      searchTerm: "",
      searchResults: [],
      searchLoading: false,
      searchError: null,
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
        searchTerm: "",
        searchResults: [],
        searchLoading: false,
        searchError: null,
      },
    ]);
    setProveedorSearch("");
    setSelectedProveedor(null);
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
  const newCat = value as CategoriaCodigo | "";

  setItems((prev) =>
    prev.map((it) => {
      if (it.id !== id) return it;

      // Prefijos conocidos de SKU por categoría
      const knownPrefixes = CATEGORIAS_STATIC.map(
        (c) => `${c.value}-`
      );

      let newSku = it.sku;

      // Solo sobreescribimos el SKU si:
      // - está vacío, o
      // - ya tenía un prefijo de categoría (EXT-, DET-, etc.)
      if (
        !newSku ||
        knownPrefixes.some((pref) => newSku.startsWith(pref))
      ) {
        newSku = newCat ? `${newCat}-` : "";
      }

      return {
        ...it,
        categoriaCodigo: newCat,
        subcategoriaId: "",
        sku: newSku,
      };
    })
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
        searchTerm: "",
        searchResults: [],
        searchLoading: false,
        searchError: null,
      },
    ]);
  }

  function handleEliminarItem(id: string) {
    setItems((prev) =>
      prev.length > 1 ? prev.filter((it) => it.id !== id) : prev
    );
  }

  function handleItemSearchTermChange(id: string, value: string) {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? { ...it, searchTerm: value, searchError: null }
          : it
      )
    );
  }

  async function handleBuscarProducto(
    id: string,
    rawTerm: string | undefined
  ) {
    const term = (rawTerm ?? "").trim();

    // set loading
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              searchLoading: true,
              searchError: null,
              searchResults: [],
            }
          : it
      )
    );

    if (!term) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? {
                ...it,
                searchLoading: false,
                searchError: "Escribe algo para buscar.",
              }
            : it
        )
      );
      return;
    }

    try {
      const results = await buscarProductos(term);
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? {
                ...it,
                searchLoading: false,
                searchResults: results,
                searchError:
                  results.length === 0
                    ? "No se encontraron productos."
                    : null,
              }
            : it
        )
      );
    } catch (err: any) {
      console.error("Error buscando productos:", err);
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? {
                ...it,
                searchLoading: false,
                searchResults: [],
                searchError:
                  err?.message ??
                  "Error buscando productos. Revisa la consola.",
              }
            : it
        )
      );
    }
  }

  function handleSelectProducto(
    itemId: string,
    p: ProductoBusqueda
  ) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;

        let categoriaCodigo = it.categoriaCodigo;
        let subcategoriaId: number | "" | null = it.subcategoriaId;

        if (
          p.categoriaCodigo &&
          categoriasByCodigo[p.categoriaCodigo]
        ) {
          categoriaCodigo = p.categoriaCodigo;
          subcategoriaId = p.subcategoriaId ?? "";
        }

        return {
          ...it,
          sku: p.sku,
          nombre: p.nombre,
          categoriaCodigo,
          subcategoriaId,
          searchTerm: "",
          searchResults: [],
          searchError: null,
        };
      })
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ingresos.map((ing) => {
                const total = calcTotal(ing.items);
                const resumenItems = ing.items
                  .slice(0, 3)
                  .map((it) => `${it.sku} x${it.cantidad}`)
                  .join(" · ");
                const mas =
                  ing.items.length > 3
                    ? ` (+${ing.items.length - 3} más)`
                    : "";
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
                      {ing.documento || "—"}
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

                        {/* Buscador de producto existente */}
                        <div className="mt-2 rounded-xl border border-dashed border-slate-200 bg-white/60 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={it.searchTerm ?? ""}
                              onChange={(e) =>
                                handleItemSearchTermChange(
                                  it.id,
                                  e.target.value
                                )
                              }
                              placeholder="Buscar producto por SKU o nombre..."
                              className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/40"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                handleBuscarProducto(
                                  it.id,
                                  it.searchTerm
                                )
                              }
                              className="rounded-lg bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-60"
                              disabled={!!it.searchLoading}
                            >
                              {it.searchLoading
                                ? "Buscando..."
                                : "Buscar"}
                            </button>
                          </div>
                          {it.searchError && (
                            <p className="mt-1 text-[11px] text-red-600">
                              {it.searchError}
                            </p>
                          )}
                          {it.searchResults &&
                            it.searchResults.length > 0 && (
                              <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white text-xs">
                                {it.searchResults.map((p) => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() =>
                                      handleSelectProducto(
                                        it.id,
                                        p
                                      )
                                    }
                                    className="flex w-full flex-col items-start px-2 py-1.5 text-left hover:bg-slate-50"
                                  >
                                    <span className="font-medium text-slate-900">
                                      {p.sku} · {p.nombre}
                                    </span>
                                    {p.categoriaCodigo && (
                                      <span className="text-[11px] text-slate-500">
                                        {p.categoriaCodigo}
                                        {p.subcategoriaId
                                          ? ` · subcat #${p.subcategoriaId}`
                                          : ""}
                                      </span>
                                    )}
                                  </button>
                                ))}
                              </div>
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
                              value={
                                it.subcategoriaId ?? ""
                              }
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
                                <option
                                  key={s.id}
                                  value={s.id}
                                >
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
                  onClick={() =>
                    crearIngresoMutation.mutate()
                  }
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
                  {(crearIngresoMutation.error as Error)
                    ?.message || "Error al registrar ingreso"}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
