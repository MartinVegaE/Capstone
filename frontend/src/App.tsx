import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { api } from "./api";
import axios, { AxiosError } from "axios";
import { useState } from "react";

type Producto = { id: number; sku: string; nombre: string; stock: number };

const qc = new QueryClient();

function CrearProducto() {
  const [form, setForm] = useState({ sku: "", nombre: "", stock: 0 });
  const [msg, setMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    try {
      await api.post("/productos", {
        sku: form.sku,
        nombre: form.nombre,
        stock: Number(form.stock) || 0,
      });
      setMsg("✅ Producto creado");
      setForm({ sku: "", nombre: "", stock: 0 });
      // refresca la lista si usas React Query:
      await qc.invalidateQueries({ queryKey: ["productos"] });
    } catch (err: any) {
      setMsg("❌ " + (err?.response?.data?.error ?? err.message));
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: 16, display: "grid", gap: 8 }}>
      <input
        placeholder="SKU"
        value={form.sku}
        onChange={e => setForm({ ...form, sku: e.target.value })}
        required
      />
      <input
        placeholder="Nombre"
        value={form.nombre}
        onChange={e => setForm({ ...form, nombre: e.target.value })}
        required
      />
      <input
        type="number"
        placeholder="Stock"
        value={form.stock}
        onChange={e => setForm({ ...form, stock: Number(e.target.value) })}
      />
      <button type="submit">Crear</button>
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
            <strong>Stock: {p.stock}</strong>
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
