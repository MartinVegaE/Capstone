import React, { useMemo, useState } from "react";
import {
  useIngresos,
  useCreateIngreso,
  useUpdateIngreso,
  type Ingreso,
  type IngresoItem,
  type IngresoEstado,
} from "../api/ingresos";
import ControlPanel, { type ViewMode } from "../components/layout/ControlPanel";
import KanbanBoard from "../components/views/KanbanBoard";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";

function fmt(dt: string) {
  try { return new Date(dt).toLocaleString(); } catch { return dt; }
}
function estadoTone(e: IngresoEstado) {
  if (e === "Confirmado") return "success" as const;
  if (e === "Anulado") return "danger" as const;
  return "warning" as const; // Borrador
}

/** Drawer simple */
function Drawer({ open, onClose, children, title }: {
  open: boolean; onClose: () => void; children: React.ReactNode; title?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h3 className="text-lg font-semibold">{title ?? "Ingreso"}</h3>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-slate-100">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </aside>
    </div>
  );
}

export default function IngresosPage() {
  const [q, setQ] = useState("");
  const [view, setView] = useState<ViewMode>("list");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [proveedor, setProveedor] = useState("");
  const [estado, setEstado] = useState<IngresoEstado | "">("");

  const { data, isLoading, isError, refetch } = useIngresos({
    q, proveedor: proveedor || undefined, estado: estado || "", page, pageSize,
  });
  const total = data?.total ?? 0;
  const rows = data?.data ?? [];
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const proveedoresOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.proveedor).filter(Boolean))).sort(), [rows]
  );

  const [editing, setEditing] = useState<Ingreso | null>(null);
  const [isNew, setIsNew] = useState(false);
  const createMut = useCreateIngreso();
  const updateMut = useUpdateIngreso(editing?.id ?? 0);

  const openCreate = () => { setIsNew(true); setEditing(null); };
  const openEdit = (ing: Ingreso) => { setIsNew(false); setEditing(ing); };
  const closeDrawer = () => { setIsNew(false); setEditing(null); };

  const [items, setItems] = useState<IngresoItem[]>([]);
  React.useEffect(() => {
    if (isNew) setItems([{ sku: "", cantidad: 1, costo: 0 }]);
    else if (editing) setItems(editing.items ?? []);
    else setItems([]);
  }, [isNew, editing]);

  const addItem = () => setItems((prev) => [...prev, { sku: "", cantidad: 1, costo: 0 }]);
  const rmItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const patchItem = (idx: number, patch: Partial<IngresoItem>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const totalItems = useMemo(
    () => items.reduce((acc, it) => acc + (Number(it.costo ?? 0) * Number(it.cantidad ?? 0)), 0),
    [items]
  );

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const dto = {
      proveedor: String(fd.get("proveedor") || ""),
      documento: String(fd.get("documento") || ""),
      fecha: String(fd.get("fecha") || new Date().toISOString()),
      estado: String(fd.get("estado") || "Borrador") as IngresoEstado,
      items: items.filter((it) => it.sku && Number(it.cantidad) > 0).map((it) => ({
        sku: String(it.sku), cantidad: Number(it.cantidad), costo: it.costo != null ? Number(it.costo) : undefined,
      })),
    } as Partial<Ingreso>;

    if (!dto.proveedor) return alert("Proveedor es obligatorio");
    if (!dto.items || dto.items.length === 0) return alert("Agrega al menos un ítem");

    if (isNew) {
      createMut.mutate(dto, { onSuccess: () => { closeDrawer(); refetch(); }, onError: () => alert("No se pudo crear") });
    } else {
      if (!editing) return;
      updateMut.mutate(dto, { onSuccess: () => { closeDrawer(); refetch(); }, onError: () => alert("No se pudo guardar") });
    }
  };

  const columns = useMemo<IngresoEstado[]>(() => ["Borrador", "Confirmado", "Anulado"], []);
  const columnOf = (ing: Ingreso) => ing.estado;
  const renderCard = (ing: Ingreso) => (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-800">{ing.proveedor}</div>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{fmt(ing.fecha)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        {ing.documento && <span className="rounded bg-slate-100 px-2 py-0.5">Doc: {ing.documento}</span>}
        <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700">Ítems: {ing.items?.length ?? 0}</span>
        <Badge tone={estadoTone(ing.estado)}> {ing.estado} </Badge>
      </div>
    </div>
  );

  return (
    <section className="w-full px-6 pb-6">
      <h2 className="sr-only">Ingresos</h2>

      <ControlPanel search={q} onSearch={(v) => { setQ(v); setPage(1); }} view={view} onChangeView={setView} />

      {/* Filtros */}
      <div className="w-full px-6 pt-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select
            value={proveedor}
            onChange={(e) => { setProveedor(e.target.value); setPage(1); }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
            aria-label="Filtrar por proveedor"
          >
            <option value="">Proveedor (todos)</option>
            {proveedoresOptions.map((p) => (<option key={p} value={p}>{p}</option>))}
          </select>

          <select
            value={estado}
            onChange={(e) => { setEstado(e.target.value as IngresoEstado | ""); setPage(1); }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
            aria-label="Filtrar por estado"
          >
            <option value="">Estado (todos)</option>
            <option value="Borrador">Borrador</option>
            <option value="Confirmado">Confirmado</option>
            <option value="Anulado">Anulado</option>
          </select>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="primary" onClick={openCreate}>Nuevo ingreso</Button>
            {(proveedor || estado) && (
              <Button variant="secondary" onClick={() => { setProveedor(""); setEstado(""); setPage(1); }}>
                Limpiar filtros
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Contenido */}
      {view === "kanban" ? (
        <>
          {isLoading && <div className="w-full px-6 py-6"><div className="animate-pulse h-4 w-1/2 rounded bg-slate-200" /></div>}
          {isError && (
            <div className="w-full px-6 py-6 text-red-700">
              Error al cargar ingresos. <Button size="sm" onClick={() => refetch()}>Reintentar</Button>
            </div>
          )}
          {!isLoading && !isError && (
            <KanbanBoard<Ingreso>
              columns={columns}
              items={rows}
              columnOf={columnOf}
              renderCard={renderCard}
              onOpen={(ing) => openEdit(ing)}
              emptyText="Sin ingresos en esta columna"
            />
          )}
        </>
      ) : (
        <>
          <div className="mx-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3 text-left">Proveedor</th>
                  <th className="px-4 py-3 text-left">Documento</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-left">Ítems</th>
                  <th className="px-4 py-3 text-left">Total aprox.</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={7} className="px-4 py-6"><div className="animate-pulse h-4 w-1/2 rounded bg-slate-200" /></td></tr>
                )}
                {isError && (
                  <tr><td colSpan={7} className="px-4 py-6 text-red-700">
                    Error al cargar ingresos. <Button size="sm" onClick={() => refetch()}>Reintentar</Button>
                  </td></tr>
                )}
                {!isLoading && !isError && rows.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No hay ingresos para mostrar.</td></tr>
                )}
                {!isLoading && !isError && rows.map((ing) => {
                  const subtotal = (ing.items ?? []).reduce((acc, it) => acc + (Number(it.costo ?? 0) * Number(it.cantidad ?? 0)), 0);
                  return (
                    <tr key={ing.id} className="border-t hover:bg-slate-50/60">
                      <td className="px-4 py-3">{fmt(ing.fecha)}</td>
                      <td className="px-4 py-3">{ing.proveedor}</td>
                      <td className="px-4 py-3">{ing.documento ?? ""}</td>
                      <td className="px-4 py-3"><Badge tone={estadoTone(ing.estado)}>{ing.estado}</Badge></td>
                      <td className="px-4 py-3">{ing.items?.length ?? 0}</td>
                      <td className="px-4 py-3">${subtotal.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" onClick={() => openEdit(ing)}>Editar</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!isLoading && !isError && totalPages > 1 && (
            <div className="mx-6 mt-3 flex items-center justify-between text-sm text-slate-600">
              <span> Página {page} de {totalPages} · {total} resultados </span>
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

      {/* Drawer crear/editar ingreso */}
      <Drawer
        open={isNew || editing !== null}
        onClose={closeDrawer}
        title={isNew ? "Nuevo ingreso" : editing ? `Editar ingreso (#${editing.id})` : "Ingreso"}
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-slate-600">Proveedor</label>
              <input name="proveedor" defaultValue={editing?.proveedor ?? ""} required
                     className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">Documento</label>
              <input name="documento" defaultValue={editing?.documento ?? ""}
                     className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">Fecha</label>
              <input name="fecha" type="datetime-local"
                     defaultValue={editing ? new Date(editing.fecha).toISOString().slice(0,16) : new Date().toISOString().slice(0,16)}
                     className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">Estado</label>
              <select name="estado" defaultValue={editing?.estado ?? "Borrador"}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
                <option value="Borrador">Borrador</option>
                <option value="Confirmado">Confirmado</option>
                <option value="Anulado">Anulado</option>
              </select>
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-slate-700">Ítems</div>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-6 gap-2">
                  <input
                    placeholder="SKU"
                    value={it.sku}
                    onChange={(e) => patchItem(idx, { sku: e.target.value })}
                    className="col-span-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm font-mono"
                  />
                  <input
                    placeholder="Cantidad"
                    type="number" min={1}
                    value={Number(it.cantidad ?? 1)}
                    onChange={(e) => patchItem(idx, { cantidad: Number(e.target.value) })}
                    className="col-span-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
                  />
                  <input
                    placeholder="Costo (opcional)"
                    type="number" min={0}
                    value={Number(it.costo ?? 0)}
                    onChange={(e) => patchItem(idx, { costo: Number(e.target.value) })}
                    className="col-span-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
                  />
                  <Button type="button" size="sm" variant="secondary" className="col-span-1"
                          onClick={() => rmItem(idx)}>Quitar</Button>
                </div>
              ))}
              <div>
                <Button type="button" variant="secondary" onClick={addItem}>+ Agregar ítem</Button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm text-slate-700">
            <span>Total aprox. (costo x cantidad)</span>
            <strong>${totalItems.toLocaleString()}</strong>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeDrawer}>Cancelar</Button>
            <Button type="submit" variant="primary">{isNew ? "Crear ingreso" : "Guardar cambios"}</Button>
          </div>
        </form>
      </Drawer>
    </section>
  );
}
