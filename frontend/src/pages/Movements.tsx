// src/pages/Movements.tsx
import {
  Fragment,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { Dialog, Transition } from "@headlessui/react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { http } from "../lib/http";

/* =========================
   Tipos
   ========================= */

type MovimientoItem = {
  sku: string;
  nombre: string;
  cantidad: number;
  costoUnitario?: number | string | null;
};

type MovimientoSalida = {
  id: number;
  fecha: string; // ISO
  // el backend puede mandar "Salida", "SALIDA", "Retorno", etc.
  tipo: string;
  proyecto: string | null;
  documento: string | null;
  observacion: string | null;
  items: MovimientoItem[];
};

type MovimientosResponse = {
  data: MovimientoSalida[];
  total: number;
};

type Proyecto = {
  id: number;
  nombre: string;
};

// Lo que venga del backend al llamar /productos
type ProductoBackend = {
  id: number;
  sku?: string | null;
  nombre?: string | null;
  codigoBarras?: string | null;
  codigo_barra?: string | null;
  codigo?: string | null;
};

// Lo que usamos en el combo del formulario
type ProductoCombo = {
  id: number;
  sku: string;
  nombre: string;
  codigoBarras?: string | null;
};

type ProductosListResponseShape1 = {
  data: ProductoBackend[];
  total: number;
};

type ItemDraft = {
  id: string;
  sku: string;
  nombre: string;
  cantidad: string;
  // texto que escribe el usuario para buscar (SKU, nombre o código de barras)
  search: string;
};

type NuevaMovimientoPayload = {
  proyectoId: number;
  documento: string | null;
  observacion: string | null;
  items: { sku: string; cantidad: number }[];
};

type TipoFiltro = "ALL" | "SALIDA" | "RETORNO";

type NuevaMovimientoConTipo = NuevaMovimientoPayload & {
  tipo: "SALIDA" | "RETORNO";
};

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

function money(n: number) {
  return n.toLocaleString("es-CL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function calcTotal(items: MovimientoItem[]) {
  return items.reduce((acc, it) => {
    const raw = it.costoUnitario ?? 0;
    const c =
      typeof raw === "string" ? Number(raw) : (raw as number) ?? 0;
    if (!Number.isFinite(c)) return acc;
    return acc + it.cantidad * c;
  }, 0);
}

function formatTipoLabel(tipo: string) {
  const t = (tipo || "").toUpperCase();
  if (t === "SALIDA") return "Salida";
  if (t === "RETORNO") return "Retorno";
  return tipo || "—";
}

function tipoBadgeClasses(tipo: string) {
  const t = (tipo || "").toUpperCase();
  if (t === "SALIDA") {
    return "bg-rose-50 text-rose-700 border border-rose-100";
  }
  if (t === "RETORNO") {
    return "bg-emerald-50 text-emerald-700 border border-emerald-100";
  }
  return "bg-slate-100 text-slate-700 border border-slate-200";
}

function filtroLabel(tipo: TipoFiltro) {
  if (tipo === "ALL") return "Salidas y devoluciones";
  if (tipo === "SALIDA") return "Solo egresos (salidas)";
  return "Solo devoluciones desde proyecto";
}

/* =========================
   Fetchers
   ========================= */

async function fetchMovimientos(
  tipo: TipoFiltro
): Promise<MovimientosResponse> {
  const res = await http.get<MovimientosResponse>(
    "/proyectos/movimientos",
    {
      params: {
        tipo, // "ALL" | "SALIDA" | "RETORNO"
        page: 1,
        pageSize: 20,
      },
    }
  );
  return res.data;
}

async function fetchProyectosAll(): Promise<Proyecto[]> {
  const res = await http.get<Proyecto[]>("/proyectos");
  return res.data;
}

// Productos para combo de egreso (SKU/nombre/código barras)
async function fetchProductosCombo(): Promise<ProductoCombo[]> {
  const res = await http.get("/productos", {
    params: {
      page: 1,
      pageSize: 500,
    },
  });

  const body: any = res.data;
  console.log("Respuesta /productos (combo movimientos):", body);

  let productosRaw: ProductoBackend[] = [];

  // Soportamos varias formas típicas:
  if (Array.isArray(body)) {
    // Caso: el backend devuelve directamente [ { ...producto }, ... ]
    productosRaw = body as ProductoBackend[];
  } else if (Array.isArray(body.data)) {
    // Caso: { data: [ ... ], total: n }
    productosRaw = (body as ProductosListResponseShape1).data;
  } else if (Array.isArray(body.productos)) {
    // Caso: { productos: [ ... ], total: n }
    productosRaw = body.productos as ProductoBackend[];
  } else {
    productosRaw = [];
  }

  // Normalizamos
  const productos: ProductoCombo[] = productosRaw.map((p) => ({
    id: p.id,
    sku: p.sku ?? "",
    nombre: p.nombre ?? "",
    codigoBarras:
      p.codigoBarras ?? p.codigo_barra ?? p.codigo ?? null,
  }));

  console.log(
    "Productos normalizados para combo movimientos:",
    productos
  );

  return productos;
}

/* =========================
   Página
   ========================= */

export default function MovementsPage() {
  const queryClient = useQueryClient();

  // Listado
  const [search, setSearch] = useState("");
  const [tipoFiltro, setTipoFiltro] =
    useState<TipoFiltro>("ALL");

  // Qué formulario está abierto: SALIDA (egreso) o RETORNO
  const [activeForm, setActiveForm] =
    useState<"SALIDA" | "RETORNO" | null>(null);
  const isOpen = activeForm !== null;

  // Formulario común
  const [documento, setDocumento] = useState("");
  const [observacion, setObservacion] = useState("");

  const [proyectoSearch, setProyectoSearch] = useState("");
  const [selectedProyecto, setSelectedProyecto] =
    useState<Proyecto | null>(null);

  const [items, setItems] = useState<ItemDraft[]>([
    {
      id: "item-1",
      sku: "",
      nombre: "",
      cantidad: "",
      search: "",
    },
  ]);

  /* ========== Datos del listado ========== */

  const {
    data: movimientosData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["proyectos", "movimientos", tipoFiltro],
    queryFn: () => fetchMovimientos(tipoFiltro),
  });

  const movimientos = movimientosData?.data ?? [];

  const filteredMovimientos = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return movimientos;
    return movimientos.filter((mov) => {
      const proyecto = (mov.proyecto ?? "").toLowerCase();
      const doc = (mov.documento ?? "").toLowerCase();
      const obs = (mov.observacion ?? "").toLowerCase();
      const itemsText = mov.items
        .map(
          (it) =>
            `${it.sku ?? ""} ${(it.nombre ?? "").toLowerCase()}`
        )
        .join(" ");
      return (
        proyecto.includes(term) ||
        doc.includes(term) ||
        obs.includes(term) ||
        itemsText.includes(term)
      );
    });
  }, [movimientos, search]);

  /* ========== Proyectos para el combo ========== */

  const {
    data: proyectosData,
    isLoading: loadingProyectos,
    isError: errorProyectos,
  } = useQuery({
    queryKey: ["proyectos", "all"],
    queryFn: fetchProyectosAll,
    enabled: isOpen,
  });

  const proyectos = proyectosData ?? [];

  const proyectosFiltrados = useMemo(() => {
    const term = proyectoSearch.trim().toLowerCase();
    if (!term) return [];
    return proyectos.filter((p) =>
      p.nombre.toLowerCase().includes(term)
    );
  }, [proyectos, proyectoSearch]);

  const hayProyectosSugeridos =
    proyectoSearch.trim().length > 0 &&
    proyectosFiltrados.length > 0;

  /* ========== Productos para buscar por SKU / código / nombre ========== */

  const {
    data: productosData,
    isLoading: loadingProductos,
    isError: errorProductos,
  } = useQuery({
    queryKey: ["productos", "combo-movimientos"],
    queryFn: fetchProductosCombo,
    // sin enabled: isOpen -> lo cargamos una vez y queda en caché
  });

  const productos = productosData ?? [];

  /* ========== Mutación crear egreso / retorno ========== */

  const crearMovimientoMutation = useMutation({
    mutationFn: async (input: NuevaMovimientoConTipo) => {
      const { tipo, ...body } = input;
      const url =
        tipo === "SALIDA"
          ? "/proyectos/salidas"
          : "/proyectos/retornos";
      const res = await http.post(url, body);
      return res.data;
    },
    onSuccess: () => {
      // invalidamos todos los listados de movimientos (ALL/SALIDA/RETORNO)
      queryClient.invalidateQueries({
        queryKey: ["proyectos", "movimientos"],
      });
      resetForm();
      setActiveForm(null);
    },
  });

  const saving = crearMovimientoMutation.isPending;

  /* ========== Helpers formulario ========== */

  function resetForm() {
    setDocumento("");
    setObservacion("");
    setProyectoSearch("");
    setSelectedProyecto(null);
    setItems([
      {
        id: "item-1",
        sku: "",
        nombre: "",
        cantidad: "",
        search: "",
      },
    ]);
    crearMovimientoMutation.reset();
  }

  function openForm(tipo: "SALIDA" | "RETORNO") {
    resetForm();
    setActiveForm(tipo);
  }

  function closePanel() {
    if (!saving) {
      setActiveForm(null);
    }
  }

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

  function handleAgregarItem() {
    setItems((prev) => [
      ...prev,
      {
        id: `item-${prev.length + 1}-${Date.now()}`,
        sku: "",
        nombre: "",
        cantidad: "",
        search: "",
      },
    ]);
  }

  function handleEliminarItem(id: string) {
    setItems((prev) =>
      prev.length > 1 ? prev.filter((it) => it.id !== id) : prev
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!activeForm) return;

    if (!selectedProyecto) {
      alert("Debes seleccionar un proyecto.");
      return;
    }

    const cleanedItems = items
      .map((it) => ({
        ...it,
        cantidadNum: Number(it.cantidad),
      }))
      .filter(
        (it) =>
          it.sku.trim() &&
          Number.isFinite(it.cantidadNum) &&
          it.cantidadNum > 0
      );

    if (cleanedItems.length === 0) {
      alert(
        "Debes agregar al menos un ítem con SKU y cantidad mayor a 0."
      );
      return;
    }

    const payload: NuevaMovimientoConTipo = {
      tipo: activeForm,
      proyectoId: selectedProyecto.id,
      documento: documento.trim() || null,
      observacion: observacion.trim() || null,
      items: cleanedItems.map((it) => ({
        sku: it.sku.trim(),
        cantidad: it.cantidadNum,
      })),
    };

    crearMovimientoMutation.mutate(payload);
  }

  const isSalidaForm = activeForm === "SALIDA";
  const slideTitle = isSalidaForm
    ? "Nuevo egreso a proyecto"
    : "Devolución desde proyecto";
  const slideSubtitle = isSalidaForm
    ? "Registra un egreso de bodega hacia un proyecto o centro de costo. El costo se calcula con el PPP vigente."
    : "Registra el retorno de materiales sobrantes desde el proyecto a la bodega. El sistema intentará usar el mismo costo al que salió.";
  const submitLabel = isSalidaForm
    ? "Registrar egreso"
    : "Registrar devolución";

  const badgeLabel = filtroLabel(tipoFiltro);

  /* ========== Render ========== */

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Encabezado + botones acción */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Salidas y devoluciones de proyecto
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Registra egresos de bodega hacia proyectos y
              devoluciones de material sobrante. El sistema mantiene
              el PPP vigente y la trazabilidad por proyecto.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <button
              type="button"
              onClick={() => openForm("SALIDA")}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-700"
            >
              <span>＋</span>
              <span>Nuevo egreso</span>
            </button>
            <button
              type="button"
              onClick={() => openForm("RETORNO")}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
            >
              <span>↻</span>
              <span>Devolución desde proyecto</span>
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
              placeholder="Buscar por proyecto, documento o SKU..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            {/* Filtro tipo */}
            <div className="inline-flex rounded-full bg-slate-100 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setTipoFiltro("ALL")}
                className={`rounded-full px-3 py-1 font-medium ${
                  tipoFiltro === "ALL"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600"
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setTipoFiltro("SALIDA")}
                className={`rounded-full px-3 py-1 font-medium ${
                  tipoFiltro === "SALIDA"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600"
                }`}
              >
                Salidas
              </button>
              <button
                type="button"
                onClick={() => setTipoFiltro("RETORNO")}
                className={`rounded-full px-3 py-1 font-medium ${
                  tipoFiltro === "RETORNO"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600"
                }`}
              >
                Devoluciones
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-slate-100 px-2 py-0.5">
                {isLoading
                  ? "Cargando movimientos..."
                  : `Total: ${filteredMovimientos.length} movimientos`}
              </span>
            </div>
          </div>
        </div>

        {/* Tabla de movimientos */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Últimos movimientos registrados
            </span>
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-600">
              {badgeLabel}
            </span>
          </div>

          {isError && (
            <div className="p-4 text-sm text-red-600">
              Error cargando movimientos de proyecto.
            </div>
          )}

          {!isError &&
            filteredMovimientos.length === 0 &&
            !isLoading && (
              <div className="p-4 text-sm text-slate-500">
                Aún no hay movimientos registrados.
              </div>
            )}

          {!isError && filteredMovimientos.length > 0 && (
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Fecha
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Proyecto
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
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Tipo
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMovimientos.map((mov) => {
                  const total = calcTotal(mov.items);
                  const resumenItems = mov.items
                    .slice(0, 3)
                    .map((it) => `${it.sku} x${it.cantidad}`)
                    .join(" · ");
                  const mas =
                    mov.items.length > 3
                      ? ` (+${mov.items.length - 3} más)`
                      : "";

                  return (
                    <tr
                      key={mov.id}
                      className="hover:bg-slate-50/60"
                    >
                      <td className="whitespace-nowrap px-4 py-2 text-slate-700">
                        {formatDateShort(mov.fecha)}
                      </td>
                      <td className="max-w-xs px-4 py-2 text-slate-800">
                        <div className="truncate font-medium">
                          {mov.proyecto || "—"}
                        </div>
                        {mov.observacion && (
                          <div className="truncate text-xs text-slate-500">
                            {mov.observacion}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-700">
                        {mov.documento || "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-600">
                        {resumenItems}
                        {mas}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right text-slate-900">
                        {total > 0 ? `$${money(total)}` : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-left">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tipoBadgeClasses(
                            mov.tipo
                          )}`}
                        >
                          {formatTipoLabel(mov.tipo)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Slide-over formulario (egreso / retorno) */}
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
                <Dialog.Panel className="pointer-events-auto w-screen max-w-3xl bg-white shadow-xl">
                  <form
                    onSubmit={handleSubmit}
                    className="flex h-full flex-col"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
                      <div>
                        <Dialog.Title className="text-base font-semibold text-slate-900">
                          {slideTitle}
                        </Dialog.Title>
                        <p className="mt-1 text-sm text-slate-500">
                          {slideSubtitle}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={closePanel}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
                      >
                        <span className="text-lg" aria-hidden>
                          ×
                        </span>
                      </button>
                    </div>

                    {/* Contenido scrollable */}
                    <div className="flex-1 space-y-6 overflow-y-auto px-6 pb-4 pt-3">
                      {/* Proyecto + documento/obs */}
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-slate-700">
                            Proyecto
                          </label>
                          <div className="mt-1">
                            <div className="relative">
                              <input
                                type="text"
                                placeholder={
                                  loadingProyectos
                                    ? "Cargando proyectos..."
                                    : "Busca proyecto por nombre..."
                                }
                                value={proyectoSearch}
                                onChange={(e) =>
                                  setProyectoSearch(
                                    e.target.value
                                  )
                                }
                                disabled={loadingProyectos}
                                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                              />
                              {hayProyectosSugeridos && (
                                <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                                  {proyectosFiltrados.map(
                                    (p) => (
                                      <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => {
                                          setSelectedProyecto(
                                            p
                                          );
                                          setProyectoSearch("");
                                        }}
                                        className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50"
                                      >
                                        <span className="font-medium text-slate-900">
                                          {p.nombre}
                                        </span>
                                      </button>
                                    )
                                  )}
                                </div>
                              )}
                            </div>

                            {errorProyectos && (
                              <p className="mt-1 text-xs text-red-600">
                                Error cargando proyectos.
                              </p>
                            )}

                            {selectedProyecto && (
                              <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Proyecto seleccionado
                                </div>
                                <div className="mt-1 font-medium">
                                  {selectedProyecto.nombre}
                                </div>
                              </div>
                            )}
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500">
                            Si el proyecto no aparece, primero
                            créalo en el módulo correspondiente.
                          </p>
                        </div>

                        <div className="space-y-3 md:col-span-1">
                          <div>
                            <label className="block text-xs font-medium text-slate-700">
                              Documento (opcional)
                            </label>
                            <input
                              type="text"
                              value={documento}
                              onChange={(e) =>
                                setDocumento(
                                  e.target.value
                                )
                              }
                              placeholder="OC-123, GD-5..."
                              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-700">
                              Observación (opcional)
                            </label>
                            <input
                              type="text"
                              value={observacion}
                              onChange={(e) =>
                                setObservacion(
                                  e.target.value
                                )
                              }
                              placeholder={
                                isSalidaForm
                                  ? "Ej: Envío a obra X..."
                                  : "Ej: Sobrantes devueltos desde obra X..."
                              }
                              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Ítems */}
                      <div>
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-slate-900">
                            Ítems del movimiento
                          </h3>
                          <button
                            type="button"
                            onClick={handleAgregarItem}
                            className="text-xs font-medium text-rose-600 hover:text-rose-700"
                          >
                            + Agregar ítem
                          </button>
                        </div>

                        <div className="mt-3 space-y-3">
                          {items.map((it, index) => {
                            const term =
                              it.search.trim().toLowerCase();
                            const sugerencias =
                              term && productos.length > 0
                                ? productos
                                    .filter((p) => {
                                      const sku =
                                        (p.sku ?? "").toLowerCase();
                                      const nombre =
                                        (
                                          p.nombre ?? ""
                                        ).toLowerCase();
                                      const cb = (
                                        p.codigoBarras ?? ""
                                      ).toLowerCase();
                                      return (
                                        sku.includes(term) ||
                                        nombre.includes(term) ||
                                        cb.includes(term)
                                      );
                                    })
                                    .slice(0, 10)
                                : [];
                            const haySugerencias =
                              term.length > 0 &&
                              sugerencias.length > 0;

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
                                        handleEliminarItem(
                                          it.id
                                        )
                                      }
                                      className="text-xs text-slate-500 hover:text-red-600"
                                    >
                                      Eliminar ítem
                                    </button>
                                  )}
                                </div>

                                <div className="mt-2 grid gap-3 md:grid-cols-4">
                                  {/* Búsqueda de producto (SKU, nombre, código de barras) */}
                                  <div className="md:col-span-2">
                                    <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                      Producto (SKU, nombre o
                                      código de barras)
                                    </label>
                                    <div className="relative mt-1">
                                      <input
                                        type="text"
                                        value={it.search}
                                        onChange={(e) =>
                                          handleItemChange(
                                            it.id,
                                            "search",
                                            e.target.value
                                          )
                                        }
                                        placeholder={
                                          loadingProductos
                                            ? "Cargando productos..."
                                            : "Escanea o busca por SKU, nombre o código..."
                                        }
                                        disabled={
                                          loadingProductos
                                        }
                                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                                      />

                                      {haySugerencias && (
                                        <div className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                                          {sugerencias.map(
                                            (p) => (
                                              <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => {
                                                  setItems(
                                                    (
                                                      prev
                                                    ) =>
                                                      prev.map(
                                                        (
                                                          row
                                                        ) =>
                                                          row.id ===
                                                          it.id
                                                            ? {
                                                                ...row,
                                                                sku: p.sku,
                                                                nombre:
                                                                  p.nombre,
                                                                search: `${p.sku} – ${p.nombre}`,
                                                              }
                                                            : row
                                                      )
                                                  );
                                                }}
                                                className="flex w-full flex-col items-start px-3 py-2 text-left text-xs hover:bg-slate-50"
                                              >
                                                <span className="font-medium text-slate-900">
                                                  {p.sku} ·{" "}
                                                  {p.nombre}
                                                </span>
                                                {p.codigoBarras && (
                                                  <span className="text-[11px] text-slate-500">
                                                    Cód.
                                                    barras:{" "}
                                                    {
                                                      p.codigoBarras
                                                    }
                                                  </span>
                                                )}
                                              </button>
                                            )
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    {errorProductos && (
                                      <p className="mt-1 text-[11px] text-red-600">
                                        Error cargando productos.
                                      </p>
                                    )}
                                    {it.sku && (
                                      <p className="mt-1 text-[11px] text-slate-500">
                                        SKU seleccionado:{" "}
                                        <span className="font-mono">
                                          {it.sku}
                                        </span>
                                      </p>
                                    )}
                                  </div>

                                  {/* Nombre referencia */}
                                  <div className="md:col-span-1">
                                    <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                      Nombre (opcional)
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
                                      placeholder="Solo referencia visual."
                                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
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
                                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-900 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {crearMovimientoMutation.isError &&
                        (() => {
                          const err: any =
                            crearMovimientoMutation.error;
                          const status =
                            err?.response?.status;
                          const serverError =
                            err?.response?.data?.error;

                          // Log técnico para ti (DevTools)
                          console.error(
                            "Error al registrar movimiento:",
                            err
                          );

                          let msg =
                            "Error al registrar el movimiento.";
                          if (
                            status === 400 &&
                            typeof serverError === "string"
                          ) {
                            // Errores de validación comprensibles (stock, datos, etc.)
                            msg = serverError;
                          } else if (status >= 500) {
                            // Errores internos (bugs)
                            msg =
                              "Ocurrió un error interno al registrar el movimiento. Intenta nuevamente o avisa al administrador.";
                          }

                          return (
                            <div className="text-sm text-red-600">
                              {msg}
                            </div>
                          );
                        })()}
                    </div>

                    {/* Footer acciones */}
                    <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3">
                      <button
                        type="button"
                        onClick={closePanel}
                        className="text-sm font-medium text-slate-600 hover:text-slate-800"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-700 disabled:opacity-60"
                      >
                        {saving ? "Guardando..." : submitLabel}
                      </button>
                    </div>
                  </form>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition.Root>
    </>
  );
}
