type FiltersType = {
  q: string;
  minStock?: number;
  maxStock?: number;
  soloBajoStock: boolean;
  sortBy: 'name' | 'sku' | 'stock' | 'createdAt';
  sortDir: 'asc' | 'desc'; // 👈 antes era string
};


export default function ProductsFilterBar({
  value,
  onChange,
}: {
  value: FiltersType;
  onChange: (v: FiltersType) => void;
}) {
  const v = value;
  const set = (patch: Partial<FiltersType>) => onChange({ ...v, ...patch });

  return (
    <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr repeat(5, max-content)" }}>
      <input
        placeholder="Buscar por nombre o SKU…"
        value={v.q}
        onChange={(e) => set({ q: e.target.value })}
        style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
      />
      <input
        type="number"
        placeholder="Min stock"
        value={v.minStock ?? ""}
        onChange={(e) => set({ minStock: e.target.value ? Number(e.target.value) : undefined })}
        style={{ width: 120, padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
      />
      <input
        type="number"
        placeholder="Max stock"
        value={v.maxStock ?? ""}
        onChange={(e) => set({ maxStock: e.target.value ? Number(e.target.value) : undefined })}
        style={{ width: 120, padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
      />
      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="checkbox"
          checked={v.soloBajoStock}
          onChange={(e) => set({ soloBajoStock: e.target.checked })}
        />
        Bajo stock
      </label>
      <select
        value={v.sortBy}
        onChange={(e) => set({ sortBy: e.target.value as FiltersType["sortBy"] })}
        style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
      >
        <option value="name">Nombre</option>
        <option value="sku">SKU</option>
        <option value="stock">Stock</option>
        <option value="createdAt">Creación</option>
      </select>
      <select
        value={v.sortDir}
        onChange={(e) => set({ sortDir: e.target.value as FiltersType["sortDir"] })}
        style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
      >
        <option value="asc">Asc</option>
        <option value="desc">Desc</option>
      </select>
    </div>
  );
}
