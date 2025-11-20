// src/pages/Products.tsx
import React, { useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import ControlPanel, {
  type ViewMode,
} from "../components/layout/ControlPanel";
import Button from "../components/ui/Button";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

/* ============
   Tipos básicos
   ============ */

type Producto = {
  id: number;
  sku: string;
  nombre: string;
  marca: string | null;
  categoria: string | null;
  stock: number;
  ubicacion: string | null;
  codigoBarras: string | null;
};

type CatalogoSimple = {
  id: number;
  nombre: string;
};

type Bodega = {
  id: number;
  nombre: string;
  codigo: string | null;
};

/* =====================
   Helpers de HTTP / API
   ===================== */

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) {
    throw new Error(`Error HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let msg = `Error HTTP ${res.status}`;
    try {
      const data = (await res.json()) as any;
      if (data?.error) msg = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

async function deleteApi(path: string): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    let msg = `Error HTTP ${res.status}`;
    try {
      const data = (await res.json()) as any;
      if (data?.error) msg = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
}

/* ==========================
   Página de gestión de stock
   ========================== */

export default function ProductsPage() {
  const [q, setQ] = useState("");
  const [view, setView] = useState<ViewMode>("list");

  // Estado del formulario "nuevo producto"
  const [sku, setSku] = useState("");
  const [nombre, setNombre] = useState("");
  const [codigoBarras, setCodigoBarras] = useState("");
  const [categoriaNombre, setCategoriaNombre] = useState("");
  const [marcaNombre, setMarcaNombre] = useState("");
  const [bodegaNombre, setBodegaNombre] = useState("");
  const [stockInicial, setStockInicial] = useState<number>(0);
  const [formError, setFormError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  /* =========
     Queries
     ========= */

  // Productos
  const {
    data: productos,
    isLoading: productosLoading,
    isError: productosError,
    refetch: refetchProductos,
  } = useQuery<Producto[]>({
    queryKey: ["productos"],
    queryFn: () => getJson<Producto[]>("/productos"),
  });

  // Catálogos
  const { data: categorias } = useQuery<CatalogoSimple[]>({
    queryKey: ["categorias"],
    queryFn: () => getJson<CatalogoSimple[]>("/categorias"),
  });

  const { data: marcas } = useQuery<CatalogoSimple[]>({
    queryKey: ["marcas"],
    queryFn: () => getJson<CatalogoSimple[]>("/marcas"),
  });

  const { data: bodegas } = useQuery<Bodega[]>({
    queryKey: ["bodegas"],
    queryFn: () => getJson<Bodega[]>("/bodegas"),
  });

  const filteredProductos = useMemo(() => {
    const list = productos ?? [];
    const term = q.trim().toLowerCase();
    if (!term) return list;

    return list.filter((p) => {
      return (
        p.sku.toLowerCase().includes(term) ||
        p.nombre.toLowerCase().includes(term) ||
        (p.categoria ?? "").toLowerCase().includes(term) ||
        (p.marca ?? "").toLowerCase().includes(term)
      );
    });
  }, [productos, q]);

  /* ===========
     Mutations
     =========== */

  const createMut = useMutation({
    mutationFn: (body: {
      sku: string;
      nombre: string;
      codigoBarras: string;
      categoria?: string | null;
      marca?: string | null;
      ubicacion?: string | null;
      stockInicial?: number;
    }) => postJson<Producto>("/productos", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["productos"] });
      // limpiar formulario
      setSku("");
      setNombre("");
      setCodigoBarras("");
      setCategoriaNombre("");
      setMarcaNombre("");
      setBodegaNombre("");
      setStockInicial(0);
      setFormError(null);
    },
    onError: (err: any) => {
      setFormError(err?.message ?? "No se pudo crear el producto.");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteApi(`/productos/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["productos"] });
    },
  });

  /* ===========
     Handlers
     =========== */

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    if (!sku.trim() || !nombre.trim() || !codigoBarras.trim()) {
      setFormError("SKU, Nombre y Código de barras son obligatorios.");
      return;
    }

    const body = {
      sku: sku.trim(),
      nombre: nombre.trim(),
      codigoBarras: codigoBarras.trim(),
      categoria: categoriaNombre || null,
      marca: marcaNombre || null,
      ubicacion: bodegaNombre || null,
      stockInicial: Number.isFinite(stockInicial) ? stockInicial : 0,
    };

    createMut.mutate(body);
  }

  function handleDelete(p: Producto) {
    if (!window.confirm(`¿Eliminar el producto "${p.nombre}" (${p.sku})?`)) {
      return;
    }
    deleteMut.mutate(p.id);
  }

  /* ========
     Render
     ======== */

  return (
    <section className="w-full px-6 pb-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-slate-900">
          Gestión de productos
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Crea y administra los productos que luego usarás en ingresos,
          movimientos y proyectos.
        </p>
      </header>

      <ControlPanel
        search={q}
        onSearch={(v) => setQ(v)}
        view={view}
        onChangeView={setView}
      />

      {/* Bloque de creación */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">
          Crear nuevo producto
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Los campos <strong>SKU</strong>, <strong>Nombre</strong> y{" "}
          <strong>Código de barras</strong> son obligatorios.
        </p>

        {formError && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-slate-600">
                SKU *
              </label>
              <input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm font-mono"
                placeholder="EXT-001"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">
                Nombre *
              </label>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
                placeholder="Extintor PQS 6kg"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">
                Código de barras *
              </label>
              <input
                value={codigoBarras}
                onChange={(e) => setCodigoBarras(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm font-mono"
                placeholder="Escanea o escribe el código"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">
                Stock inicial
              </label>
              <input
                type="number"
                min={0}
                value={stockInicial}
                onChange={(e) => setStockInicial(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">
                Categoría
              </label>
              <select
                value={categoriaNombre}
                onChange={(e) => setCategoriaNombre(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
              >
                <option value="">Sin categoría</option>
                {(categorias ?? []).map((c) => (
                  <option key={c.id} value={c.nombre}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">
                Marca
              </label>
              <select
                value={marcaNombre}
                onChange={(e) => setMarcaNombre(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
              >
                <option value="">Sin marca</option>
                {(marcas ?? []).map((m) => (
                  <option key={m.id} value={m.nombre}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">
                Bodega / Ubicación
              </label>
              <select
                value={bodegaNombre}
                onChange={(e) => setBodegaNombre(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
              >
                <option value="">Sin bodega</option>
                {(bodegas ?? []).map((b) => (
                  <option key={b.id} value={b.nombre}>
                    {b.nombre}
                    {b.codigo ? ` · ${b.codigo}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              variant="primary"
              disabled={createMut.isPending}
            >
              {createMut.isPending ? "Creando..." : "Crear producto"}
            </Button>
          </div>
        </form>
      </div>

      {/* Tabla de productos actuales */}
      <div className="mt-6 mx-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left">SKU</th>
              <th className="px-4 py-3 text-left">Nombre</th>
              <th className="px-4 py-3 text-left">Código barras</th>
              <th className="px-4 py-3 text-left">Categoría</th>
              <th className="px-4 py-3 text-left">Marca</th>
              <th className="px-4 py-3 text-left">Bodega</th>
              <th className="px-4 py-3 text-right">Stock</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {productosLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-6">
                  <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
                </td>
              </tr>
            )}

            {productosError && !productosLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-red-700">
                  Error al cargar productos.{" "}
                  <Button size="sm" onClick={() => refetchProductos()}>
                    Reintentar
                  </Button>
                </td>
              </tr>
            )}

            {!productosLoading &&
              !productosError &&
              filteredProductos.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-slate-500"
                  >
                    No hay productos registrados aún.
                  </td>
                </tr>
              )}

            {!productosLoading &&
              !productosError &&
              filteredProductos.map((p) => (
                <tr
                  key={p.id}
                  className="border-t hover:bg-slate-50/60"
                >
                  <td className="px-4 py-3 font-mono">{p.sku}</td>
                  <td className="px-4 py-3">{p.nombre}</td>
                  <td className="px-4 py-3 font-mono">
                    {p.codigoBarras ?? ""}
                  </td>
                  <td className="px-4 py-3">{p.categoria ?? ""}</td>
                  <td className="px-4 py-3">{p.marca ?? ""}</td>
                  <td className="px-4 py-3">{p.ubicacion ?? ""}</td>
                  <td className="px-4 py-3 text-right">
                    {p.stock.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleDelete(p)}
                      disabled={deleteMut.isPending}
                    >
                      Eliminar
                    </Button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
