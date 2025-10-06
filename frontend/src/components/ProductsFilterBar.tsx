import type { ProductFilters } from '../types/filters';

type Props = {
  value: ProductFilters;
  onChange: (v: ProductFilters) => void;
};

export default function ProductsFilterBar({ value, onChange }: Props) {
  const set = <K extends keyof ProductFilters>(k: K, v: ProductFilters[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div style={{ display:'grid', gap:8, marginBottom:12 }}>
      <input
        value={value.q}
        onChange={(e) => set('q', e.target.value)}
        placeholder="Buscar por nombre o SKU…"
      />

      <label style={{ userSelect:'none' }}>
        <input
          type="checkbox"
          checked={value.soloBajoStock}
          onChange={(e) => set('soloBajoStock', e.target.checked)}
        />{' '}
        Bajo stock
      </label>
    </div>
  );
}
