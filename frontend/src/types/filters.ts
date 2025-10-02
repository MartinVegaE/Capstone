// src/types/filters.ts
export type SortDir = 'asc' | 'desc';
export type SortBy = 'name' | 'sku' | 'stock' | 'createdAt';

export interface ProductFilters {
  q: string;
  minStock?: number | null;
  maxStock?: number | null;
  soloBajoStock: boolean;
  sortBy: SortBy;
  sortDir: SortDir;
}

export const DEFAULT_PRODUCT_FILTERS: ProductFilters = {
  q: '',
  minStock: null,
  maxStock: null,
  soloBajoStock: false,
  sortBy: 'name',
  sortDir: 'asc',
};

// (opcional) alias por compatibilidad
export type FiltersType = ProductFilters;
export const DEFAULT_FILTERS = DEFAULT_PRODUCT_FILTERS;
