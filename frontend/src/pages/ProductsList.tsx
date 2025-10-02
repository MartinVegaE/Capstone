import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '../api';
import ProductsFilterBar from '../components/ProductsFilterBar';
import MovementsModal from '../components/MovementsModal';
import ProductFormModal from '../components/ProductFormModal';
import type { ProductFilters } from '../types/filters';
import { DEFAULT_PRODUCT_FILTERS } from '../types/filters';

/* Helpers URL */
function filtersToSearch(f: ProductFilters, page: number, pageSize: number) {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.minStock != null) p.set('minStock', String(f.minStock));
  if (f.maxStock != null) p.set('maxStock', String(f.maxStock));
  if (f.soloBajoStock) p.set('soloBajoStock', '1');
  if (f.sortBy !== 'name') p.set('sortBy', f.sortBy);
  if (f.sortDir !== 'asc') p.set('sortDir', f.sortDir);
  if (page !== 1) p.set('page', String(page));
  if (pageSize !== 20) p.set('pageSize', String(pageSize));
  return p.toString();
}
function searchToFilters(search: string): { filters: Partial<ProductFilters>; page?: number } {
  const u = new URLSearchParams(search);
  const res: Partial<ProductFilters> = {};
  const q = u.get('q'); if (q) res.q = q;
  const min = u.get('minStock'); if (min != null) res.minStock = Number(min);
  const max = u.get('maxStock'); if (max != null) res.maxStock = Number(max);
  const bajo = u.get('soloBajoStock'); if (bajo) res.soloBajoStock = bajo === '1' || bajo === 'true';
  const sb = u.get('sortBy'); if (sb) res.sortBy = sb as any;
  const sd = u.get('sortDir'); if (sd) res.sortDir = (sd === 'desc' ? 'desc' : 'asc');
  const page = u.get('page');
  return { filters: res, page: page ? Number(page) : undefined };
}

/* Tipos */
type Product = { id:number; name:string; sku:string; stock:number };
type ListResp = { items: Product[]; page:number; pageSize:number; total:number };

export default function ProductsList() {
  const qc = useQueryClient();

  const [filters, setFilters] = useState<ProductFilters>(DEFAULT_PRODUCT_FILTERS);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Cargar desde URL
  useEffect(() => {
    const { filters: f, page: pg } = searchToFilters(window.location.search);
    if (Object.keys(f).length) setFilters((prev) => ({ ...prev, ...f }));
    if (pg && pg > 0) setPage(pg);
  }, []);

  // Debounce de URL
  const urlTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  useEffect(() => {
    if (urlTimerRef.current) window.clearTimeout(urlTimerRef.current);
    urlTimerRef.current = window.setTimeout(() => {
      const qs = filtersToSearch(filters, page, pageSize);
      const url = qs ? `?${qs}` : window.location.pathname;
      window.history.replaceState(null, '', url);
      urlTimerRef.current = null;
    }, 250);
    return () => { if (urlTimerRef.current) window.clearTimeout(urlTimerRef.current); };
  }, [filters, page, pageSize]);

  // Clave estable (sin objetos anidados mutando cada render)
  const listKey = useMemo(
    () => [
      'productos',
      filters.q,
      filters.minStock ?? '',
      filters.maxStock ?? '',
      filters.soloBajoStock ? 1 : 0,
      filters.sortBy,
      filters.sortDir,
      page,
      pageSize,
    ] as const,
    [filters.q, filters.minStock, filters.maxStock, filters.soloBajoStock, filters.sortBy, filters.sortDir, page, pageSize]
  );

  const qList = useQuery({
    queryKey: listKey,
    queryFn: async (): Promise<ListResp> => {
      const params = new URLSearchParams();
      if (filters.q) params.set('q', filters.q);
      if (filters.minStock != null) params.set('minStock', String(filters.minStock));
      if (filters.maxStock != null) params.set('maxStock', String(filters.maxStock));
      if (filters.soloBajoStock) params.set('soloBajoStock','true');
      params.set('sortBy', filters.sortBy);
      params.set('sortDir', filters.sortDir);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      const { data } = await api.get<ListResp>(`/productos?${params.toString()}`);
      return data;
    },
    placeholderData: keepPreviousData,
  });

  const adjustStock = useMutation({
    mutationFn: async ({ id, newStock }: { id:number; newStock:number }) => {
      const safe = Math.max(0, newStock);
      await api.patch(`/productos/${id}/stock`, { set: safe });
      return { id, safe };
    },
    onMutate: async ({ id, newStock }) => {
      const safe = Math.max(0, newStock);
      await qc.cancelQueries({ queryKey: listKey });
      const previous = qc.getQueryData<ListResp>(listKey);
      if (previous) {
        qc.setQueryData<ListResp>(listKey, {
          ...previous,
          items: previous.items.map((p) => (p.id === id ? { ...p, stock: safe } : p)),
        });
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(listKey, ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['productos'] });
    },
  });

  const [histId, setHistId] = useState<number|null>(null);

  // Modal crear/editar
  const [formMode, setFormMode] = useState<'create'|'edit'|null>(null);
  const [editItem, setEditItem] = useState<Product | null>(null);

  const openCreate = () => { setFormMode('create'); setEditItem(null); };
  const openEdit = (p: Product) => { setFormMode('edit'); setEditItem(p); };
  const closeForm = () => { setFormMode(null); setEditItem(null); };

  // Para evitar reseteos de página en cada tecla, reset sólo cuando cambian filtros (vía callback memorizado)
  const onFiltersChange = useCallback((v: ProductFilters) => {
    setFilters(v);
    setPage(1);
  }, []);

  const totalPages = qList.data ? Math.max(1, Math.ceil(qList.data.total / pageSize)) : 1;

  return (
    <div style={{ padding:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <h2 style={{ margin: 0 }}>Productos</h2>
        <button onClick={openCreate}>+ Nuevo producto</button>
      </div>

      <ProductsFilterBar value={filters} onChange={onFiltersChange} />

      {qList.isLoading && <p>Cargando…</p>}
      {qList.isError && <p>Error al cargar</p>}

      {qList.data && (
        <>
          <p style={{ color:'#666' }}>
            Mostrando {qList.data.items.length} de {qList.data.total} (página {qList.data.page}/{totalPages})
          </p>
          <ul style={{ display:'grid', gap:8, padding:0, listStyle:'none' }}>
            {qList.data.items.map(p=>(
              <li key={p.id} style={{ border:'1px solid #eee', borderRadius:10, padding:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10 }}>
                  <div>
                    <strong>{p.name}</strong><br/>
                    <small>SKU: {p.sku}</small>
                  </div>
                  <div style={{ display:'flex', alignItems:'center' }}>
                    <button onClick={()=>adjustStock.mutate({ id: p.id, newStock: p.stock - 1 })}>-</button>
                    <span style={{ padding:'0 8px' }}><b>Stock:</b> {p.stock}</span>
                    <button onClick={()=>adjustStock.mutate({ id: p.id, newStock: p.stock + 1 })}>+</button>
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={()=>setHistId(p.id)}>Ver historial</button>
                    <button onClick={()=>openEdit(p)}>Editar</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:12 }}>
            <button onClick={()=>setPage(p=>Math.max(1, p-1))} disabled={page<=1}>← Anterior</button>
            <span>Página {page} de {totalPages}</span>
            <button onClick={()=>setPage(p=>Math.min(totalPages, p+1))} disabled={page>=totalPages}>Siguiente →</button>
          </div>
        </>
      )}

      {histId != null && <MovementsModal productId={histId} onClose={()=>setHistId(null)} />}

      {formMode && (
        <ProductFormModal
          mode={formMode}
          initial={editItem}
          onClose={closeForm}
        />
      )}
    </div>
  );
}
