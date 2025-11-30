// src/pages/Products.tsx
import React, {
  Fragment,
  useMemo,
  useState,
  useEffect,
  type FormEvent,
} from "react";
import { Dialog, Transition } from "@headlessui/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "../lib/http";
import { useCategorias } from "../api/catalogs";

/* =========================
   Tipos
   ========================= */

type Producto = {
  id: number;
  sku: string;
  nombre: string;
  descripcion?: string | null;

  // Categoría / subcategoría
  categoria?: string | null;
  categoriaCodigo?: string | null;
  categoriaNombre?: string | null;
  subcategoriaId?: number | null;
  subcategoriaNombre?: string | null;

  stock: number;
  stockMinimo?: number | null;
  ubicacion?: string | null;
  codigoBarras?: string | null;
  proveedorId?: number | null;
  imagenUrl?: string | null;

  // PPP real desde backend
  ppp?: number | string | null;
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
  codigo: string;
  nombre: string;
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
  subcategoriaId: number | "" | null;
  sku: string;
  nombre: string;
  stock: number | "";
  stockMinimo: number | "";
  ubicacion: string;
  codigoBarras: string;
  proveedorId: number | "" | null;
  imagenUrl: string;
};

/* =========================
   Constantes + helpers
   ========================= */

// EXT => Extinción
const CATEGORY_OPTIONS = [
  { code: "EXT", label: "Extinción" },
  { code: "DET", label: "Detección" },
  { code: "ACF", label: "Activos fijos" },
  { code: "FUN", label: "Fungibles" },
];

const PLACEHOLDER_IMG =
  "https://via.placeholder.com/80x80.png?text=Producto";

// Base de API para exportar CSV
const API_BASE =
  import.meta.env.VITE_API_URL ?? "http://localhost:4000";

function openCsv(path: string) {
  const url = `${API_BASE}${path}`;
  window.open(url, "_blank");
}

function inferCategoriaFromSku(sku: string): string {
  const prefix = sku.split("-")[0] || "";
  const match = CATEGORY_OPTIONS.find((c) => c.code === prefix);
  return match ? match.code : "";
}

function buildInitialSku(categoriaCodigo: string): string {
  if (!categoriaCodigo) return "EXT-0001";
  return `${categoriaCodigo}-0001`;
}

function getCategoriaLabelFromProducto(p: Producto): string {
  const raw = (p.categoria ?? p.categoriaNombre ?? "").trim();

  if (raw) {
    const lower = raw.toLowerCase();

    if (lower.startsWith("act") && lower.includes("fij")) {
      return "Activos fijos";
    }
    if (lower.includes("fungib")) {
      return "Fungibles";
    }
    if (lower.includes("extinc")) {
      return "Extinción";
    }
    if (lower.includes("detec")) {
      return "Detección";
    }

    return raw;
  }

  const code = (
    p.categoriaCodigo ?? inferCategoriaFromSku(p.sku || "")
  ).toUpperCase();
  const opt = CATEGORY_OPTIONS.find((c) => c.code === code);
  return opt ? opt.label : "Sin categoría";
}

function money(n: number) {
  return n.toLocaleString("es-CL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

// Normalizar PPP a número
function normalizePPP(
  raw: number | string | null | undefined
): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

const emptyForm: ProductFormState = {
  categoriaCodigo: "EXT",
  subcategoriaId: null,
  sku: buildInitialSku("EXT"),
  nombre: "",
  stock: "",
  stockMinimo: "",
  ubicacion: "",
  codigoBarras: "",
  proveedorId: null,
  imagenUrl: "",
};


export default function ProductsPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingProduct, setEditingProduct] =
    useState<Producto | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // búsqueda de proveedor dentro del formulario
  const [proveedorSearch, setProveedorSearch] = useState("");

  // Modal subcategorías
  const [isSubcatOpen, setIsSubcatOpen] = useState(false);
  const [subcatNombre, setSubcatNombre] = useState("");
  const [subcatCategoriaId, setSubcatCategoriaId] = useState<
    number | ""
  >("");
  const [savingSubcat, setSavingSubcat] = useState(false);
  const [subcatError, setSubcatError] = useState<string | null>(null);
  const [editingSubcat, setEditingSubcat] =
    useState<Subcategoria | null>(null);

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
      return res.data.map((p) => ({
        ...p,
        ppp: normalizePPP(p.ppp),
      }));
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

  const subcategoriasMap = useMemo(() => {
    const map: Record<number, Subcategoria> = {};
    (subcategorias ?? []).forEach((sc) => {
      map[sc.id] = sc;
    });
    return map;
  }, [subcategorias]);

  // proveedores para el buscador del formulario
  const proveedoresFiltrados = useMemo(() => {
    const term = proveedorSearch.trim().toLowerCase();
    if (!term) return [] as Proveedor[];
    return (proveedores ?? []).filter((p) => {
      const nombre = (p.nombre ?? "").toLowerCase();
      const rut = (p.rut ?? "").toLowerCase();
      return nombre.includes(term) || rut.includes(term);
    });
  }, [proveedores, proveedorSearch]);

  const hayProveedoresSugeridos =
    proveedorSearch.trim().length > 0 &&
    proveedoresFiltrados.length > 0;

  // categoría seleccionada en el formulario
  const currentCategoria = useMemo(() => {
    if (!categorias) return null;
    return (
      categorias.find(
        (c) => c.codigo === form.categoriaCodigo
      ) ?? null
    );
  }, [categorias, form.categoriaCodigo]);

  const currentSubcategorias: Subcategoria[] = useMemo(() => {
    if (!currentCategoria) return [];
    return (
      subcategoriasByCategoriaId[currentCategoria.id] ?? []
    );
  }, [currentCategoria, subcategoriasByCategoriaId]);

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
      const categoriaLabel =
        getCategoriaLabelFromProducto(p).toLowerCase();
      const subcatObj = p.subcategoriaId
        ? subcategoriasMap[p.subcategoriaId]
        : undefined;
      const subcatName = (
        p.subcategoriaNombre ?? subcatObj?.nombre ?? ""
      ).toLowerCase();
      const codigoBarras = (p.codigoBarras ?? "").toLowerCase();

      return (
        sku.includes(term) ||
        nombre.includes(term) ||
        provName.includes(term) ||
        categoriaLabel.includes(term) ||
        subcatName.includes(term) ||
        codigoBarras.includes(term)
      );
    });
  }, [productos, search, proveedoresMap, subcategoriasMap]);

  // -------------------------
  // Helpers para producto
  // -------------------------
  function openCreate() {
    setEditingProduct(null);
    setForm({
      ...emptyForm,
      categoriaCodigo: "EXT",
      sku: buildInitialSku("EXT"),
    });
    setProveedorSearch("");
    setIsOpen(true);
  }

  function openEdit(prod: Producto) {
    const categoriaCodigo =
      prod.categoriaCodigo || inferCategoriaFromSku(prod.sku || "");

    setEditingProduct(prod);
    setForm({
      id: prod.id,
      categoriaCodigo: categoriaCodigo || "EXT",
      subcategoriaId: prod.subcategoriaId ?? null,
      sku: prod.sku || "",
      nombre: prod.nombre || "",
      stock: prod.stock ?? "",
      stockMinimo: prod.stockMinimo ?? "",
      ubicacion: prod.ubicacion || "",
      codigoBarras: prod.codigoBarras || "",
      proveedorId: prod.proveedorId ?? null,
      imagenUrl: prod.imagenUrl || "",
    });
    setProveedorSearch("");
    setIsOpen(true);
  }

  function closePanel() {
    setIsOpen(false);
    setEditingProduct(null);
    setForm(emptyForm);
    setProveedorSearch("");
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
        subcategoriaId: null,
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
    if (
      !Number.isFinite(stockMinimoNumber) ||
      stockMinimoNumber < 0
    ) {
      alert("Stock mínimo debe ser un número mayor o igual a 0.");
      return;
    }

    const subcategoriaId =
      form.subcategoriaId && form.subcategoriaId !== ""
        ? Number(form.subcategoriaId)
        : null;

    const catOption = CATEGORY_OPTIONS.find(
      (c) => c.code === form.categoriaCodigo
    );
    const categoriaLabel = catOption?.label ?? null;

    setSaving(true);
    try {
      const payload: any = {
        sku: form.sku.trim(),
        nombre: form.nombre.trim(),
        categoria: categoriaLabel,
        categoriaCodigo: form.categoriaCodigo || null,
        subcategoriaId,
        stock: stockNumber,
        stockMinimo: stockMinimoNumber,
        ubicacion: form.ubicacion.trim() || null,
        codigoBarras: form.codigoBarras.trim() || null,
        proveedorId: form.proveedorId
          ? Number(form.proveedorId)
          : null,
        imagenUrl: form.imagenUrl.trim() || null,
      };

      if (editingProduct) {
        await http.put(`/productos/${editingProduct.id}`, payload);
      } else {
        await http.post("/productos", payload);
      }

      await queryClient.invalidateQueries({
        queryKey: ["productos"],
      });
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
  // Eliminar producto
  // -------------------------
  async function handleDeleteProduct(prod: Producto) {
    const ok = window.confirm(
      `¿Seguro que quieres eliminar el producto "${prod.nombre}"?\n` +
        "Los movimientos históricos se mantienen, pero no podrás usarlo en nuevos ingresos."
    );
    if (!ok) return;

    setDeletingId(prod.id);
    try {
      await http.delete(`/productos/${prod.id}`);
      await queryClient.invalidateQueries({ queryKey: ["productos"] });
    } catch (err: any) {
      console.error("Error eliminando producto:", err);

      const msg =
        err?.response?.data?.message ??
        "No se pudo eliminar el producto. Puede que tenga ingresos o movimientos asociados.";

      alert(msg);
    } finally {
      setDeletingId(null);
    }
  }

  // -------------------------
  // Subcategorías: helpers y CRUD
  // -------------------------

  useEffect(() => {
    if (!isSubcatOpen) return;
    if (!categorias || categorias.length === 0) return;
    if (subcatCategoriaId === "") {
      setSubcatCategoriaId(categorias[0].id);
    }
  }, [isSubcatOpen, categorias, subcatCategoriaId]);

  function resetSubcatForm() {
    setSubcatNombre("");
    setSubcatError(null);
    setSubcatCategoriaId("");
    setEditingSubcat(null);
  }

  function startEditSubcat(sc: Subcategoria) {
    setEditingSubcat(sc);
    setSubcatNombre(sc.nombre);
    setSubcatCategoriaId(sc.categoriaId);
    setSubcatError(null);
  }

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
    if (
      !Number.isInteger(categoriaIdNumber) ||
      categoriaIdNumber <= 0
    ) {
      setSubcatError("categoriaId no es válido.");
      return;
    }

    setSavingSubcat(true);
    setSubcatError(null);
    try {
      if (editingSubcat) {
        // MODO EDICIÓN
        await http.put(`/subcategorias/${editingSubcat.id}`, {
          nombre,
          categoriaId: categoriaIdNumber,
        });
      } else {
        await http.post("/subcategorias", {
          nombre,
          categoriaId: categoriaIdNumber,
        });
      }

      resetSubcatForm();

      await queryClient.invalidateQueries({
        queryKey: ["subcategorias"],
      });
    } catch (err: any) {
      console.error("Error creando/actualizando subcategoría:", err);
      setSubcatError(
        err?.response?.data?.error ??
          "Error creando/actualizando la subcategoría. Revisa la consola."
      );
    } finally {
      setSavingSubcat(false);
    }
  }

  async function handleDeleteSubcategoria(sc: Subcategoria) {
    const ok = window.confirm(
      `¿Seguro que quieres eliminar la subcategoría "${sc.nombre}"?`
    );
    if (!ok) return;

    try {
      await http.delete(`/subcategorias/${sc.id}`);

      if (editingSubcat?.id === sc.id) {
        resetSubcatForm();
      }

      await queryClient.invalidateQueries({
        queryKey: ["subcategorias"],
      });
    } catch (err: any) {
      console.error("Error eliminando subcategoría:", err);
      alert(
        err?.response?.data?.error ??
          "Error eliminando la subcategoría. Revisa la consola."
      );
    }
  }

  // -------------------------
  // Render
  // -------------------------
  if (errorProductos) {
    return (
      <div className="text-sm text-red-600">
        Error cargando productos:{" "}
        {String((errorProductos as any).message)}
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
              Mantén el catálogo al día, con proveedor, PPP (precio
              promedio ponderado) y valor total de stock.
            </p>
          </div>
          <div className="flex w-full flex-wrap justify-start gap-2 sm:w-auto sm:justify-end">
            <button
              type="button"
              onClick={() => openCsv("/reportes/ppp.csv")}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <span>📥</span>
              <span>PPP actual (CSV)</span>
            </button>
            <button
              type="button"
              onClick={() =>
                openCsv("/reportes/ppp_historico.csv")
              }
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <span>📊</span>
              <span>PPP histórico (CSV)</span>
            </button>
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
              placeholder="Buscar por SKU, nombre, proveedor, categoría o código de barras..."
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
                  Costo prom. (PPP)
                </th>
                <th className="hidden px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 sm:table-cell">
                  Total aprox.
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
                    colSpan={8}
                    className="px-4 py-6 text-center text-sm text-slate-500"
                  >
                    Cargando productos...
                  </td>
                </tr>
              ) : !filteredProducts || filteredProducts.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-6 text-center text-sm text-slate-500"
                  >
                    No hay productos que coincidan con el filtro.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const proveedorNombre = p.proveedorId
                    ? proveedoresMap[p.proveedorId] ??
                      `ID ${p.proveedorId}`
                    : "Sin proveedor";

                  const categoriaLabel =
                    getCategoriaLabelFromProducto(p);
                  const subcatObj = p.subcategoriaId
                    ? subcategoriasMap[p.subcategoriaId]
                    : undefined;
                  const subcatName =
                    p.subcategoriaNombre ?? subcatObj?.nombre ?? "";

                  const ppp = normalizePPP(p.ppp ?? null);
                  const hasPPP =
                    typeof ppp === "number" &&
                    Number.isFinite(ppp) &&
                    ppp >= 0;
                  const totalAprox =
                    hasPPP && typeof p.stock === "number"
                      ? p.stock * ppp
                      : null;

                  const stockMinimoNum =
                    typeof p.stockMinimo === "number"
                      ? p.stockMinimo
                      : 0;
                  const isStockCritical =
                    stockMinimoNum > 0 && p.stock <= stockMinimoNum;

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/60"
                    >
                      <td className="whitespace-nowrap py-3 pl-4 pr-3 text-sm text-slate-900 sm:pl-6">
                        <div className="flex items-center gap-3">
                          <img
                            src={p.imagenUrl || PLACEHOLDER_IMG}
                            alt={p.nombre}
                            className="h-10 w-10 flex-shrink-0 rounded-lg border border-slate-200 object-cover"
                            onError={(e) => {
                              (
                                e.currentTarget as HTMLImageElement
                              ).src = PLACEHOLDER_IMG;
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
                        <div className="text-sm font-medium text-slate-700">
                          {categoriaLabel}
                        </div>
                        {subcatName && (
                          <div className="text-xs text-slate-500">
                            {subcatName}
                          </div>
                        )}
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-3 text-sm text-slate-600 sm:table-cell">
                        {proveedorNombre}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm">
                        <span
                          className={
                            isStockCritical
                              ? "font-semibold text-red-600"
                              : "text-slate-900"
                          }
                        >
                          {p.stock}
                        </span>
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-3 text-right text-sm text-slate-900 sm:table-cell">
                        {hasPPP && ppp !== null
                          ? `$${money(ppp)}`
                          : "—"}
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-3 text-right text-sm text-slate-900 sm:table-cell">
                        {totalAprox != null
                          ? `$${money(totalAprox)}`
                          : "—"}
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-3 text-right text-sm text-slate-600 sm:table-cell">
                        {p.stockMinimo ?? 0}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleDeleteProduct(p)
                            }
                            disabled={deletingId === p.id}
                            className="rounded-full border border-red-100 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                          >
                            {deletingId === p.id
                              ? "Eliminando..."
                              : "Eliminar"}
                          </button>
                        </div>
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
                      {/* Categoría + Subcategoría */}
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
                              <option
                                key={c.code}
                                value={c.code}
                              >
                                {c.code} — {c.label}
                              </option>
                            ))}
                          </select>
                          <p className="mt-1 text-[11px] text-slate-500">
                            El prefijo del SKU se toma de la
                            categoría (EXT / DET / ACF / FUN).
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700">
                            Subcategoría (opcional)
                          </label>
                          <select
                            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                            value={form.subcategoriaId ?? ""}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                subcategoriaId: e.target.value
                                  ? Number(e.target.value)
                                  : null,
                              }))
                            }
                            disabled={
                              !currentCategoria ||
                              loadingSubcategorias ||
                              !!errorSubcategorias
                            }
                          >
                            <option value="">
                              {currentCategoria
                                ? "Sin subcategoría específica"
                                : "Primero selecciona una categoría"}
                            </option>
                            {currentSubcategorias.map((sc) => (
                              <option
                                key={sc.id}
                                value={sc.id}
                              >
                                {sc.nombre}
                              </option>
                            ))}
                          </select>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {!currentCategoria
                              ? "Primero selecciona una categoría."
                              : loadingSubcategorias
                              ? "Cargando subcategorías..."
                              : currentSubcategorias.length === 0
                              ? "Esta categoría aún no tiene subcategorías. Puedes agregarlas en “Gestionar subcategorías”."
                              : "Opcional: ayuda a ordenar mejor el catálogo."}
                          </p>
                        </div>
                      </div>

                      {/* SKU + Nombre */}
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                      </div>

                      {/* Proveedor (buscador) */}
                      <div>
                        <label className="block text-xs font-medium text-slate-700">
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
                                setProveedorSearch(e.target.value)
                              }
                              disabled={loadingProveedores}
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                            />
                            {hayProveedoresSugeridos && (
                              <div className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                                {proveedoresFiltrados.map((prov) => (
                                  <button
                                    key={prov.id}
                                    type="button"
                                    onClick={() => {
                                      setForm((prev) => ({
                                        ...prev,
                                        proveedorId: prov.id,
                                      }));
                                      setProveedorSearch("");
                                    }}
                                    className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50"
                                  >
                                    <span className="font-medium text-slate-900">
                                      {prov.nombre}
                                    </span>
                                    {prov.rut && (
                                      <span className="text-[11px] text-slate-500">
                                        RUT: {prov.rut}
                                      </span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {errorProveedores && (
                            <p className="mt-1 text-xs text-red-600">
                              Error cargando proveedores.
                            </p>
                          )}

                          {form.proveedorId && (
                            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Proveedor seleccionado
                              </div>
                              <div className="mt-1 font-medium">
                                {proveedoresMap[
                                  form.proveedorId as number
                                ] ??
                                  `Proveedor #${form.proveedorId}`}
                              </div>
                            </div>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Si el proveedor no aparece, primero créalo
                          en la sección{" "}
                          <span className="font-semibold">
                            “Proveedores”
                          </span>
                          .
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
                          Más adelante se puede cambiar a subida de
                          archivo; por ahora basta con una URL simple.
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
                      Las subcategorías detallan cada una de las
                      categorías principales (EXT, DET, ACF, FUN). Se
                      almacenan normalizadas en la base de datos y se
                      pueden reutilizar en productos.
                    </p>
                    {editingSubcat && (
                      <p className="mt-1 text-[11px] text-rose-600">
                        Editando subcategoría:{" "}
                        <strong>{editingSubcat.nombre}</strong>.
                        Usa <strong>“Guardar cambios”</strong> para
                        actualizar o{" "}
                        <strong>“Cancelar edición”</strong> para
                        volver al modo creación.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSubcatOpen(false);
                      resetSubcatForm();
                    }}
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
                        value={
                          subcatCategoriaId === ""
                            ? ""
                            : subcatCategoriaId
                        }
                        onChange={(e) =>
                          setSubcatCategoriaId(
                            e.target.value
                              ? Number(e.target.value)
                              : ""
                          )
                        }
                        disabled={
                          loadingCategorias || !!errorCategorias
                        }
                      >
                        <option value="">
                          {loadingCategorias
                            ? "Cargando categorías..."
                            : errorCategorias
                            ? "Error cargando categorías"
                            : "Selecciona una categoría..."}
                        </option>
                        {(categorias ?? []).map((cat) => (
                          <option
                            key={cat.id}
                            value={cat.id}
                          >
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
                        onChange={(e) =>
                          setSubcatNombre(e.target.value)
                        }
                        placeholder="Ej: Extintores PQS 6kg"
                      />
                    </div>
                  </div>
                  {subcatError && (
                    <p className="text-xs text-red-600">
                      {subcatError}
                    </p>
                  )}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={resetSubcatForm}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {editingSubcat
                        ? "Cancelar edición"
                        : "Limpiar"}
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
                        : editingSubcat
                        ? "Guardar cambios"
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
                  ) : !subcategorias ||
                    subcategorias.length === 0 ? (
                    <p className="text-slate-500">
                      Aún no hay subcategorías configuradas.
                    </p>
                  ) : (
                    Object.entries(
                      subcategoriasByCategoriaId
                    ).map(([catIdStr, list]) => {
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
                                className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px]"
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    startEditSubcat(sc)
                                  }
                                  className="text-slate-700 hover:underline"
                                  title="Editar subcategoría"
                                >
                                  {sc.nombre}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDeleteSubcategoria(
                                      sc
                                    )
                                  }
                                  className="text-red-500 hover:text-red-600"
                                  title="Eliminar subcategoría"
                                >
                                  ✕
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })
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
