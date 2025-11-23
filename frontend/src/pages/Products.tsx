// src/pages/Products.tsx
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
import { useCategorias } from "../api/catalogs";

type Producto = {
  id: number;
  sku: string;
  nombre: string;
  descripcion?: string | null;
  marca?: string | null;
  categoria?: string | null; // texto legible: Extinción, Detección, etc.
  stock: number;
  stockMinimo?: number | null;
  ubicacion?: string | null;
  codigoBarras?: string | null;
  proveedorId?: number | null;
  imagenUrl?: string | null;
};

type Proveedor = {
  id: number;
  nombre: string;
  rut?: string | null;
  email?: string | null;
  telefono?: string | null;
  activo: boolean;
};

type Categoria = {
  id: number;
  codigo: string; // EXT, DET, ACF, FUN
  nombre: string; // EXTINCIÓN, DETECCIÓN, etc.
};

type Subcategoria = {
  id: number;
  nombre: string;
  categoriaId: number;
  categoria?: Categoria;
};

type ProductFormState = {
  id?: number;
  categoriaCodigo: string;
  sku: string;
  nombre: string;
  marca: string;
  stock: number | "";
  stockMinimo: number | "";
  ubicacion: string;
  codigoBarras: string;
  proveedorId: number | "" | null;
  imagenUrl: string;
};

// Categorías base solo para SKU + etiqueta
// EXT => Extinción (corregido)
const CATEGORY_OPTIONS = [
  { code: "EXT", label: "Extinción" },
  { code: "DET", label: "Detección" },
  { code: "ACF", label: "Accesorios fijos" },
  { code: "FUN", label: "Otros / Funcionales" },
];

const PLACEHOLDER_IMG =
  "https://via.placeholder.com/80x80.png?text=Producto";

function inferCategoriaFromSku(sku: string): string {
  const prefix = sku.split("-")[0] || "";
  const match = CATEGORY_OPTIONS.find((c) => c.code === prefix);
  return match ? match.code : "";
}

function buildInitialSku(categoriaCodigo: string): string {
  if (!categoriaCodigo) return "EXT-0001";
  return `${categoriaCodigo}-0001`;
}

const emptyForm: ProductFormState = {
  categoriaCodigo: "EXT",
  sku: buildInitialSku("EXT"),
  nombre: "",
  marca: "",
  stock: "",
  stockMinimo: "",
  ubicacion: "",
  codigoBarras: "",
  proveedorId: null,
  imagenUrl: "",
};

export default function ProductsPage() {
  const queryClient = useQueryClient();

  // -------------------------
  // Estado UI
  // -------------------------
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Producto | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);

  // Modal subcategorías
  const [isSubcatOpen, setIsSubcatOpen] = useState(false);
  const [subcatNombre, setSubcatNombre] = useState("");
  const [subcatCategoriaId, setSubcatCategoriaId] = useState<number | "">("");
  const [savingSubcat, setSavingSubcat] = useState(false);
  const [subcatError, setSubcatError] = useState<string | null>(null);

  // -------------------------
  // Datos: productos + proveedores + categorías + subcategorías
  // -------------------------
  const {
    data: productos,
    isLoading: loadingProductos,
    error: errorProductos,
  } = useQuery({
    queryKey: ["productos"],
    queryFn: async () => {
      const res = await http.get<Producto[]>("/productos");
      return res.data;
    },
  });

  const {
    data: proveedores,
    isLoading: loadingProveedores,
    error: errorProveedores,
  } = useQuery({
    queryKey: ["proveedores"],
    queryFn: async () => {
      const res = await http.get<Proveedor[]>("/proveedores", {
        params: { incluirInactivos: "0" },
      });
      return res.data;
    },
  });

  const {
    data: categorias,
    isLoading: loadingCategorias,
    isError: errorCategorias,
  } = useCategorias();

  const {
    data: subcategorias,
    isLoading: loadingSubcategorias,
    error: errorSubcategorias,
  } = useQuery({
    queryKey: ["subcategorias"],
    queryFn: async () => {
      const res = await http.get<Subcategoria[]>("/subcategorias");
      return res.data;
    },
  });

  const proveedoresMap = useMemo(() => {
    const map: Record<number, string> = {};
    (proveedores ?? []).forEach((p) => {
      map[p.id] = p.nombre;
    });
    return map;
  }, [proveedores]);

  const categoriasById = useMemo(() => {
    const map: Record<number, Categoria> = {};
    (categorias ?? []).forEach((c) => {
      map[c.id] = c;
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

  const filteredProducts = useMemo(() => {
    if (!productos) return [];
    const term = search.trim().toLowerCase();
    if (!term) return productos;
    return productos.filter((p) => {
      const sku = (p.sku ?? "").toLowerCase();
      const nombre = (p.nombre ?? "").toLowerCase();
      const provName = p.proveedorId
        ? (proveedoresMap[p.proveedorId] ?? "").toLowerCase()
        : "";
      return (
        sku.includes(term) ||
        nombre.includes(term) ||
        provName.includes(term)
      );
    });
  }, [productos, search, proveedoresMap]);

  // -------------------------
  // Helpers para producto
  // -------------------------
  function openCreate() {
    setEditingProduct(null);
    setForm({
      ...emptyForm,
      sku: buildInitialSku("EXT"),
      categoriaCodigo: "EXT",
    });
    setIsOpen(true);
  }

  function openEdit(prod: Producto) {
    const categoriaCodigo = inferCategoriaFromSku(prod.sku || "");
    setEditingProduct(prod);
    setForm({
      id: prod.id,
      categoriaCodigo,
      sku: prod.sku || "",
      nombre: prod.nombre || "",
      marca: prod.marca || "",
      stock: prod.stock ?? "",
      stockMinimo: prod.stockMinimo ?? "",
      ubicacion: prod.ubicacion || "",
      codigoBarras: prod.codigoBarras || "",
      proveedorId: prod.proveedorId ?? null,
      imagenUrl: prod.imagenUrl || "",
    });
    setIsOpen(true);
  }

  function closePanel() {
    setIsOpen(false);
    setEditingProduct(null);
    setForm(emptyForm);
  }

  function handleCategoriaChange(code: string) {
    setForm((prev) => {
      const currentSku = prev.sku || "";
      const match = currentSku.match(/\d+$/);
      const numPart = match ? match[0] : "0001";
      const prefix = code || "EXT";
      return {
        ...prev,
        categoriaCodigo: code,
        sku: `${prefix}-${numPart}`,
      };
    });
  }

  useEffect(() => {
    if (!form.categoriaCodigo && !form.sku) {
      setForm((prev) => ({
        ...prev,
        categoriaCodigo: "EXT",
        sku: buildInitialSku("EXT"),
      }));
    }
  }, [form.categoriaCodigo, form.sku]);

  // -------------------------
  // Guardar producto (crear / editar)
  // -------------------------
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) {
      alert("El nombre del producto es obligatorio.");
      return;
    }
    if (!form.sku.trim()) {
      alert("El SKU es obligatorio.");
      return;
    }
    if (!form.proveedorId) {
      alert("Debes seleccionar un proveedor.");
      return;
    }

    const stockNumber = Number(form.stock || 0);
    const stockMinimoNumber = Number(form.stockMinimo || 0);

    if (!Number.isFinite(stockNumber) || stockNumber < 0) {
      alert("Stock debe ser un número mayor o igual a 0.");
      return;
    }
    if (!Number.isFinite(stockMinimoNumber) || stockMinimoNumber < 0) {
      alert("Stock mínimo debe ser un número mayor o igual a 0.");
      return;
    }

    setSaving(true);
    try {
      const catOption = CATEGORY_OPTIONS.find(
        (c) => c.code === form.categoriaCodigo
      );

      const payload = {
        sku: form.sku.trim(),
        nombre: form.nombre.trim(),
        marca: form.marca.trim() || null,
        // Texto legible: Extinción, Detección, etc.
        categoria: catOption?.label ?? null,
        stock: stockNumber,
        stockMinimo: stockMinimoNumber,
        ubicacion: form.ubicacion.trim() || null,
        codigoBarras: form.codigoBarras.trim() || null,
        proveedorId: form.proveedorId ? Number(form.proveedorId) : null,
        imagenUrl: form.imagenUrl.trim() || null,
      };

      if (editingProduct) {
        await http.put(`/productos/${editingProduct.id}`, payload);
      } else {
        await http.post("/productos", payload);
      }

      await queryClient.invalidateQueries({ queryKey: ["productos"] });
      closePanel();
    } catch (err: any) {
      console.error("Error guardando producto:", err);
      alert(
        err?.response?.data?.error ??
          "Error guardando el producto. Revisa la consola."
      );
    } finally {
      setSaving(false);
    }
  }

  // -------------------------
  // Subcategorías: helpers
  // -------------------------

  // Al abrir el modal, seleccionar una categoría por defecto si hay
  useEffect(() => {
    if (!isSubcatOpen) return;
    if (!categorias || categorias.length === 0) return;
    if (subcatCategoriaId === "") {
      setSubcatCategoriaId(categorias[0].id);
    }
  }, [isSubcatOpen, categorias, subcatCategoriaId]);

  async function handleSubmitSubcategoria(e: FormEvent) {
    e.preventDefault();
    const nombre = subcatNombre.trim();
    if (!nombre) {
      setSubcatError("El nombre de la subcategoría es obligatorio.");
      return;
    }

    if (subcatCategoriaId === "") {
      setSubcatError("Debes seleccionar una categoría.");
      return;
    }

    const categoriaIdNumber = Number(subcatCategoriaId);
    if (!Number.isInteger(categoriaIdNumber) || categoriaIdNumber <= 0) {
      setSubcatError("categoriaId no es válido.");
      return;
    }

    setSavingSubcat(true);
    setSubcatError(null);
    try {
      await http.post("/subcategorias", {
        nombre,
        categoriaId: categoriaIdNumber,
      });
      setSubcatNombre("");
      await queryClient.invalidateQueries({ queryKey: ["subcategorias"] });
    } catch (err: any) {
      console.error("Error creando subcategoría:", err);
      setSubcatError(
        err?.response?.data?.error ??
          "Error creando la subcategoría. Revisa la consola."
      );
    } finally {
      setSavingSubcat(false);
    }
  }

  // -------------------------
  // Render
  // -------------------------
  if (errorProductos) {
    return (
      <div className="text-sm text-red-600">
        Error cargando productos: {String((errorProductos as any).message)}
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
              Inventario de productos
            </h2>
            <p className="text-sm text-slate-500">
              Mantén el catálogo al día, con proveedor e imagen de referencia.
            </p>
          </div>
          <div className="flex w-full justify-start gap-2 sm:w-auto sm:justify-end">
            <button
              type="button"
              onClick={() => setIsSubcatOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <span>⚙️</span>
              <span>Gestionar subcategorías</span>
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-600"
            >
              <span>＋</span>
              <span>Nuevo producto</span>
            </button>
          </div>
        </div>

        {/* Filtros rápidos */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por SKU, nombre o proveedor..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
          </div>
          {loadingProveedores && (
            <div className="text-xs text-slate-500">
              Cargando proveedores...
            </div>
          )}
          {errorProveedores && (
            <div className="text-xs text-red-600">
              Error cargando proveedores.
            </div>
          )}
        </div>

        {/* Tabla de productos */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="py-3 pl-4 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 sm:pl-6">
                  Producto
                </th>
                <th className="hidden px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 sm:table-cell">
                  Categoría
                </th>
                <th className="hidden px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 sm:table-cell">
                  Proveedor
                </th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Stock
                </th>
                <th className="hidden px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 sm:table-cell">
                  Stock mín.
                </th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {loadingProductos ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-sm text-slate-500"
                  >
                    Cargando productos...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-sm text-slate-500"
                  >
                    No hay productos que coincidan con el filtro.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const proveedorNombre = p.proveedorId
                    ? proveedoresMap[p.proveedorId] ?? `ID ${p.proveedorId}`
                    : "Sin proveedor";

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60">
                      <td className="whitespace-nowrap py-3 pl-4 pr-3 text-sm text-slate-900 sm:pl-6">
                        <div className="flex items-center gap-3">
                          <img
                            src={p.imagenUrl || PLACEHOLDER_IMG}
                            alt={p.nombre}
                            className="h-10 w-10 flex-shrink-0 rounded-lg border border-slate-200 object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src =
                                PLACEHOLDER_IMG;
                            }}
                          />
                          <div>
                            <div className="font-medium text-slate-900">
                              {p.nombre}
                            </div>
                            <div className="text-xs text-slate-500">
                              {p.sku}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-3 text-sm text-slate-600 sm:table-cell">
                        {p.categoria ?? "Sin categoría"}
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-3 text-sm text-slate-600 sm:table-cell">
                        {proveedorNombre}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm text-slate-900">
                        {p.stock}
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-3 text-right text-sm text-slate-600 sm:table-cell">
                        {p.stockMinimo ?? 0}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-over formulario de producto */}
      <Transition.Root show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={closePanel}>
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
                        {editingProduct
                          ? "Editar producto"
                          : "Nuevo producto"}
                      </Dialog.Title>
                      <button
                        type="button"
                        onClick={closePanel}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
                      {/* Categoría + SKU */}
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium text-slate-700">
                            Categoría
                          </label>
                          <select
                            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                            value={form.categoriaCodigo}
                            onChange={(e) =>
                              handleCategoriaChange(e.target.value)
                            }
                          >
                            {CATEGORY_OPTIONS.map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.code} — {c.label}
                              </option>
                            ))}
                          </select>
                          <p className="mt-1 text-[11px] text-slate-500">
                            El prefijo del SKU se toma de la categoría
                            (EXT / DET / ACF / FUN).
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700">
                            SKU
                          </label>
                          <input
                            type="text"
                            value={form.sku}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                sku: e.target.value,
                              }))
                            }
                            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                          />
                        </div>
                      </div>

                      {/* Nombre + Marca */}
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
                            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700">
                            Marca (opcional)
                          </label>
                          <input
                            type="text"
                            value={form.marca}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                marca: e.target.value,
                              }))
                            }
                            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                          />
                        </div>
                      </div>

                      {/* Proveedor */}
                      <div>
                        <label className="block text-xs font-medium text-slate-700">
                          Proveedor
                        </label>
                        <select
                          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                          value={form.proveedorId ?? ""}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              proveedorId: e.target.value
                                ? Number(e.target.value)
                                : null,
                            }))
                          }
                        >
                          <option value="">
                            Selecciona un proveedor...
                          </option>
                          {(proveedores ?? []).map((prov) => (
                            <option key={prov.id} value={prov.id}>
                              {prov.nombre}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Los proveedores se crean en la sección{" "}
                          <span className="font-semibold">
                            “Proveedores”
                          </span>
                          . Aquí solo se seleccionan.
                        </p>
                      </div>

                      {/* Stock */}
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium text-slate-700">
                            Stock actual
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={form.stock}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                stock:
                                  e.target.value === ""
                                    ? ""
                                    : Number(e.target.value),
                              }))
                            }
                            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700">
                            Stock mínimo
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={form.stockMinimo}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                stockMinimo:
                                  e.target.value === ""
                                    ? ""
                                    : Number(e.target.value),
                              }))
                            }
                            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                          />
                        </div>
                      </div>

                      {/* Ubicación + Código de barras */}
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium text-slate-700">
                            Ubicación en bodega (opcional)
                          </label>
                          <input
                            type="text"
                            value={form.ubicacion}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                ubicacion: e.target.value,
                              }))
                            }
                            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700">
                            Código de barras (opcional)
                          </label>
                          <input
                            type="text"
                            value={form.codigoBarras}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                codigoBarras: e.target.value,
                              }))
                            }
                            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                          />
                        </div>
                      </div>

                      {/* Imagen */}
                      <div>
                        <label className="block text-xs font-medium text-slate-700">
                          URL de imagen (opcional)
                        </label>
                        <input
                          type="text"
                          value={form.imagenUrl}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              imagenUrl: e.target.value,
                            }))
                          }
                          placeholder="https://..."
                          className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                        />
                        <p className="mt-1 text-[11px] text-slate-500">
                          Más adelante se puede cambiar a subida de archivo;
                          por ahora basta con una URL simple.
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
                        className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-600 disabled:opacity-60"
                      >
                        {saving
                          ? "Guardando..."
                          : editingProduct
                          ? "Guardar cambios"
                          : "Crear producto"}
                      </button>
                    </div>
                  </form>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition.Root>

      {/* Modal de gestión de subcategorías */}
      <Transition.Root show={isSubcatOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-40"
          onClose={setIsSubcatOpen}
        >
          <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm" />
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="transform transition ease-out duration-200"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="transform transition ease-in duration-150"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Dialog.Title className="text-sm font-semibold text-slate-900">
                      Subcategorías de productos
                    </Dialog.Title>
                    <p className="mt-1 text-xs text-slate-500">
                      Las subcategorías detallan cada una de las categorías
                      principales (EXT, DET, ACF, FUN). Se almacenan
                      normalizadas en la base de datos y se pueden reutilizar
                      en productos.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsSubcatOpen(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                </div>

                <form
                  onSubmit={handleSubmitSubcategoria}
                  className="mt-4 flex flex-col gap-3 border-b border-slate-200 pb-4 text-sm"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        Categoría
                      </label>
                      <select
                        className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                        value={subcatCategoriaId === "" ? "" : subcatCategoriaId}
                        onChange={(e) =>
                          setSubcatCategoriaId(
                            e.target.value ? Number(e.target.value) : ""
                          )
                        }
                        disabled={loadingCategorias || !!errorCategorias}
                      >
                        <option value="">
                          {loadingCategorias
                            ? "Cargando categorías..."
                            : errorCategorias
                            ? "Error cargando categorías"
                            : "Selecciona una categoría..."}
                        </option>
                        {(categorias ?? []).map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.codigo} — {cat.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        Nombre de subcategoría
                      </label>
                      <input
                        type="text"
                        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                        value={subcatNombre}
                        onChange={(e) => setSubcatNombre(e.target.value)}
                        placeholder="Ej: Extintores PQS 6kg"
                      />
                    </div>
                  </div>
                  {subcatError && (
                    <p className="text-xs text-red-600">{subcatError}</p>
                  )}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSubcatNombre("");
                        setSubcatError(null);
                      }}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Limpiar
                    </button>
                    <button
                      type="submit"
                      disabled={
                        savingSubcat ||
                        loadingCategorias ||
                        !!errorCategorias
                      }
                      className="rounded-xl bg-rose-500 px-4 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-rose-600 disabled:opacity-60"
                    >
                      {savingSubcat
                        ? "Guardando..."
                        : "Agregar subcategoría"}
                    </button>
                  </div>
                </form>

                <div className="mt-4 max-h-60 space-y-3 overflow-y-auto text-xs">
                  {loadingSubcategorias ? (
                    <p className="text-slate-500">
                      Cargando subcategorías...
                    </p>
                  ) : errorSubcategorias ? (
                    <p className="text-xs text-red-600">
                      Error al cargar subcategorías.
                    </p>
                  ) : !subcategorias || subcategorias.length === 0 ? (
                    <p className="text-slate-500">
                      Aún no hay subcategorías configuradas.
                    </p>
                  ) : (
                    Object.entries(subcategoriasByCategoriaId).map(
                      ([catIdStr, list]) => {
                        const catId = Number(catIdStr);
                        const cat = categoriasById[catId];
                        const header = cat
                          ? `${cat.nombre} (${cat.codigo})`
                          : "Categoría desconocida";

                        return (
                          <div key={catId}>
                            <p className="mb-1 text-[11px] font-semibold text-slate-500">
                              {header}
                            </p>
                            <ul className="flex flex-wrap gap-1.5">
                              {list.map((sc) => (
                                <li
                                  key={sc.id}
                                  className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-700"
                                >
                                  {sc.nombre}
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      }
                    )
                  )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition.Root>
    </>
  );
}
