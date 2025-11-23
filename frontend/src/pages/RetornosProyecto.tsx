// src/pages/RetornosProyecto.tsx
import React, { useEffect, useState } from "react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

// Tipos para el listado
interface MovimientoItem {
  sku: string;
  nombre: string;
  cantidad: number;
  costoUnitario?: number;
}

interface MovimientoRetorno {
  id: number;
  fecha: string;
  proyecto: string;
  documento: string;
  observacion: string;
  items: MovimientoItem[];
}

interface Proyecto {
  id: number;
  nombre: string;
}

// Fila del formulario
interface RetornoItemForm {
  sku: string;
  cantidad: string;
}

const RetornosProyectoPage: React.FC = () => {
  const [loadingList, setLoadingList] = useState(false);
  const [retornos, setRetornos] = useState<MovimientoRetorno[]>([]);
  const [total, setTotal] = useState(0);

  const [openForm, setOpenForm] = useState(false);

  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [proyectoId, setProyectoId] = useState<string>("");
  const [documento, setDocumento] = useState("");
  const [observacion, setObservacion] = useState("");
  const [items, setItems] = useState<RetornoItemForm[]>([
    { sku: "", cantidad: "" },
  ]);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ==========================
  // Cargar proyectos y retornos
  // ==========================

  async function loadProyectos() {
    try {
      const resp = await fetch(`${API_BASE_URL}/proyectos`);
      if (!resp.ok) throw new Error("Error cargando proyectos");
      const data: Proyecto[] = await resp.json();
      setProyectos(data);
    } catch (e) {
      console.error("Error proyectos:", e);
    }
  }

  async function loadRetornos() {
    try {
      setLoadingList(true);
      const resp = await fetch(
        `${API_BASE_URL}/proyectos/movimientos?tipo=RETORNO&page=1&pageSize=20`
      );
      if (!resp.ok) throw new Error("Error cargando retornos");
      const json = await resp.json();
      setRetornos(json.data ?? []);
      setTotal(json.total ?? 0);
    } catch (e) {
      console.error("Error retornos:", e);
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    loadProyectos();
    loadRetornos();
  }, []);

  // ==========================
  // Helpers del formulario
  // ==========================

  function handleItemChange(
    index: number,
    field: keyof RetornoItemForm,
    value: string
  ) {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, [field]: value } : it))
    );
  }

  function addItemRow() {
    setItems((prev) => [...prev, { sku: "", cantidad: "" }]);
  }

  function removeItemRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function resetForm() {
    setProyectoId("");
    setDocumento("");
    setObservacion("");
    setItems([{ sku: "", cantidad: "" }]);
    setErrorMsg(null);
  }

  // ==========================
  // Guardar retorno
  // ==========================

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!proyectoId) {
      setErrorMsg("Debes seleccionar un proyecto.");
      return;
    }

    const payload = {
      proyectoId: Number(proyectoId),
      documento: documento.trim() || undefined,
      observacion: observacion.trim() || undefined,
      items: items
        .map((it) => ({
          sku: it.sku.trim(),
          cantidad: Number(it.cantidad),
        }))
        .filter(
          (it) =>
            it.sku !== "" &&
            Number.isFinite(it.cantidad) &&
            it.cantidad > 0
        ),
    };

    if (payload.items.length === 0) {
      setErrorMsg("Debes agregar al menos un ítem con cantidad > 0.");
      return;
    }

    try {
      setSaving(true);
      const resp = await fetch(`${API_BASE_URL}/proyectos/retornos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await resp.json();

      if (!resp.ok || json.error) {
        throw new Error(json.error || "Error al registrar el retorno.");
      }

      await loadRetornos();
      resetForm();
      setOpenForm(false);
    } catch (e: any) {
      console.error("Error creando retorno:", e);
      setErrorMsg(e?.message || "Error al registrar el retorno.");
    } finally {
      setSaving(false);
    }
  }

  // ==========================
  // Render
  // ==========================

  return (
    <div className="space-y-6">
      {/* Encabezado + botón */}
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Retornos desde proyecto
          </h2>
          <p className="text-sm text-slate-500">
            Registra materiales que vuelven desde los proyectos a bodega y
            revisa el historial de retornos.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            resetForm();
            setOpenForm(true);
          }}
          className="inline-flex items-center justify-center rounded-full bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700"
        >
          + Nuevo retorno desde proyecto
        </button>
      </div>

      {/* Formulario (panel) */}
      {openForm && (
        <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-sky-900">
                Nuevo retorno desde proyecto
              </h3>
              <p className="text-xs text-sky-700">
                Selecciona el proyecto y los ítems que regresan a bodega.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setOpenForm(false);
              }}
              className="text-xs font-medium text-sky-800 hover:text-sky-900"
            >
              Cerrar
            </button>
          </div>

          {errorMsg && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Datos generales */}
            <div className="grid gap-3 md:grid-cols-3">
              <div className="md:col-span-1">
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Proyecto
                </label>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  value={proyectoId}
                  onChange={(e) => setProyectoId(e.target.value)}
                >
                  <option value="">Seleccionar proyecto…</option>
                  {proyectos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Número de documento
                </label>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  placeholder="Guía, nota, etc."
                  value={documento}
                  onChange={(e) => setDocumento(e.target.value)}
                />
              </div>

              <div className="md:col-span-1">
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Observación (opcional)
                </label>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  placeholder="Motivo del retorno…"
                  value={observacion}
                  onChange={(e) => setObservacion(e.target.value)}
                />
              </div>
            </div>

            {/* Ítems */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Ítems del retorno
                </h4>
                <button
                  type="button"
                  onClick={addItemRow}
                  className="text-xs font-medium text-sky-700 hover:text-sky-900"
                >
                  + Agregar ítem
                </button>
              </div>

              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div
                    key={idx}
                    className="grid gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 md:grid-cols-[1fr,120px,auto]"
                  >
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium text-slate-600">
                        SKU
                      </label>
                      <input
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        placeholder="Ej: EXT-0001"
                        value={it.sku}
                        onChange={(e) =>
                          handleItemChange(idx, "sku", e.target.value)
                        }
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium text-slate-600">
                        Cantidad
                      </label>
                      <input
                        type="number"
                        min={1}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        value={it.cantidad}
                        onChange={(e) =>
                          handleItemChange(idx, "cantidad", e.target.value)
                        }
                      />
                    </div>

                    <div className="flex items-end justify-end">
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItemRow(idx)}
                          className="text-xs font-medium text-red-500 hover:text-red-700"
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Acciones */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setOpenForm(false);
                }}
                className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-sky-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
              >
                {saving ? "Guardando..." : "Registrar retorno"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Listado de retornos */}
      <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Últimos retornos ({total})
          </h3>
          {loadingList && (
            <span className="text-xs text-slate-500">
              Cargando movimientos...
            </span>
          )}
        </div>

        {retornos.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aún no hay retornos registrados.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">Fecha</th>
                  <th className="px-2 py-2">Proyecto</th>
                  <th className="px-2 py-2">Documento</th>
                  <th className="px-2 py-2">Observación</th>
                  <th className="px-2 py-2">Ítems</th>
                </tr>
              </thead>
              <tbody>
                {retornos.map((m) => (
                  <tr key={m.id} className="border-b border-slate-100">
                    <td className="px-2 py-2 text-xs text-slate-600">
                      {new Date(m.fecha).toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-sm text-slate-800">
                      {m.proyecto}
                    </td>
                    <td className="px-2 py-2 text-sm text-slate-700">
                      {m.documento || "—"}
                    </td>
                    <td className="px-2 py-2 text-xs text-slate-600">
                      {m.observacion || "—"}
                    </td>
                    <td className="px-2 py-2 text-xs text-slate-700">
                      {m.items.map((it, idx) => (
                        <div key={idx}>
                          <span className="font-medium">{it.sku}</span>
                          {` · `}
                          <span>{it.nombre}</span>
                          {` · `}
                          <span>{it.cantidad} u.</span>
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default RetornosProyectoPage;
