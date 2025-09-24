import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { api } from '../api';

type Movement = {
  id:number; type:'IN'|'OUT'|'ADJUST'|'SET'; delta:number; before:number; after:number;
  reason?:string|null; source?:string|null; actor?:string|null; createdAt:string;
};
type Resp = { items:Movement[]; page:number; pageSize:number; total:number };

export default function MovementsModal({ productId, onClose }: { productId:number; onClose:()=>void }) {
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const q = useQuery({
    queryKey: ['movimientos', productId, page, pageSize],
    queryFn: async (): Promise<Resp> => {
      const params = new URLSearchParams({ page:String(page), pageSize:String(pageSize) });
      const { data } = await api.get<Resp>(`/productos/${productId}/movimientos?${params.toString()}`);
      return data;
    }
  });

  useEffect(()=> {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const totalPages = q.data ? Math.max(1, Math.ceil(q.data.total / pageSize)) : 1;

  const content = (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', display:'grid', placeItems:'center', zIndex:9999 }}
         onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:12, width:'min(900px,92vw)', maxHeight:'80vh', overflow:'auto', padding:16 }}
           onClick={(e)=>e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <h3 style={{ margin:0 }}>Historial de stock</h3>
          <button onClick={onClose}>✕</button>
        </div>

        {q.isLoading && <p>Cargando…</p>}
        {q.isError && <p>Error al cargar</p>}

        {q.data && (
          <>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ textAlign:'left', borderBottom:'1px solid #eee' }}>
                  <th style={{ padding:'8px 4px' }}>Fecha</th>
                  <th style={{ padding:'8px 4px' }}>Tipo</th>
                  <th style={{ padding:'8px 4px' }}>Δ</th>
                  <th style={{ padding:'8px 4px' }}>Antes</th>
                  <th style={{ padding:'8px 4px' }}>Después</th>
                  <th style={{ padding:'8px 4px' }}>Motivo</th>
                  <th style={{ padding:'8px 4px' }}>Fuente</th>
                  <th style={{ padding:'8px 4px' }}>Actor</th>
                </tr>
              </thead>
              <tbody>
                {q.data.items.map(m=>(
                  <tr key={m.id} style={{ borderBottom:'1px solid #f2f2f2' }}>
                    <td style={{ padding:'8px 4px', whiteSpace:'nowrap' }}>{new Date(m.createdAt).toLocaleString()}</td>
                    <td style={{ padding:'8px 4px' }}>{m.type}</td>
                    <td style={{ padding:'8px 4px' }}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                    <td style={{ padding:'8px 4px' }}>{m.before}</td>
                    <td style={{ padding:'8px 4px' }}>{m.after}</td>
                    <td style={{ padding:'8px 4px' }}>{m.reason ?? '—'}</td>
                    <td style={{ padding:'8px 4px' }}>{m.source ?? '—'}</td>
                    <td style={{ padding:'8px 4px' }}>{m.actor ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display:'flex', alignItems:'center', marginTop:12 }}>
              <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1}>← Anterior</button>
              <span style={{ padding:'0 8px' }}>Página {page} de {totalPages}</span>
              <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page>=totalPages}>Siguiente →</button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
