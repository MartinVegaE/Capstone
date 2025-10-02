import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

type Product = { id: number; name: string; sku: string; stock: number };

type Props = {
  mode: 'create' | 'edit';
  initial?: Product | null;       // en edit, puedes pasar el producto actual
  onClose: () => void;
};

export default function ProductFormModal({ mode, initial, onClose }: Props) {
  const qc = useQueryClient();

  const [name, setName] = useState(initial?.name ?? '');
  const [sku, setSku] = useState(initial?.sku ?? '');
  const [stock, setStock] = useState<number>(initial?.stock ?? 0);
  const [errMsg, setErrMsg] = useState<string>('');
  const [okMsg, setOkMsg] = useState<string>('');

  const mCreate = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<Product>('/productos', { name, sku, stock });
      return data;
    },
    onSuccess: () => {
      setOkMsg('Producto creado con éxito');
      qc.invalidateQueries({ queryKey: ['productos'] });
      onClose();
    },
    onError: (err: any) => {
      if (err?.response?.status === 409) setErrMsg('El SKU ya existe');
      else setErrMsg('No se pudo crear el producto');
    },
  });

  const mUpdate = useMutation({
    mutationFn: async () => {
      if (!initial) throw new Error('No hay producto a editar');
      const { data } = await api.put<Product>(`/productos/${initial.id}`, { name, sku, stock });
      return data;
    },
    onSuccess: () => {
      setOkMsg('Producto actualizado');
      qc.invalidateQueries({ queryKey: ['productos'] });
      onClose();
    },
    onError: (err: any) => {
      if (err?.response?.status === 409) setErrMsg('El SKU ya existe');
      else setErrMsg('No se pudo actualizar el producto');
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg('');
    setOkMsg('');
    if (!name.trim() || !sku.trim()) {
      setErrMsg('Nombre y SKU son obligatorios');
      return;
    }
    if (stock < 0) {
      setErrMsg('El stock no puede ser negativo');
      return;
    }
    mode === 'create' ? mCreate.mutate() : mUpdate.mutate();
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h3 style={{ marginTop: 0 }}>
          {mode === 'create' ? 'Nuevo producto' : `Editar producto #${initial?.id}`}
        </h3>

        {errMsg && <div style={alertErr}>{errMsg}</div>}
        {okMsg && <div style={alertOk}>{okMsg}</div>}

        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 10 }}>
          <label>
            Nombre<br />
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <label>
            SKU<br />
            <input value={sku} onChange={(e) => setSku(e.target.value)} />
          </label>

          <label>
            Stock<br />
            <input
              type="number"
              value={stock}
              onChange={(e) => setStock(Math.max(0, Number(e.target.value)))}
            />
          </label>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} disabled={mCreate.isPending || mUpdate.isPending}>
              Cancelar
            </button>
            <button type="submit" disabled={mCreate.isPending || mUpdate.isPending}>
              {mode === 'create' ? 'Crear' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
};
const modalStyle: React.CSSProperties = {
  width: 'min(520px, 92vw)', background: '#fff', borderRadius: 12,
  padding: 16, boxShadow: '0 12px 36px rgba(0,0,0,.22)',
};
const alertErr: React.CSSProperties = {
  background: '#ffe9e9', color: '#a40000', border: '1px solid #ffb3b3',
  padding: '8px 10px', borderRadius: 6,
};
const alertOk: React.CSSProperties = {
  background: '#e9fff1', color: '#0a7a2f', border: '1px solid #a6e3bf',
  padding: '8px 10px', borderRadius: 6,
};
