import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '../api';

type MovementType = 'IN' | 'OUT' | 'ADJUST' | 'SET';

type StockMovement = {
  id: number;
  productId: number;
  type: MovementType;
  delta: number;
  before: number;
  after: number;
  reason?: string | null;
  source?: string | null;
  actor?: string | null;
  createdAt: string; // ISO
};

type MovementsResp = {
  items: StockMovement[];
  page: number;
  pageSize: number;
  total: number;
};

export default function MovementsModal({
  productId,
  onClose,
}: {
  productId: number;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const q = useQuery({
    queryKey: ['producto-movimientos', productId, page, pageSize],
    queryFn: async (): Promise<MovementsResp> => {
      const { data } = await api.get<MovementsResp>(
        `/productos/${productId}/movimientos?page=${page}&pageSize=${pageSize}`
      );
      return data;
    },
    // v5: reemplaza keepPreviousData: true
    placeholderData: keepPreviousData,
  });

  const totalPages = useMemo(
    () => (q.data ? Math.max(1, Math.ceil(q.data.total / pageSize)) : 1),
    [q.data, pageSize]
  );

  // Cerrar con ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      aria-modal
      role="dialog"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
        display: 'grid', placeItems: 'center', zIndex: 9999,
      }}
    >
      <div
        style={{
          width: 'min(920px, 95vw)',
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,.25)',
          overflow: 'hidden',
        }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottom: '1px solid #eee' }}>
          <h3 style={{ margin: 0 }}>Historial de movimientos</h3>
          <button onClick={onClose} aria-label="Cerrar">✕</button>
        </header>

        <div style={{ padding: 12 }}>
          {q.isLoading && <p>Cargando…</p>}
          {q.isError && <p>Ocurrió un error al cargar el historial.</p>}

          {q.data && q.data.items.length === 0 && (
            <p style={{ color: '#666' }}>Sin movimientos registrados.</p>
          )}

          {q.data && q.data.items.length > 0 && (
            <div style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Fecha</th>
                    <th style={th}>Tipo</th>
                    <th style={th}>Δ</th>
                    <th style={th}>Antes</th>
                    <th style={th}>Después</th>
                    <th style={th}>Motivo</th>
                    <th style={th}>Origen</th>
                    <th style={th}>Actor</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.items.map((m) => (
                    <tr key={m.id}>
                      <td style={td}>{new Date(m.createdAt).toLocaleString()}</td>
                      <td style={td}><Badge kind={m.type} /></td>
                      <td style={td} title={`${m.delta}`}>
                        <span style={{ fontWeight: 600, color: m.delta > 0 ? '#0a7f2e' : m.delta < 0 ? '#b01515' : '#555' }}>
                          {m.delta > 0 ? `+${m.delta}` : m.delta}
                        </span>
                      </td>
                      <td style={td}>{m.before}</td>
                      <td style={td}>{m.after}</td>
                      <td style={td}>{m.reason ?? '—'}</td>
                      <td style={td}>{m.source ?? '—'}</td>
                      <td style={td}>{m.actor ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <footer style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>← Anterior</button>
            <span>Página {page} de {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Siguiente →</button>
          </footer>
        </div>
      </div>
    </div>
  );
}

const th: CSSProperties = { textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #eee', padding: '8px 6px', whiteSpace: 'nowrap' };
const td: CSSProperties = { borderBottom: '1px solid #f1f1f1', padding: '8px 6px', whiteSpace: 'nowrap' };

function Badge({ kind }: { kind: MovementType }) {
  const bg =
    kind === 'IN' ? '#e8f6ee' :
    kind === 'OUT' ? '#fdeceb' :
    kind === 'ADJUST' ? '#eef4ff' :
    '#f5f7fa';
  const color =
    kind === 'IN' ? '#0a7f2e' :
    kind === 'OUT' ? '#b01515' :
    kind === 'ADJUST' ? '#264cb3' :
    '#444';
  return (
    <span style={{ background: bg, color, padding: '2px 8px', borderRadius: 999, fontSize: 12 }}>
      {kind}
    </span>
  );
}
