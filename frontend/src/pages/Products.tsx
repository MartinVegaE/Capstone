// src/pages/Products.tsx
import { useState } from "react";
import type { FormEvent } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { httpGet, httpPost } from "../lib/http";

// Tipo que viene del backend
export interface Producto {
  id: number;
  sku: string;
  nombre: string;
  marca?: string | null;
  categoria?: string | null;
  ubicacion?: string | null;
  codigoBarras?: string | null;
  stock: number;
}

// Payload que enviamos al backend al crear
interface CreateProductoBody {
  sku: string;
  nombre: string;
  marca?: string | null;
  categoria?: string | null;
  ubicacion?: string | null;
  codigoBarras?: string | null;
  stock: number;
}

// Para el formulario (todo como string)
interface CreateProductoFormState {
  sku: string;
  nombre: string;
  marca: string;
  categoria: string;
  ubicacion: string;
  codigoBarras: string;
  stock: string;
}

async function fetchProductos(): Promise<Producto[]> {
  return httpGet<Producto[]>("/productos");
}

export default function ProductsPage() {
  const queryClient = useQueryClient();

  const {
    data: productos,
    isLoading,
    error,
  } = useQuery<Producto[]>({
    queryKey: ["productos"],
    queryFn: fetchProductos,
  });

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<CreateProductoFormState>({
    sku: "",
    nombre: "",
    marca: "",
    categoria: "",
    ubicacion: "",
    codigoBarras: "",
    stock: "",
  });
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation<
    Producto,
    unknown,
    CreateProductoBody
  >({
    mutationFn: (body) =>
      httpPost<Producto, CreateProductoBody>("/productos", body),
    onSuccess: () => {
      setForm({
        sku: "",
        nombre: "",
        marca: "",
        categoria: "",
        ubicacion: "",
        codigoBarras: "",
        stock: "",
      });
      setFormError(null);
      setIsFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["productos"] });
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        "No se pudo crear el producto.";
      setFormError(msg);
    },
  });

  function handleChange(
    field: keyof CreateProductoFormState,
    value: string
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const sku = form.sku.trim();
    const nombre = form.nombre.trim();

    if (!sku || !nombre) {
      setFormError("SKU y nombre son obligatorios.");
      return;
    }

    const stockNumber =
      form.stock.trim() === "" ? 0 : Number(form.stock.trim());

    if (!Number.isFinite(stockNumber) || stockNumber < 0) {
      setFormError(
        "El stock debe ser un número mayor o igual a 0."
      );
      return;
    }

    const body: CreateProductoBody = {
      sku,
      nombre,
      marca: form.marca.trim() || null,
      categoria: form.categoria.trim() || null,
      ubicacion: form.ubicacion.trim() || null,
      codigoBarras: form.codigoBarras.trim() || null,
      stock: stockNumber,
    };

    createMutation.mutate(body);
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      {/* Header de la página */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Productos
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Listado de productos registrados en el inventario.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsFormOpen((open) => !open)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {isFormOpen ? "Cerrar formulario" : "+ Nuevo producto"}
        </button>
      </div>

      {/* Formulario de creación */}
      {isFormOpen && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">
            Nuevo producto
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Ingresa los datos básicos del producto. Más adelante
            podrás editar detalles si es necesario.
          </p>

          {formError && (
            <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}

          <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Nombre *
                </label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) =>
                    handleChange("nombre", e.target.value)
                  }
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="Ej: Extintor PQS 6kg"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  SKU / Código interno *
                </label>
                <input
                  type="text"
                  value={form.sku}
                  onChange={(e) =>
                    handleChange("sku", e.target.value)
                  }
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="Ej: 001"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Marca
                </label>
                <input
                  type="text"
                  value={form.marca}
                  onChange={(e) =>
                    handleChange("marca", e.target.value)
                  }
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="Ej: Mepi, Dräger..."
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Categoría
                </label>
                <input
                  type="text"
                  value={form.categoria}
                  onChange={(e) =>
                    handleChange("categoria", e.target.value)
                  }
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="Ej: Extintores, EPP..."
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Ubicación (bodega / estantería)
                </label>
                <input
                  type="text"
                  value={form.ubicacion}
                  onChange={(e) =>
                    handleChange("ubicacion", e.target.value)
                  }
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="Ej: Bodega 1, rack A-3"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Código de barras
                </label>
                <input
                  type="text"
                  value={form.codigoBarras}
                  onChange={(e) =>
                    handleChange("codigoBarras", e.target.value)
                  }
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="Opcional"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Stock inicial
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.stock}
                  onChange={(e) =>
                    handleChange("stock", e.target.value)
                  }
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="0"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Si lo dejas vacío, se creará con stock 0 y luego
                  podrás hacer un ingreso.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsFormOpen(false);
                  setFormError(null);
                }}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {createMutation.isPending
                  ? "Creando..."
                  : "Crear producto"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabla de productos */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        {isLoading ? (
          <div className="p-4 text-sm text-slate-600">
            Cargando productos...
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-red-600">
            Ocurrió un error al cargar los productos.
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-slate-700">
                  ID
                </th>
                <th className="px-4 py-2 text-left font-medium text-slate-700">
                  Nombre
                </th>
                <th className="px-4 py-2 text-left font-medium text-slate-700">
                  SKU
                </th>
                <th className="px-4 py-2 text-left font-medium text-slate-700">
                  Stock
                </th>
              </tr>
            </thead>
            <tbody>
              {productos && productos.length > 0 ? (
                productos.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 text-slate-800">{p.id}</td>
                    <td className="px-4 py-2 text-slate-800">
                      {p.nombre || "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-800">
                      {p.sku || "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-800">
                      {p.stock ?? 0}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    className="px-4 py-4 text-center text-slate-500"
                    colSpan={4}
                  >
                    No hay productos registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
