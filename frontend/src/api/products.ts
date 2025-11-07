// src/api/products.ts
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import http from "../lib/http";

/** Tipos */
export type Product = {
  id: number;
  sku: string;
  nombre: string;
  marca: string;
  categoria: string;
  stock: number;
  estado?: string;
};

export type SortDir = "asc" | "desc";
export type ListParams = {
  q?: string;
  marca?: string;
  categoria?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "sku" | "nombre" | "marca" | "categoria" | "stock";
  sortDir?: SortDir;
};

export type PagedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
};

/** --- Requests crudas --- */
async function fetchProducts(params?: ListParams): Promise<PagedResponse<Product>> {
  // Mock rápido
  if (import.meta.env.VITE_USE_MOCK === "1") {
    let mock: Product[] = Array.from({ length: 24 }).map((_, i) => ({
      id: i + 1,
      sku: `SKU-${1000 + i}`,
      nombre: ["Variador", "Sensor", "Encoder", "Contactora"][i % 4] + ` ${i + 1}`,
      marca: ["ABB", "Siemens", "Schneider"][i % 3],
      categoria: ["Motores", "Sensores", "Control"][i % 3],
      stock: Math.floor(Math.random() * 120),
      estado: ["Borrador", "En revisión", "Activo"][i % 3],
    }));
    // filtro simple
    if (params?.q) {
      const q = params.q.toLowerCase();
      mock = mock.filter(
        (p) =>
          p.sku.toLowerCase().includes(q) ||
          (p.nombre ?? "").toLowerCase().includes(q) ||
          (p.marca ?? "").toLowerCase().includes(q)
      );
    }
    if (params?.marca) mock = mock.filter((p) => p.marca === params.marca);
    if (params?.categoria) mock = mock.filter((p) => p.categoria === params.categoria);
    // sort en cliente
    if (params?.sortBy) {
      const dir = params.sortDir === "desc" ? -1 : 1;
      const key = params.sortBy;
      mock = mock.sort((a: any, b: any) => (a[key] > b[key] ? dir : a[key] < b[key] ? -dir : 0));
    }
    // paginación simple
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? mock.length;
    const start = (page - 1) * pageSize;
    const pageData = mock.slice(start, start + pageSize);
    return { data: pageData, total: mock.length, page, pageSize };
  }

  const { data } = await http.get("/productos", { params });

  if (Array.isArray(data)) {
    return { data, total: data.length, page: 1, pageSize: data.length };
  }
  if (data && Array.isArray((data as any).data)) {
    return data as PagedResponse<Product>;
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
  console.warn("Shape inesperado en /productos:", data);
  return { data: [], total: 0, page: 1, pageSize: 0 };
}

async function fetchProduct(id: number): Promise<Product> {
  const { data } = await http.get(`/productos/${id}`);
  return data;
}

async function createProduct(dto: Partial<Product>): Promise<Product> {
  const { data } = await http.post("/productos", dto);
  return data;
}

async function updateProduct(id: number, dto: Partial<Product>): Promise<Product> {
  const { data } = await http.put(`/productos/${id}`, dto);
  return data;
}

/** --- Hooks React Query --- */
export function useProducts(params?: ListParams) {
  return useQuery({
    queryKey: ["products", params],
    queryFn: () => fetchProducts(params),
    placeholderData: keepPreviousData,
  });
}

export function useProduct(id?: number) {
  return useQuery({
    queryKey: ["product", id],
    queryFn: () => fetchProduct(id as number),
    enabled: !!id,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useUpdateProduct(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: Partial<Product>) => updateProduct(id, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product", id] });
    },
  });
}
