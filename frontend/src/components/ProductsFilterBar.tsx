import { useEffect, useState } from 'react';
import type { ProductFilters, SortDir } from '../types/filters';

type Props = {
  value: ProductFilters;
  onChange: (v: ProductFilters) => void;
};

export default function ProductsFilterBar({ value, onChange }: Props) {
  // Estado local solo para el input de búsqueda
  const [qLocal, setQLocal] = useState(value.q);

  // Si el padre cambia q (por URL o reset), sincronizamos el input
  useEffect(() => {
    setQLocal(value.q);
  }, [value.q]);

  // Debounce: empujar q al padre solo cuando el usuario termina de tipear
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (qLocal !== value.q) onChange({ ...value, q: qLocal });
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qLocal]);

  const set = <K extends keyof ProductFilters>(k: K, v: ProductFilters[K]) =>
    onChange({ ...value, [k]: v });

  const setSortDir = (dir: string) =>
    set('sortDir', (dir === 'desc' ? 'desc' : 'asc') as SortDir);

  const setSortBy = (sb: string) => {
    const allowed = ['name', 'sku', 'stock', 'createdAt'] as const;
    set('sortBy', (allowed.includes(sb as any) ? sb : 'name') as ProductFilters['sortBy']);
  };

  const toNumOrNull = (s: string) => (s.trim() === '' ? null : Number(s));

  return (
    <div className="filter-bar" style={{ display:'grid', gap:8, marginBottom:12 }}>
      <input
        value={qLocal}
        onChange={(e) => setQLocal(e.target.value)}
        placeholder="Buscar por nombre o SKU…"
      />

      <label style={{ userSelect:'none' }}>
        <input
          type="checkbox"
          checked={value.soloBajoStock}
          onChange={(e) => set('soloBajoStock', e.target.checked)}
        />{' '}
        Solo bajo stock
      </label>

      <div style={{ display:'flex', gap:8 }}>
        <input
          type="number"
          placeholder="Stock mínimo"
          value={value.minStock ?? ''}
          onChange={(e) => set('minStock', toNumOrNull(e.target.value))}
        />
        <input
          type="number"
          placeholder="Stock máximo"
          value={value.maxStock ?? ''}
          onChange={(e) => set('maxStock', toNumOrNull(e.target.value))}
        />
      </div>

      <div style={{ display:'flex', gap:8 }}>
        <select value={value.sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="name">Nombre</option>
          <option value="sku">SKU</option>
          <option value="stock">Stock</option>
          <option value="createdAt">Fecha</option>
        </select>

        <select value={value.sortDir} onChange={(e) => setSortDir(e.target.value)}>
          <option value="asc">Ascendente</option>
          <option value="desc">Descendente</option>
        </select>
      </div>
    </div>
  );
}
