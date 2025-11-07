// src/api/ingresos.ts
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import http from "../lib/http";

/** Tipos */
export type IngresoEstado = "Borrador" | "Confirmado" | "Anulado";

export type IngresoItem = {
  id?: number;
  sku: string;
  cantidad: number;
  costo?: number; // opcional (PPP o costo unitario)
};

export type Ingreso = {
  id: number;
  proveedor: string;
  documento?: string; // factura/guía
  fecha: string;      // ISO
  estado: IngresoEstado;
  items: IngresoItem[];
};

export type ListParams = {
  q?: string;
  proveedor?: string;
  estado?: IngresoEstado | "";
  page?: number;
  pageSize?: number;
};

export type PagedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
};

/** --- Requests crudas (con MOCK opcional) --- */
async function fetchIngresos(params?: ListParams): Promise<PagedResponse<Ingreso>> {
  if (import.meta.env.VITE_USE_MOCK === "1") {
    const now = Date.now();
    const mock: Ingreso[] = Array.from({ length: 12 }).map((_, i) => ({
      id: i + 1,
      proveedor: ["ACME Ltda", "TecnoParts", "IndusChile"][i % 3],
      documento: i % 2 ? `F-${1000 + i}` : `G-${900 + i}`,
      fecha: new Date(now - i * 86_400_000 / 2).toISOString(),
      estado: (["Borrador", "Confirmado", "Anulado"] as IngresoEstado[])[i % 3],
      items: [
        { sku: `SKU-${1200 + (i % 5)}`, cantidad: 5 + (i % 4), costo: 10000 + i * 500 },
        { sku: `SKU-${1300 + (i % 3)}`, cantidad: 2 + (i % 3), costo: 8000 + i * 300 },
      ],
    }));
    return { data: mock, total: mock.length, page: 1, pageSize: mock.length };
  }

  const { data } = await http.get("/ingresos", { params });

  if (Array.isArray(data)) {
    return { data, total: data.length, page: 1, pageSize: data.length };
  }
  if (data && Array.isArray((data as any).data)) {
    return data as PagedResponse<Ingreso>;
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
  console.warn("Shape inesperado en /ingresos:", data);
  return { data: [], total: 0, page: 1, pageSize: 0 };
}

async function createIngreso(dto: Partial<Ingreso>): Promise<Ingreso> {
  const { data } = await http.post("/ingresos", dto);
  return data;
}

async function updateIngreso(id: number, dto: Partial<Ingreso>): Promise<Ingreso> {
  const { data } = await http.put(`/ingresos/${id}`, dto);
  return data;
}

/** --- Hooks React Query --- */
export function useIngresos(params?: ListParams) {
  return useQuery({
    queryKey: ["ingresos", params],
    queryFn: () => fetchIngresos(params),
    placeholderData: keepPreviousData,
  });
}

export function useCreateIngreso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createIngreso,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ingresos"] });
    },
  });
}

export function useUpdateIngreso(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: Partial<Ingreso>) => updateIngreso(id, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ingresos"] });
      qc.invalidateQueries({ queryKey: ["ingreso", id] });
    },
  });
}
