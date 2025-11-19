import React, { useMemo, useState } from "react";
import ControlPanel, { type ViewMode } from "../components/layout/ControlPanel";
import KanbanBoard from "../components/views/KanbanBoard";
import Button from "../components/ui/Button";
import { toCsv, downloadCsv } from "../lib/csv";

// Ajusta estos imports a tu API real si difieren:
import {
  useProducts,
  useUpdateProduct,
  useCreateProduct,
  type Product,
} from "../api/products";

// Si tu API ya exporta SortDir, bórralo y usa el de tu API.
type SortDir = "asc" | "desc";

function fmtInt(n: number | undefined | null) {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? v.toLocaleString() : "-";
}

function Drawer({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h3 className="text-lg font-semibold">{title ?? "Producto"}</h3>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </aside>
    </div>
  );
}

export default function ProductsPage() {
  // UI state
  const [q, setQ] = useState("");
  const [view, setView] = useState<ViewMode>("list");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [brand, setBrand] = useState<string>("");
  const [category, setCategory] = useState<string>("");

  const [sortBy, setSortBy] = useState<
    "sku" | "nombre" | "marca" | "categoria" | "stock"
  >("nombre");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Data
  const { data, isLoading, isError, refetch } = useProducts({
    q,
    page,
    pageSize,
    ...(brand ? { brand } : {}),
    ...(category ? { category } : {}),
    ...(sortBy ? { sortBy } : {}),
    ...(sortDir ? { sortDir } : {}),
  } as any);

  const total = data?.total ?? 0;
  const rows: Product[] = data?.data ?? [];
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize]
  );

  // 🔧 Fix de tipos: garantizamos que solo haya strings
  const brands = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .map((p) => p.marca)
            .filter(
              (b): b is string => typeof b === "string" && b.trim() !== ""
            )
        )
      ).sort(),
    [rows]
  );

  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .map((p) => p.categoria)
            .filter(
              (c): c is string => typeof c === "string" && c.trim() !== ""
            )
        )
      ).sort(),
    [rows]
  );

  // Edit / Create drawer
  const [editing, setEditing] = useState<Product | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const updateMut = useUpdateProduct(editing?.id ?? 0);
  const createMut = useCreateProduct();

  const openEdit = (p: Product) => {
    setEditing(p);
    setIsCreating(false);
  };

  const openCreate = () => {
    setEditing(null);
    setIsCreating(true);
  };

  const closeDrawer = () => {
    setEditing(null);
    setIsCreating(false);
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const dto = {
      sku: String(fd.get("sku") || (editing?.sku ?? "")),
      nombre: String(
        fd.get("nombre") || editing?.nombre || (editing as any)?.name || ""
      ),
      marca: String(fd.get("marca") || editing?.marca || ""),
      categoria: String(fd.get("categoria") || editing?.categoria || ""),
      stock: Number(fd.get("stock") || editing?.stock || 0),
    } as Partial<Product>;

    if (!dto.sku || !dto.nombre) {
      alert("SKU y Nombre son obligatorios");
      return;
    }

    if (isCreating) {
      createMut.mutate(dto, {
        onSuccess: () => {
          closeDrawer();
          refetch();
        },
        onError: () => alert("No se pudo crear el producto"),
      });
    } else if (editing) {
      updateMut.mutate(dto, {
        onSuccess: () => {
          closeDrawer();
          refetch();
        },
        onError: () => alert("No se pudo guardar"),
      });
    }
  };

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir(col === "nombre" ? "asc" : "desc");
    }
    setPage(1);
  }

  function exportCsv() {
    const csv = toCsv(
      rows.map((p) => ({
        id: (p as any).id ?? "",
        sku: p.sku,
        nombre: (p as any).nombre ?? (p as any).name ?? "",
        marca: (p as any).marca ?? "",
        categoria: (p as any).categoria ?? "",
        stock: p.stock ?? 0,
      })),
      ["id", "sku", "nombre", "marca", "categoria", "stock"]
    );
    downloadCsv("productos.csv", csv);
  }

  const columnsKanban = ["Bajo stock", "OK", "Sobre stock"];
  const columnOf = (p: Product) => {
    const s = Number(p.stock ?? 0);
    if (s <= 10) return "Bajo stock";
    if (s >= 200) return "Sobre stock";
    return "OK";
  };
  const renderCard = (p: Product) => (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-800">
          {(p as any).nombre ?? (p as any).name ?? "-"}
        </div>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono">
          {p.sku}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        {(p as any).marca && (
          <span className="rounded bg-slate-100 px-2 py-0.5">
            {(p as any).marca}
          </span>
        )}
        {(p as any).categoria && (
          <span className="rounded bg-slate-100 px-2 py-0.5">
            {(p as any).categoria}
          </span>
        )}
        <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700">
          Stock: {fmtInt(p.stock)}
        </span>
      </div>
    </div>
  );

  return (
    <section className="w-full px-6 pb-6">
      <h2 className="sr-only">Productos</h2>

      <ControlPanel
        search={q}
        onSearch={(v) => {
          setQ(v);
          setPage(1);
        }}
        view={view}
        onChangeView={setView}
        onOpenFilters={() => {}}
        onOpenGroupBy={() => {}}
        onToggleFavorite={() => {}}
      />

      {/* Filtros */}
      <div className="w-full px-6 pt-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select
            value={brand}
            onChange={(e) => {
              setBrand(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
          >
            <option value="">Marca (todas)</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
          >
            <option value="">Categoría (todas)</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <div className="ml-auto flex items-center gap-2">
            {/* 👇 Nuevo botón de crear */}
            <Button variant="primary" onClick={openCreate}>
              Nuevo producto
            </Button>

            <Button variant="secondary" onClick={exportCsv}>
              Exportar CSV
            </Button>
            {(brand || category) && (
              <Button
                variant="secondary"
                onClick={() => {
                  setBrand("");
                  setCategory("");
                  setPage(1);
                }}
              >
                Limpiar filtros
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Contenido */}
      {view === "kanban" ? (
        <>
          {isLoading && (
            <div className="w-full px-6 py-6">
              <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
            </div>
          )}
          {isError && (
            <div className="w-full px-6 py-6 text-red-700">
              Error al cargar productos.{" "}
              <Button size="sm" onClick={() => refetch()}>
                Reintentar
              </Button>
            </div>
          )}
          {!isLoading && !isError && (
            <KanbanBoard<Product>
              columns={columnsKanban}
              items={rows}
              columnOf={columnOf}
              renderCard={renderCard}
              onOpen={(p) => openEdit(p)}
              emptyText="Sin productos en esta columna"
            />
          )}
        </>
      ) : (
        <>
          <div className="mx-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="max-h-[68vh] overflow-auto">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
                  <tr>
                    <Th
                      onClick={() => toggleSort("sku")}
                      active={sortBy === "sku"}
                      dir={sortDir}
                    >
                      SKU
                    </Th>
                    <Th
                      onClick={() => toggleSort("nombre")}
                      active={sortBy === "nombre"}
                      dir={sortDir}
                    >
                      Nombre
                    </Th>
                    <Th
                      onClick={() => toggleSort("marca")}
                      active={sortBy === "marca"}
                      dir={sortDir}
                    >
                      Marca
                    </Th>
                    <Th
                      onClick={() => toggleSort("categoria")}
                      active={sortBy === "categoria"}
                      dir={sortDir}
                    >
                      Categoría
                    </Th>
                    <Th
                      onClick={() => toggleSort("stock")}
                      active={sortBy === "stock"}
                      dir={sortDir}
                    >
                      Stock
                    </Th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6">
                        <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
                      </td>
                    </tr>
                  )}

                  {isError && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-red-700">
                        Error al cargar productos.{" "}
                        <Button size="sm" onClick={() => refetch()}>
                          Reintentar
                        </Button>
                      </td>
                    </tr>
                  )}

                  {!isLoading && !isError && rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-10 text-center text-slate-500"
                      >
                        No hay productos.
                      </td>
                    </tr>
                  )}

                  {!isLoading &&
                    !isError &&
                    rows.map((p, i) => (
                      <tr
                        key={(p as any).id ?? p.sku}
                        className={`border-t ${
                          i % 2 ? "bg-slate-50/40" : "bg-white"
                        } hover:bg-indigo-50/40`}
                      >
                        <td className="px-4 py-2.5 font-mono">{p.sku}</td>
                        <td className="px-4 py-2.5">
                          {(p as any).nombre ?? (p as any).name ?? "-"}
                        </td>
                        <td className="px-4 py-2.5">
                          {(p as any).marca ?? ""}
                        </td>
                        <td className="px-4 py-2.5">
                          {(p as any).categoria ?? ""}
                        </td>
                        <td className="px-4 py-2.5">{fmtInt(p.stock)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <Button size="sm" onClick={() => openEdit(p)}>
                            Editar
                          </Button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {!isLoading && !isError && totalPages > 1 && (
            <div className="mx-6 mt-3 flex items-center justify-between text-sm text-slate-600">
              <span>
                Página {page} de {totalPages} · {total} resultados
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ← Anterior
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Siguiente →
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Drawer editar / crear */}
      <Drawer
        open={editing !== null || isCreating}
        onClose={closeDrawer}
        title={
          isCreating
            ? "Nuevo producto"
            : editing
            ? `Editar ${editing.sku}`
            : "Producto"
        }
      >
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-slate-600">
                SKU
              </label>
              <input
                name="sku"
                defaultValue={editing?.sku ?? ""}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">
                Nombre
              </label>
              <input
                name="nombre"
                defaultValue={
                  editing
                    ? (editing as any).nombre ??
                      (editing as any).name ??
                      ""
                    : ""
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">
                Marca
              </label>
              <input
                name="marca"
                defaultValue={(editing as any)?.marca ?? ""}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">
                Categoría
              </label>
              <input
                name="categoria"
                defaultValue={(editing as any)?.categoria ?? ""}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">
                Stock
              </label>
              <input
                name="stock"
                type="number"
                min={0}
                defaultValue={Number(editing?.stock ?? 0)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={closeDrawer}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="primary">
              {isCreating ? "Crear producto" : "Guardar cambios"}
            </Button>
          </div>
        </form>
      </Drawer>
    </section>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  dir?: "asc" | "desc";
}) {
  return (
    <th
      className="cursor-pointer select-none px-4 py-2.5 text-left"
      onClick={onClick}
      title="Ordenar"
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active && <span>{dir === "desc" ? "▼" : "▲"}</span>}
      </span>
    </th>
  );
}
