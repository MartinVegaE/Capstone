import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { crearIngreso } from "../api/ingresos";

type Props = { open: boolean; onClose: () => void };

// puedes cambiar estas opciones si quieres
const BODEGAS = ["Bodega A", "Bodega B", "Bodega C", "Otra…"];

export default function CreateProductModal({ open, onClose }: Props) {
  const qc = useQueryClient();
  const firstRef = useRef<HTMLInputElement>(null);

  const [sku, setSku] = useState("");
  const [nombre, setNombre] = useState("");
  const [codigoBarras, setCodigoBarras] = useState("");
  const [marca, setMarca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [bodega, setBodega] = useState(BODEGAS[0]);
  const [bodegaOtra, setBodegaOtra] = useState("");
  const [stockInicial, setStockInicial] = useState<number>(0);
  const [costoUnitario, setCostoUnitario] = useState<number>(0);

  useEffect(() => {
    if (open) setTimeout(() => firstRef.current?.focus(), 0);
    else {
      setSku(""); setNombre(""); setCodigoBarras("");
      setMarca(""); setCategoria("");
      setBodega(BODEGAS[0]); setBodegaOtra("");
      setStockInicial(0); setCostoUnitario(0);
    }
  }, [open]);

  const ubicacion = useMemo(
    () => (bodega === "Otra…" ? bodegaOtra.trim() : bodega),
    [bodega, bodegaOtra]
  );

  const crear = useMutation({
    mutationFn: async () => {
      // 1) Crear el producto
      const payload = {
        sku: sku.trim(),
        nombre: nombre.trim(),
        codigoBarras: codigoBarras.trim() || undefined,
        marca: marca.trim() || undefined,
        categoria: categoria.trim() || undefined,
        ubicacion: ubicacion || undefined,
        stock: 0, // siempre 0, el stock inicial entra vía /ingresos
      };
      const { data: creado } = await api.post("/productos", payload);

      // 2) Si hay stock inicial, registramos ingreso con costo
      if (stockInicial > 0) {
        await crearIngreso({
          items: [
            {
              productoId: creado.id,
              cantidad: stockInicial,
              costoUnitario: Math.max(0, Number(costoUnitario) || 0),
            },
          ],
        });
      }

      return creado;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["productos"] });
      onClose();
    },
  });

  if (!open) return null;

  return (
    <div className="simodal-overlay" role="dialog" aria-modal="true" aria-labelledby="cp-title">
      <div className="simodal-card">
        <div className="simodal-header">
          <h2 id="cp-title">Nuevo producto</h2>
          <button className="simodal-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        <div className="simodal-body">
          <div className="cp-grid">
            <div className="field">
              <label>SKU <span className="req">*</span></label>
              <input ref={firstRef} value={sku} onChange={e => setSku(e.target.value)} disabled={crear.isPending}/>
            </div>
            <div className="field">
              <label>Nombre <span className="req">*</span></label>
              <input value={nombre} onChange={e => setNombre(e.target.value)} disabled={crear.isPending}/>
            </div>
            <div className="field">
              <label>Código de barras</label>
              <input value={codigoBarras} onChange={e => setCodigoBarras(e.target.value)} disabled={crear.isPending}/>
            </div>
            <div className="field">
              <label>Marca</label>
              <input value={marca} onChange={e => setMarca(e.target.value)} disabled={crear.isPending}/>
            </div>
            <div className="field">
              <label>Categoría</label>
              <input value={categoria} onChange={e => setCategoria(e.target.value)} disabled={crear.isPending}/>
            </div>

            <div className="field">
              <label>Bodega</label>
              <select value={bodega} onChange={e => setBodega(e.target.value)} disabled={crear.isPending}>
                {BODEGAS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            {bodega === "Otra…" && (
              <div className="field">
                <label>Otra bodega</label>
                <input value={bodegaOtra} onChange={e => setBodegaOtra(e.target.value)} disabled={crear.isPending}/>
              </div>
            )}

            <div className="field">
              <label>Stock inicial</label>
              <input type="number" min={0} value={stockInicial}
                     onChange={e => setStockInicial(Math.max(0, Number(e.target.value) || 0))}
                     disabled={crear.isPending}/>
            </div>

            <div className="field">
              <label>Costo unitario (CLP)</label>
              <input type="number" min={0} step="0.01" value={costoUnitario}
                     onChange={e => setCostoUnitario(Math.max(0, Number(e.target.value) || 0))}
                     disabled={crear.isPending || stockInicial <= 0}/>
              <small>{stockInicial > 0 ? "Se registrará como ingreso para calcular PPP." : "Ingresa stock > 0 para habilitar costo."}</small>
            </div>
          </div>
        </div>

        <div className="simodal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={crear.isPending}>Cancelar</button>
          <button
            className="btn-primary"
            onClick={() => {
              if (!sku.trim() || !nombre.trim()) return alert("SKU y Nombre son obligatorios");
              if (stockInicial > 0 && costoUnitario < 0) return alert("El costo debe ser ≥ 0");
              crear.mutate();
            }}
            disabled={crear.isPending}
          >
            {crear.isPending ? "Creando..." : "Crear producto"}
          </button>
        </div>
      </div>

      <style>{`
        .simodal-overlay{ position:fixed; inset:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; padding:16px; z-index:9999 }
        .simodal-card{ width:min(860px,100%); background:#fff; border-radius:16px; box-shadow:0 20px 60px rgba(0,0,0,.2); overflow:hidden }
        .simodal-header{ display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid #eee }
        .simodal-close{ border:0; background:#f3f4f6; width:32px; height:32px; border-radius:8px; cursor:pointer; font-size:20px }
        .simodal-body{ padding:16px 20px; }
        .cp-grid{ display:grid; grid-template-columns: repeat(2, 1fr); gap:12px; }
        @media (max-width:720px){ .cp-grid{ grid-template-columns: 1fr; } }
        .field{ display:flex; flex-direction:column; gap:6px }
        .field input, .field select{ border:1px solid #e5e7eb; border-radius:10px; padding:10px 12px; font-size:14px; outline:none }
        .simodal-footer{ padding:14px 20px; border-top:1px solid #eee; display:flex; justify-content:flex-end; gap:8px; }
        .btn-primary{ background:#111827; color:#fff; border:0; padding:10px 14px; border-radius:10px; cursor:pointer }
        .btn-secondary{ background:#f3f4f6; color:#111; border:0; padding:10px 14px; border-radius:10px; cursor:pointer }
        .req{ color:#ef4444 }
      `}</style>
    </div>
  );
}
