import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { crearIngreso } from "../api/ingresos";

type IngresoItemDTO = {
  productoId: number;
  cantidad: number;
  costoUnitario: number;
  lote?: string;
  venceAt?: string; // yyyy-mm-dd
};


type ProductoLite = {
  id: number;
  sku: string;
  nombre: string;
  stock: number;
  ppp?: number | string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  producto: ProductoLite;
};

const clamp = (n: number, min: number) => (isNaN(n) ? min : Math.max(min, n));
const toNumber = (v: string) => {
  // Permite coma o punto como decimal; quita separadores de miles
  const cleaned = v.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
};

export default function StockIngressModal({ open, onClose, producto }: Props) {
  const qc = useQueryClient();
  const [cantidad, setCantidad] = useState<string>("");
  const [costo, setCosto] = useState<string>("");
  const [proveedor, setProveedor] = useState("");
  const [documento, setDocumento] = useState("");
  const [lote, setLote] = useState("");
  const [venceAt, setVenceAt] = useState<string>(""); // yyyy-mm-dd
  const [showExtras, setShowExtras] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Enfoca el primer input al abrir
  useEffect(() => {
    if (open) {
      setTimeout(() => firstInputRef.current?.focus(), 0);
    } else {
      // Limpia si cerraste
      setCantidad("");
      setCosto("");
      setProveedor("");
      setDocumento("");
      setLote("");
      setVenceAt("");
      setShowExtras(false);
    }
  }, [open]);

  const cantidadNum = useMemo(() => clamp(Math.floor(toNumber(cantidad)), 0), [cantidad]);
  const costoNum = useMemo(() => clamp(toNumber(costo), 0), [costo]);

  const pppActual = useMemo(() => {
    const n = Number(producto.ppp);
    return isNaN(n) ? 0 : n;
  }, [producto.ppp]);

  const pppPreview = useMemo(() => {
    if (!cantidadNum || !costoNum) return pppActual || 0;
    const stockActual = Number(producto.stock || 0);
    if (stockActual === 0) return costoNum;
    return (stockActual * (pppActual || 0) + cantidadNum * costoNum) / (stockActual + cantidadNum);
  }, [cantidadNum, costoNum, producto.stock, pppActual]);

  const mut = useMutation({
    mutationFn: async () => {
      const items: IngresoItemDTO[] = [
        {
          productoId: producto.id,
          cantidad: cantidadNum,
          costoUnitario: costoNum,
          ...(lote ? { lote } : {}),
          ...(venceAt ? { venceAt } : {}),
        },
      ];
      return crearIngreso({
        ...(proveedor ? { proveedor } : {}),
        ...(documento ? { documento } : {}),
        items,
      });
    },
    onSuccess: async () => {
      // Invalidamos todas las queries que empiecen con 'productos'
      await qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "productos" });
      onClose();
    },
  });

  if (!open) return null;

  return (
    <div className="simodal-overlay" role="dialog" aria-modal="true" aria-labelledby="simodal-title">
      <div className="simodal-card">
        <div className="simodal-header">
          <h2 id="simodal-title">Ingresar stock</h2>
          <button className="simodal-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        <div className="simodal-body">
          <div className="simodal-product">
            <div className="simodal-prod-title">{producto.nombre}</div>
            <div className="simodal-prod-meta">
              <span>SKU: <strong>{producto.sku}</strong></span>
              <span>Stock actual: <strong>{producto.stock}</strong></span>
              <span>PPP actual: <strong>${(pppActual || 0).toFixed(2)}</strong></span>
            </div>
          </div>

          <div className="simodal-grid">
            <div className="simodal-field">
              <label>Cantidad <span className="req">*</span></label>
              <input
                ref={firstInputRef}
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Ej: 10"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                disabled={mut.isPending}
              />
              <small>Entero ≥ 1</small>
            </div>

            <div className="simodal-field">
              <label>Costo unitario (CLP) <span className="req">*</span></label>
              <input
                inputMode="decimal"
                placeholder="Ej: 1990"
                value={costo}
                onChange={(e) => setCosto(e.target.value)}
                disabled={mut.isPending}
              />
              <small>Usa punto o coma para decimales.</small>
            </div>
          </div>

          <div className="simodal-preview">
            <div>Stock nuevo: <strong>{producto.stock + (cantidadNum || 0)}</strong></div>
            <div>PPP estimado: <strong>${(pppPreview || 0).toFixed(2)}</strong></div>
          </div>

          <button
            className="simodal-toggle"
            type="button"
            onClick={() => setShowExtras((s) => !s)}
            aria-expanded={showExtras}
          >
            {showExtras ? "Ocultar opciones" : "Opciones adicionales (proveedor, documento, lote, vence)"}
          </button>

          {showExtras && (
            <div className="simodal-extras">
              <div className="simodal-field">
                <label>Proveedor</label>
                <input
                  placeholder="Opcional"
                  value={proveedor}
                  onChange={(e) => setProveedor(e.target.value)}
                  disabled={mut.isPending}
                />
              </div>
              <div className="simodal-field">
                <label>Documento</label>
                <input
                  placeholder="Ej: FA-123 (opcional)"
                  value={documento}
                  onChange={(e) => setDocumento(e.target.value)}
                  disabled={mut.isPending}
                />
              </div>
              <div className="simodal-grid">
                <div className="simodal-field">
                  <label>Lote</label>
                  <input
                    placeholder="Opcional"
                    value={lote}
                    onChange={(e) => setLote(e.target.value)}
                    disabled={mut.isPending}
                  />
                </div>
                <div className="simodal-field">
                  <label>Vence</label>
                  <input
                    type="date"
                    value={venceAt}
                    onChange={(e) => setVenceAt(e.target.value)}
                    disabled={mut.isPending}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="simodal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={mut.isPending}>Cancelar</button>
          <button
            className="btn-primary"
            onClick={() => {
              if (cantidadNum <= 0 || costoNum < 0) {
                alert("Revisa cantidad (≥1) y costo (≥0).");
                return;
              }
              mut.mutate();
            }}
            disabled={mut.isPending}
          >
            {mut.isPending ? "Guardando..." : "Guardar ingreso"}
          </button>
        </div>
      </div>

      {/* Estilos aislados del modal */}
      <style>{`
        .simodal-overlay{
          position:fixed; inset:0; background:rgba(0,0,0,.5);
          display:flex; align-items:center; justify-content:center; z-index:9999;
          padding: 16px;
        }
        .simodal-card{
          width:min(720px,100%); background:#fff; border-radius:16px;
          box-shadow:0 20px 60px rgba(0,0,0,.2); overflow:hidden;
          animation:simodalIn .16s ease;
        }
        @keyframes simodalIn{ from{ transform:translateY(8px); opacity:.8 } to{ transform:none; opacity:1 } }
        .simodal-header{
          display:flex; align-items:center; justify-content:space-between;
          padding:16px 20px; border-bottom:1px solid #eee;
        }
        .simodal-header h2{ margin:0; font-size:18px }
        .simodal-close{
          border:0; background:#f3f4f6; width:32px; height:32px; border-radius:8px; cursor:pointer;
          font-size:20px; line-height:1;
        }
        .simodal-body{ padding:16px 20px; }
        .simodal-product{ margin-bottom:12px; }
        .simodal-prod-title{ font-weight:600; font-size:16px; margin-bottom:4px; }
        .simodal-prod-meta{ display:flex; gap:16px; flex-wrap:wrap; color:#555; font-size:13px }
        .simodal-grid{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        @media (max-width:640px){ .simodal-grid{ grid-template-columns:1fr; } }
        .simodal-field{ display:flex; flex-direction:column; gap:6px; }
        .simodal-field label{ font-weight:600; font-size:13px; color:#333 }
        .simodal-field input{
          outline:none; border:1px solid #e5e7eb; border-radius:10px; padding:10px 12px; font-size:14px;
        }
        .simodal-field small{ color:#6b7280 }
        .simodal-preview{
          margin:12px 0; display:flex; gap:16px; flex-wrap:wrap; color:#111;
          background:#f9fafb; padding:10px 12px; border-radius:12px; font-size:14px;
        }
        .simodal-toggle{
          margin-top:6px; border:0; background:#eef2ff; color:#4338ca;
          padding:8px 12px; border-radius:10px; cursor:pointer;
        }
        .simodal-extras{ margin-top:10px; display:flex; flex-direction:column; gap:12px; }
        .simodal-footer{
          padding:14px 20px; border-top:1px solid #eee; display:flex; justify-content:flex-end; gap:8px;
        }
        .btn-primary{
          background:#111827; color:#fff; border:0; padding:10px 14px; border-radius:10px; cursor:pointer;
        }
        .btn-secondary{
          background:#f3f4f6; color:#111; border:0; padding:10px 14px; border-radius:10px; cursor:pointer;
        }
        .req{ color:#ef4444 }
      `}</style>
    </div>
  );
}
