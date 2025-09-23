import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import axios, { AxiosError } from "axios";
import { useState } from "react";


type Producto = { id: number; sku: string; nombre: string; stock: number };

const qc = new QueryClient();

function CrearProducto() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    sku: "", nombre: "", stock: 0,
    marca: "", categoria: "", ubicacion: "", codigoBarras: ""
  });
  const [msg, setMsg] = useState("");

  const crearMut = useMutation({
    mutationFn: async () => {
      const payload = {
        sku: form.sku,
        nombre: form.nombre,
        stock: Number(form.stock) || 0,
        marca: form.marca || undefined,
        categoria: form.categoria || undefined,
        ubicacion: form.ubicacion || undefined,
        codigoBarras: form.codigoBarras || undefined
      };
      const { data } = await api.post("/productos", payload);
      return data;
    },
    onSuccess: async () => {
      setMsg("✅ Producto creado");
      setForm({ sku: "", nombre: "", stock: 0, marca: "", categoria: "", ubicacion: "", codigoBarras: "" });
      await qc.invalidateQueries({ queryKey: ["productos"] });
    },
    onError: (err: any) => {
      setMsg("❌ " + (err?.response?.data?.error ?? err.message));
    }
  });

  function onChange<K extends keyof typeof form>(k: K, v: string | number) {
    setForm(prev => ({ ...prev, [k]: v as any }));
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); setMsg(""); crearMut.mutate(); }}
          style={{ marginBottom: 16, display: "grid", gap: 8 }}>
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
        <input placeholder="SKU *" value={form.sku} onChange={e => onChange("sku", e.target.value)} required />
        <input placeholder="Nombre *" value={form.nombre} onChange={e => onChange("nombre", e.target.value)} required />
        <input placeholder="Marca" value={form.marca} onChange={e => onChange("marca", e.target.value)} />
        <input placeholder="Categoría" value={form.categoria} onChange={e => onChange("categoria", e.target.value)} />
        <input placeholder="Ubicación" value={form.ubicacion} onChange={e => onChange("ubicacion", e.target.value)} />
        <input placeholder="Código de barras" value={form.codigoBarras} onChange={e => onChange("codigoBarras", e.target.value)} />
        <input type="number" placeholder="Stock" value={form.stock}
               onChange={e => onChange("stock", Number(e.target.value))} min={0} />
      </div>

      <button type="submit" disabled={crearMut.isPending}>
        {crearMut.isPending ? "Creando..." : "Crear producto"}
      </button>
      {msg && <small>{msg}</small>}
    </form>
  );
}


function Productos() {
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["productos", search],
    queryFn: async (): Promise<Producto[]> =>
      (await api.get("/productos", { params: { search } })).data,
  });

  if (isLoading) return <p>Cargando…</p>;
  if (error) return <p style={{ color: "crimson" }}>Error al cargar</p>;

  return (
    <main style={{ maxWidth: 960, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>Productos</h1>

      <CrearProducto />

      <div style={{ margin: "12px 0" }}>
        <input
          placeholder="Buscar por nombre, SKU o código de barras"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
        />
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {(data ?? []).map((p) => (
          <article key={p.id} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
            <h3 style={{ margin: 0 }}>{p.nombre}</h3>
            <p style={{ margin: "6px 0" }}>SKU: {p.sku}</p>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <button
                onClick={async () => {
                  const nuevo = Math.max(0, (p.stock ?? 0) - 1);
                  await api.patch(`/productos/${p.id}`, { stock: nuevo });
                  await qc.invalidateQueries({ queryKey: ["productos"] });
                }}
              >−</button>

    <strong style={{ minWidth: 60, textAlign: "center" }}>Stock: {p.stock}</strong>

    <button
      onClick={async () => {
        const nuevo = (p.stock ?? 0) + 1;
        await api.patch(`/productos/${p.id}`, { stock: nuevo });
        await qc.invalidateQueries({ queryKey: ["productos"] });
      }}
    >+</button>

    <div style={{ flex: 1 }} />

    <button
      style={{ color: "#a00" }}
      onClick={async () => {
        if (!confirm(`¿Eliminar "${p.nombre}"?`)) return;
        await api.delete(`/productos/${p.id}`);
        await qc.invalidateQueries({ queryKey: ["productos"] });
      }}
    >
      Eliminar
    </button>
  </div>
</article>


        ))}
      </div>
    </main>
  );
}


export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <Productos />
    </QueryClientProvider>
  );
}
