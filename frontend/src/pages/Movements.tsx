// src/pages/Movements.tsx
import React, { useMemo, useState } from "react";
import {
  useMovements,
  useCreateMovement,
  useUpdateMovement,
  type Movement,
  type MovementType,
  type SortDir,
} from "../api/movements";
import ControlPanel, { type ViewMode } from "../components/layout/ControlPanel";
import KanbanBoard from "../components/views/KanbanBoard";
import { toCsv, downloadCsv } from "../lib/csv";
import Button from "../components/ui/Button";

function fmt(dt: string) {
  try { return new Date(dt).toLocaleString(); } catch { return dt; }
}

function Drawer({
  open, onClose, children, title,
}: {
  open: boolean; onClose: () => void; children: React.ReactNode; title?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h3 className="text-lg font-semibold">{title ?? "Movimiento"}</h3>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-slate-100">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </aside>
    </div>
  );
}

export default function MovementsPage() {
  const [q, setQ] = useState("");
  const [view, setView] = useState<ViewMode>("list");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [tipo, setTipo] = useState<MovementType | "">("");
  const [bodega, setBodega] = useState<string>("");

  const [sortBy, setSortBy] = useState<"fecha" | "tipo" | "sku" | "cantidad" | "bodega">("fecha");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data, isLoading, isError, refetch } = useMovements({
    q, tipo: tipo || "", bodega: bodega || "", page, pageSize, sortBy, sortDir,
  });
  const total = data?.total ?? 0;
  const rows = data?.data ?? [];
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const bodegasOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.bodega).filter(Boolean))).sort(),
    [rows]
  );

  const [editing, setEditing] = useState<Movement | null>(null);
  const [isNew, setIsNew] = useState(false);
  const createMut = useCreateMovement();
  const updateMut = useUpdateMovement(editing?.id ?? 0);

  const openCreate = () => { setIsNew(true); setEditing(null); };
  const openEdit = (m: Movement) => { setIsNew(false); setEditing(m); };
  const closeDrawer = () => { setIsNew(false); setEditing(null); };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const dto = {
      tipo: String(fd.get("tipo") || "Ingreso") as MovementType,
      fecha: String(fd.get("fecha") || new Date().toISOString()),
      sku: String(fd.get("sku") || ""),
      cantidad: Number(fd.get("cantidad") || 0),
      bodega: String(fd.get("bodega") || ""),
      motivo: String(fd.get("motivo") || ""),
      referencia: String(fd.get("referencia") || ""),
    } as Partial<Movement>;

    if (isNew) {
      if (!dto.sku || !dto.tipo) return alert("SKU y Tipo son obligatorios");
      if (dto.cantidad === 0) return alert("Cantidad no puede ser 0");
      createMut.mutate(dto, {
        onSuccess: () => { closeDrawer(); refetch(); },
        onError: () => alert("No se pudo crear"),
      });
    } else {
      if (!editing) return;
      if (dto.cantidad === 0) return alert("Cantidad no puede ser 0");
      updateMut.mutate(dto, {
        onSuccess: () => { closeDrawer(); refetch(); },
        onError: () => alert("No se pudo guardar"),
      });
    }
  };

  const columns = useMemo<MovementType[]>(() => ["Ingreso", "Salida", "Ajuste"], []);
  const columnOf = (m: Movement) => m.tipo;
  const renderCard = (m: Movement) => (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-800">
          {m.tipo} · <span className="font-mono">{m.sku}</span>
        </div>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{fmt(m.fecha)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700">Cant.: {m.cantidad}</span>
        {m.bodega && <span className="rounded bg-slate-100 px-2 py-0.5">{m.bodega}</span>}
        {m.motivo && <span className="rounded bg-slate-100 px-2 py-0.5">{m.motivo}</span>}
        {m.referencia && <span className="rounded bg-slate-100 px-2 py-0.5">Ref: {m.referencia}</span>}
      </div>
    </div>
  );

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir(col === "fecha" ? "desc" : "asc"); }
    setPage(1);
  }

  function exportCsv() {
    const csv = toCsv(
      rows.map((m) => ({
        id: m.id,
        fecha: fmt(m.fecha),
        tipo: m.tipo,
        sku: m.sku,
        cantidad: m.cantidad,
        bodega: m.bodega ?? "",
        motivo: m.motivo ?? "",
        referencia: m.referencia ?? "",
      })),
      ["id", "fecha", "tipo", "sku", "cantidad", "bodega", "motivo", "referencia"]
    );
    downloadCsv("movimientos.csv", csv);
  }

  return (
    <section className="w-full px-6 pb-6">
      <h2 className="sr-only">Movimientos</h2>
      <ControlPanel
        search={q}
        onSearch={(v) => { setQ(v); setPage(1); }}
        view={view}
        onChangeView={setView}
      />

      {/* Filtros */}
      <div className="w-full px-6 pt-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select
            value={tipo}
            onChange={(e) => { setTipo(e.target.value as MovementType | ""); setPage(1); }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
          >
            <option value="">Tipo (todos)</option>
            <option value="Ingreso">Ingreso</option>
            <option value="Salida">Salida</option>
            <option value="Ajuste">Ajuste</option>
          </select>

          <select
            value={bodega}
            onChange={(e) => { setBodega(e.target.value); setPage(1); }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
          >
            <option value="">Bodega (todas)</option>
            {bodegasOptions.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" onClick={exportCsv}>Exportar CSV</Button>
            <Button variant="primary" onClick={openCreate}>Nuevo movimiento</Button>
            {(tipo || bodega) && (
              <Button variant="secondary" onClick={() => { setTipo(""); setBodega(""); setPage(1); }}>
                Limpiar filtros
              </Button>
            )}
          </div>
        </div>
      </div>

      {view === "kanban" ? (
        <>
          {isLoading && (
            <div className="w-full px-6 py-6">
              <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
            </div>
          )}
          {isError && (
            <div className="w-full px-6 py-6 text-red-700">
              Error. <Button size="sm" onClick={() => refetch()}>Reintentar</Button>
            </div>
          )}
          {!isLoading && !isError && (
            <KanbanBoard<Movement>
              columns={columns}
              items={rows}
              columnOf={columnOf}
              renderCard={renderCard}
              onOpen={(m) => openEdit(m)}
              emptyText="Sin movimientos en esta columna"
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
                    <Th onClick={() => toggleSort("fecha")} active={sortBy === "fecha"} dir={sortDir}>Fecha</Th>
                    <Th onClick={() => toggleSort("tipo")} active={sortBy === "tipo"} dir={sortDir}>Tipo</Th>
                    <Th onClick={() => toggleSort("sku")} active={sortBy === "sku"} dir={sortDir}>SKU</Th>
                    <Th onClick={() => toggleSort("cantidad")} active={sortBy === "cantidad"} dir={sortDir}>Cantidad</Th>
                    <Th onClick={() => toggleSort("bodega")} active={sortBy === "bodega"} dir={sortDir}>Bodega</Th>
                    <th className="px-4 py-2.5 text-left">Motivo</th>
                    <th className="px-4 py-2.5 text-left">Referencia</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td colSpan={8} className="px-4 py-6">
                        <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
                      </td>
                    </tr>
                  )}

                  {isError && (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-red-700">
                        Error. <Button size="sm" onClick={() => refetch()}>Reintentar</Button>
                      </td>
                    </tr>
                  )}

                  {!isLoading && !isError && rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                        No hay movimientos.
                      </td>
                    </tr>
                  )}

                  {!isLoading && !isError && rows.map((m, i) => (
                    <tr
                      key={m.id}
                      className={`border-t ${i % 2 ? "bg-slate-50/40" : "bg-white"} hover:bg-indigo-50/40`}
                    >
                      <td className="px-4 py-2.5">{fmt(m.fecha)}</td>
                      <td className="px-4 py-2.5">{m.tipo}</td>
                      <td className="px-4 py-2.5 font-mono">{m.sku}</td>
                      <td className="px-4 py-2.5">{m.cantidad}</td>
                      <td className="px-4 py-2.5">{m.bodega ?? ""}</td>
                      <td className="px-4 py-2.5">{m.motivo ?? ""}</td>
                      <td className="px-4 py-2.5">{m.referencia ?? ""}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Button size="sm" onClick={() => openEdit(m)}>Editar</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

      {/* Drawer crear/editar */}
      <Drawer
        open={isNew || editing !== null}
        onClose={closeDrawer}
        title={isNew ? "Nuevo movimiento" : editing ? `Editar movimiento (#${editing.id})` : "Movimiento"}
      >
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-slate-600">Tipo</label>
              <select
                name="tipo"
                defaultValue={editing?.tipo ?? "Ingreso"}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
              >
                <option value="Ingreso">Ingreso</option>
                <option value="Salida">Salida</option>
                <option value="Ajuste">Ajuste</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">Fecha</label>
              <input
                name="fecha"
                type="datetime-local"
                defaultValue={editing ? new Date(editing.fecha).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">SKU</label>
              <input
                name="sku"
                defaultValue={editing?.sku ?? ""}
                required
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">Cantidad</label>
              <input
                name="cantidad"
                type="number"
                step="1"
                defaultValue={editing?.cantidad ?? 1}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">Bodega</label>
              <input
                name="bodega"
                defaultValue={editing?.bodega ?? ""}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">Motivo</label>
              <input
                name="motivo"
                defaultValue={editing?.motivo ?? ""}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-sm text-slate-600">Referencia</label>
              <input
                name="referencia"
                defaultValue={editing?.referencia ?? ""}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeDrawer}>Cancelar</Button>
            <Button type="submit" variant="primary">{isNew ? "Crear movimiento" : "Guardar cambios"}</Button>
          </div>
        </form>
      </Drawer>
    </section>
  );
}

function Th({
  children, onClick, active, dir,
}: {
  children: React.ReactNode; onClick: () => void; active?: boolean; dir?: "asc" | "desc";
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
