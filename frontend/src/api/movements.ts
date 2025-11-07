// src/api/movements.ts
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import http from "../lib/http";

/** Tipos */
export type MovementType = "Ingreso" | "Salida" | "Ajuste";
export type Movement = {
  id: number;
  fecha: string;         // ISO (ej: "2025-11-07T12:34:00Z")
  tipo: MovementType;    // Ingreso | Salida | Ajuste
  sku: string;
  cantidad: number;
  bodega?: string;
  motivo?: string;
  referencia?: string;   // doc/orden
};

export type SortDir = "asc" | "desc";
export type ListParams = {
  q?: string;
  tipo?: MovementType | "";
  bodega?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "fecha" | "tipo" | "sku" | "cantidad" | "bodega";
  sortDir?: SortDir;
};

export type PagedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
};

/** --- Requests crudas (con MOCK opcional) --- */
async function fetchMovements(params?: ListParams): Promise<PagedResponse<Movement>> {
  if (import.meta.env.VITE_USE_MOCK === "1") {
    const now = Date.now();
    let mock: Movement[] = Array.from({ length: 18 }).map((_, i) => ({
      id: i + 1,
      fecha: new Date(now - i * 36e5).toISOString(),
      tipo: (["Ingreso", "Salida", "Ajuste"] as MovementType[])[i % 3],
      sku: `SKU-${1000 + (i % 8)}`,
      cantidad: (i % 3 === 2 ? -1 : 1) * (5 + (i % 7)),
      bodega: ["Principal", "Secundaria", "Quilicura"][i % 3],
      motivo: ["Compra", "Venta", "Corrección"][i % 3],
      referencia: i % 2 ? `DOC-${200 + i}` : undefined,
    }));

    // Filtros simples en cliente
    if (params?.q) {
      const q = params.q.toLowerCase();
      mock = mock.filter(
        (m) =>
          m.sku.toLowerCase().includes(q) ||
          m.tipo.toLowerCase().includes(q) ||
          (m.bodega ?? "").toLowerCase().includes(q) ||
          (m.motivo ?? "").toLowerCase().includes(q) ||
          (m.referencia ?? "").toLowerCase().includes(q)
      );
    }
    if (params?.tipo) mock = mock.filter((m) => m.tipo === params.tipo);
    if (params?.bodega) mock = mock.filter((m) => m.bodega === params.bodega);

    // Ordenamiento en cliente
    if (params?.sortBy) {
      const dir = params.sortDir === "desc" ? -1 : 1;
      const key = params.sortBy;
      mock = mock.sort((a: any, b: any) => {
        const av = key === "fecha" ? new Date(a[key]).getTime() : a[key] ?? "";
        const bv = key === "fecha" ? new Date(b[key]).getTime() : b[key] ?? "";
        return av > bv ? dir : av < bv ? -dir : 0;
      });
    }

    // Paginación simple
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? mock.length;
    const start = (page - 1) * pageSize;
    const pageData = mock.slice(start, start + pageSize);
    return { data: pageData, total: mock.length, page, pageSize };
  }

  // Backend real (pasamos params tal cual; asume soporte server-side)
  const { data } = await http.get("/movimientos", { params });

  if (Array.isArray(data)) {
    return { data, total: data.length, page: 1, pageSize: data.length };
  }
  if (data && Array.isArray((data as any).data)) {
    return data as PagedResponse<Movement>;
  }
  if (data && Array.isArray((data as any).items)) {
    const d: any = data;
    return {
      data: d.items,
      total: d.total ?? d.items.length,
      page: d.page ?? 1,
      pageSize: d.pageSize ?? d.items.length,
    };
  }
  console.warn("Shape inesperado en /movimientos:", data);
  return { data: [], total: 0, page: 1, pageSize: 0 };
}

async function createMovement(dto: Partial<Movement>): Promise<Movement> {
  const { data } = await http.post("/movimientos", dto);
  return data;
}

async function updateMovement(id: number, dto: Partial<Movement>): Promise<Movement> {
  const { data } = await http.put(`/movimientos/${id}`, dto);
  return data;
}

/** --- Hooks React Query --- */
export function useMovements(params?: ListParams) {
  return useQuery({
    queryKey: ["movements", params],
    queryFn: () => fetchMovements(params),
    placeholderData: keepPreviousData,
  });
}

export function useCreateMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createMovement,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["movements"] });
    },
  });
}

export function useUpdateMovement(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: Partial<Movement>) => updateMovement(id, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["movement", id] });
    },
  });
}
