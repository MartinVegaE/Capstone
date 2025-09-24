import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import ProductsFilterBar from '../components/ProductsFilterBar';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import MovementsModal from '../components/MovementsModal.tsx';

type Product = { id:number; name:string; sku:string; stock:number };
type ListResp = { items: Product[]; page:number; pageSize:number; total:number };

export default function ProductsList() {
  const qc = useQueryClient();

  const [filters, setFilters] = useState<{
    q: string;
    minStock: number | undefined;
    maxStock: number | undefined;
    soloBajoStock: boolean;
    sortBy: 'name' | 'sku' | 'stock' | 'createdAt';
    sortDir: 'asc' | 'desc';
  }>({
    q: '',
    minStock: undefined,
    maxStock: undefined,
    soloBajoStock: false,
    sortBy: 'name',
    sortDir: 'asc'
  });
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const debouncedQ = useDebouncedValue(filters.q, 400);
  const effective = { ...filters, q: debouncedQ };

  const qList = useQuery({
    queryKey: ['productos', effective, page, pageSize],
    queryFn: async (): Promise<ListResp> => {
      const params = new URLSearchParams();
      if (effective.q) params.set('q', effective.q);
      if (effective.minStock != null) params.set('minStock', String(effective.minStock));
      if (effective.maxStock != null) params.set('maxStock', String(effective.maxStock));
      if (effective.soloBajoStock) params.set('soloBajoStock','true');
      params.set('sortBy', effective.sortBy);
      params.set('sortDir', effective.sortDir);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));

      const { data } = await api.get<ListResp>(`/productos?${params.toString()}`);
      return data;
    }
  });

  const adjustStock = useMutation({
    mutationFn: async ({ id, newStock }: { id:number; newStock:number }) => {
      await api.patch(`/productos/${id}/stock`, { set: Math.max(0, newStock) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos'] });
    }
  });

  const [histId, setHistId] = useState<number|null>(null);

  const totalPages = qList.data ? Math.max(1, Math.ceil(qList.data.total / pageSize)) : 1;

  return (
    <div style={{ padding:16 }}>
      <h2>Productos</h2>
      <ProductsFilterBar
        value={filters}
        onChange={(v) => {
          setFilters({
            ...v,
            minStock: v.minStock === undefined ? undefined : v.minStock,
            maxStock: v.maxStock === undefined ? undefined : v.maxStock,
          });
          setPage(1);
        }}
      />

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
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                  <div>
                    <strong>{p.name}</strong><br/>
                    <small>SKU: {p.sku}</small>
                  </div>

                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <button
                      onClick={()=>adjustStock.mutate({ id: p.id, newStock: p.stock - 1 })}
                      disabled={adjustStock.isPending}
                    >-</button>
                    <span><b>Stock:</b> {p.stock}</span>
                    <button
                      onClick={()=>adjustStock.mutate({ id: p.id, newStock: p.stock + 1 })}
                      disabled={adjustStock.isPending}
                    >+</button>
                  </div>

                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={()=>setHistId(p.id)}>Ver historial</button>
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

      {histId != null && (
        <MovementsModal productId={histId} onClose={()=>setHistId(null)} />
      )}
    </div>
  );
}
