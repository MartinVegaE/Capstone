// frontend/src/api/products.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:4000";

const PRODUCTS_URL = `${API_BASE_URL}/productos`;

/**
 * Tipo que viene REALMENTE del backend (Prisma Product)
 */
type BackendProductKind = "CONSUMABLE" | "TOOL" | "FIXED_ASSET";

type BackendProduct = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  unit: string;
  kind: BackendProductKind;
  isActive: boolean;
  minStock: number | null;
  maxStock: number | null;
  categoryId: number | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Tipo que usa la UI (el mismo que esperaba tu ProductsPage viejo)
 */
export type Product = {
  id: number;
  sku: string;
  nombre: string;
  marca?: string | null;
  categoria?: string | null;
  stock?: number | null;
};

/**
 * Respuesta que espera ProductsPage:
 * { total, data }
 */
type ProductsListResult = {
  total: number;
  data: Product[];
};

type SortBy = "sku" | "nombre" | "marca" | "categoria" | "stock";
type SortDir = "asc" | "desc";

export type ProductsQueryParams = {
  q?: string;
  page?: number;
  pageSize?: number;
  brand?: string;
  category?: string;
  sortBy?: SortBy;
  sortDir?: SortDir;
};

/* Helpers */

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Error HTTP ${res.status}`;
    try {
      const data: any = await res.json();
      if (data?.message) message = data.message;
      if (data?.error) message = data.error;
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

/**
 * Mapeo de Producto del backend -> Producto de la UI
 * Por ahora marca/categoria/stock se simulan hasta que tengamos esas tablas.
 */
function mapFromBackend(p: BackendProduct): Product {
  return {
    id: p.id,
    sku: p.code,           // 👈 sku UI = code backend
    nombre: p.name,        // 👈 nombre UI = name backend
    marca: null,           // TODO: conectar cuando exista campo real
    categoria: null,       // idem
    stock: 0,              // TODO: se calculará desde ProductStock
  };
}

/* QUERY: listar productos con filtros + paginado en memoria */

export function useProducts(params: ProductsQueryParams) {
  const { q, page = 1, pageSize = 10, brand, category, sortBy, sortDir } =
    params;

  return useQuery<ProductsListResult>({
    queryKey: ["products", { q, page, pageSize, brand, category, sortBy, sortDir }],
    queryFn: async () => {
      const url = new URL(PRODUCTS_URL);

      // Por ahora no dependemos del search del backend
      url.searchParams.set("onlyActive", "true");

      const res = await fetch(url.toString());
      const backendItems = await handleResponse<BackendProduct[]>(res);

      // 1) Mapeamos a tipo de UI
      let items = backendItems.map(mapFromBackend);

      // 2) Filtro de búsqueda en el FRONT
      if (q && q.trim() !== "") {
        const term = q.trim().toLowerCase();
        items = items.filter((p) => {
          const sku = (p.sku ?? "").toLowerCase();
          const nombre = (p.nombre ?? "").toLowerCase();
          return sku.includes(term) || nombre.includes(term);
        });
      }

      // 3) Filtros de marca/categoría
      if (brand) {
        items = items.filter(
          (p) => (p.marca ?? "").toLowerCase() === brand.toLowerCase()
        );
      }

      if (category) {
        items = items.filter(
          (p) => (p.categoria ?? "").toLowerCase() === category.toLowerCase()
        );
      }

      // 4) Ordenamiento en memoria
      const sb: SortBy = sortBy ?? "nombre";
      const sd: SortDir = sortDir ?? "asc";

      items.sort((a, b) => {
        const dirFactor = sd === "asc" ? 1 : -1;

        const getVal = (p: Product): any => {
          switch (sb) {
            case "sku":
              return p.sku ?? "";
            case "nombre":
              return p.nombre ?? "";
            case "marca":
              return p.marca ?? "";
            case "categoria":
              return p.categoria ?? "";
            case "stock":
              return Number(p.stock ?? 0);
            default:
              return "";
          }
        };

        const va = getVal(a);
        const vb = getVal(b);

        if (typeof va === "number" || typeof vb === "number") {
          const na = Number(va);
          const nb = Number(vb);
          if (na === nb) return 0;
          return na < nb ? -1 * dirFactor : 1 * dirFactor;
        }

        const sa = String(va);
        const sbv = String(vb);
        const cmp = sa.localeCompare(sbv, "es", { sensitivity: "base" });
        return cmp * dirFactor;
      });

      // 5) Paginado en memoria
      const total = items.length;
      const start = (page - 1) * pageSize;
      const data = items.slice(start, start + pageSize);

      return { total, data };
    },
  });
}
  

/* MUTATION: actualizar producto (solo code / name por ahora) */

export function useUpdateProduct(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["productUpdate", id],
    mutationFn: async (dto: Partial<Product>) => {
      if (!id) {
        throw new Error("ID inválido para actualizar producto");
      }

      const payload: Partial<BackendProduct> = {};

      // Solo actualizamos los campos que realmente existen en el backend
      if (dto.sku !== undefined) payload.code = dto.sku;
      if (dto.nombre !== undefined) payload.name = dto.nombre;

      const res = await fetch(`${PRODUCTS_URL}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const updated = await handleResponse<BackendProduct>(res);
      return mapFromBackend(updated);
    },
    onSuccess: () => {
      // Refrescar listas de productos
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["productCreate"],
    mutationFn: async (dto: Partial<Product>) => {
      const code = dto.sku ?? "";
      const name = dto.nombre ?? "";

      if (!code || !name) {
        throw new Error("SKU y nombre son obligatorios para crear producto");
      }

      const payload: Partial<BackendProduct> = {
        code,
        name,
        // valores por defecto mínimos
        unit: "UN",
        kind: "CONSUMABLE",
        minStock: null,
        maxStock: null,
      };

      const res = await fetch(PRODUCTS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const created = await handleResponse<BackendProduct>(res);
      return mapFromBackend(created);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
