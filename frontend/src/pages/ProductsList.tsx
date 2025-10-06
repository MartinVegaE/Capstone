import { useMemo, useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { api } from "../api";
import ProductsFilterBar from "../components/ProductsFilterBar";
import StockIngressModal from "../components/StockIngressModal";
import type { ProductFilters } from "../types/filters";
import { DEFAULT_PRODUCT_FILTERS } from "../types/filters";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import CreateProductModal from "../components/CreateProductModal";
import { descargarPPP, descargarPPPHistorico } from "../api/reportes";

/* ===== Tipos flexibles para adaptarnos al backend ===== */
type AnyProduct = {
  id: number;
  sku: string;
  stock: number;
  name?: string;
  nombre?: string;
  ppp?: number | string | null;
};

type ListResp =
  | { items: AnyProduct[]; page: number; pageSize: number; total: number }
  | AnyProduct[];

/* Normaliza el listado a un shape paginado */
function normalize(resp: ListResp, page: number, pageSize: number) {
  if (Array.isArray(resp)) {
    return {
      items: resp,
      page,
      pageSize,
      total: resp.length,
    };
  }
  return resp;
}

/* UI helpers */
const money = (n: unknown) =>
  (Number.isFinite(Number(n)) ? Number(n) : 0).toFixed(2);

export default function ProductsList() {
  const qc = useQueryClient();

  const [filters, setFilters] = useState<ProductFilters>(
    DEFAULT_PRODUCT_FILTERS
  );
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // debounce solo del texto
  const debouncedQ = useDebouncedValue(filters.q, 350);
  const effective = { ...filters, q: debouncedQ };

  // clave estable
  const listKey = useMemo(
    () =>
      [
        "productos",
        effective.q || "",
        effective.soloBajoStock ? 1 : 0,
        page,
        pageSize,
      ] as const,
    [effective.q, effective.soloBajoStock, page, pageSize]
  );

  const qList = useQuery({
    queryKey: listKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (effective.q) params.set("q", effective.q);
      if (effective.soloBajoStock) params.set("soloBajoStock", "true");
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const { data } = await api.get<ListResp>(`/productos?${params}`);
      return normalize(data, page, pageSize);
    },
    placeholderData: keepPreviousData,
  });

  // PATCH correcto acorde a tu backend: /productos/:id con { stock }
  const adjustStock = useMutation({
    mutationFn: async ({ id, newStock }: { id: number; newStock: number }) => {
      await api.patch(`/productos/${id}`, { stock: Math.max(0, newStock) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["productos"] }),
  });

  const [formOpen, setFormOpen] = useState(false);

  // Modal de ingreso de stock
  const [ingModal, setIngModal] = useState<{
    open: boolean;
    product: AnyProduct | null;
  }>({ open: false, product: null });

  const totalPages = qList.data
    ? Math.max(1, Math.ceil(qList.data.total / pageSize))
    : 1;

  return (
    <div className="page">
      <header className="head">
        <div className="head-left">
          <h2>Productos</h2>
          <span className="subtle">
            Gestión de inventario y costos promedio (PPP)
          </span>
        </div>
        <div className="head-actions">
          <button className="btn" onClick={() => descargarPPP()}>
            Exportar PPP (CSV)
          </button>
          <button className="btn" onClick={() => descargarPPPHistorico()}>
            PPP histórico (CSV)
          </button>
          <button className="btn-primary" onClick={() => setFormOpen(true)}>
            + Nuevo producto
          </button>
        </div>
      </header>

      <section className="bar">
        <ProductsFilterBar
          value={filters}
          onChange={(v) => {
            setFilters(v);
            setPage(1);
          }}
        />
      </section>

      <section className="content">
        {qList.isLoading && <SkeletonList />}

        {qList.isError && (
          <div className="error">
            Error al cargar.{" "}
            <button
              onClick={() =>
                qc.invalidateQueries({ queryKey: ["productos"] })
              }
            >
              Reintentar
            </button>
          </div>
        )}

        {qList.data && (
          <>
            <div className="meta">
              Mostrando {qList.data.items.length} de {qList.data.total} (página{" "}
              {qList.data.page}/{totalPages})
            </div>

            {qList.data.items.length === 0 ? (
              <EmptyState onCreate={() => setFormOpen(true)} />
            ) : (
              <div className="table">
                <div className="t-head">
                  <div>ID</div>
                  <div>SKU</div>
                  <div>Nombre</div>
                  <div>Stock</div>
                  <div>PPP</div>
                  <div className="right">Acciones</div>
                </div>
                <div className="t-body">
                  {qList.data.items.map((raw) => {
                    const nombre = raw.name ?? raw.nombre ?? "—";
                    const ppp = raw.ppp ?? null;

                    return (
                      <div className="t-row" key={raw.id}>
                        <div>{raw.id}</div>
                        <div className="sku">{raw.sku}</div>
                        <div className="name">{nombre}</div>
                        <div className="stock">
                          <button
                            className="chip"
                            onClick={() =>
                              adjustStock.mutate({
                                id: raw.id,
                                newStock: raw.stock - 1,
                              })
                            }
                            disabled={adjustStock.isPending}
                            title="Quitar 1"
                          >
                            −
                          </button>
                          <span className="stock-val">{raw.stock}</span>
                          <button
                            className="chip"
                            onClick={() =>
                              adjustStock.mutate({
                                id: raw.id,
                                newStock: raw.stock + 1,
                              })
                            }
                            disabled={adjustStock.isPending}
                            title="Agregar 1"
                          >
                            +
                          </button>
                        </div>
                        <div className="ppp">
                          {ppp != null ? (
                            `$${money(ppp)}`
                          ) : (
                            <span className="muted">–</span>
                          )}
                        </div>
                        <div className="right">
                          <button
                            className="btn"
                            onClick={() =>
                              setIngModal({ open: true, product: raw })
                            }
                          >
                            Ingresar stock
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="pager">
              <button
                className="btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || qList.isFetching}
              >
                ← Anterior
              </button>
              <span>
                Página {page} de {totalPages}
              </span>
              <button
                className="btn"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || qList.isFetching}
              >
                Siguiente →
              </button>
            </div>
          </>
        )}
      </section>

      {/* Modal crear producto */}
      {formOpen && (
        <CreateProductModal open={formOpen} onClose={() => setFormOpen(false)} />
      )}

      {/* Modal de ingreso de stock */}
      {ingModal.open && ingModal.product && (
        <StockIngressModal
          open={ingModal.open}
          onClose={() => setIngModal({ open: false, product: null })}
          producto={{
            id: ingModal.product.id,
            sku: ingModal.product.sku,
            nombre: ingModal.product.name ?? ingModal.product.nombre ?? "—",
            stock: ingModal.product.stock,
            ppp: ingModal.product.ppp ?? null,
          }}
        />
      )}

      {/* estilos del listado */}
      <style>{`
        .page{ padding:16px; max-width:1100px; margin:0 auto; }
        .head{ display:flex; gap:16px; align-items:center; justify-content:space-between; flex-wrap:wrap; margin-bottom:12px; }
        .head-left h2{ margin:0; line-height:1.2 }
        .subtle{ color:#6b7280; font-size:13px }
        .head-actions{ display:flex; gap:8px; flex-wrap:wrap; }
        .btn{ background:#f3f4f6; border:0; padding:8px 12px; border-radius:10px; cursor:pointer; }
        .btn-primary{ background:#111827; color:#fff; border:0; padding:8px 12px; border-radius:10px; cursor:pointer; }
        .bar{ margin-bottom:10px; }
        .content{}
        .meta{ color:#6b7280; margin:6px 0 10px }
        .table{ width:100%; border:1px solid #eee; border-radius:12px; overflow:hidden; }
        .t-head, .t-row{ display:grid; grid-template-columns: 80px 140px 1fr 160px 120px 180px; gap:0; align-items:center; }
        .t-head{ background:#f9fafb; padding:10px 12px; font-weight:600; color:#374151 }
        .t-body{ display:flex; flex-direction:column; }
        .t-row{ padding:10px 12px; border-top:1px solid #f1f5f9; }
        .t-row:nth-child(even){ background:#fcfcfd }
        .sku{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
        .name{ white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .stock{ display:flex; align-items:center; gap:8px; }
        .stock-val{ min-width: 28px; text-align:center; font-weight:600; }
        .chip{ border:0; background:#eef2ff; color:#4338ca; padding:6px 10px; border-radius:999px; cursor:pointer; }
        .ppp{font-variant-numeric: tabular-nums;}
        .muted{ color:#9ca3af }
        .right{ text-align:right; }
        .pager{ display:flex; gap:12px; align-items:center; justify-content:center; margin-top:14px; }
        @media (max-width:880px){
          .t-head, .t-row{ grid-template-columns: 60px 100px 1fr 130px 100px 140px; }
        }
        @media (max-width:640px){
          .t-head, .t-row{ grid-template-columns: 50px 1fr 100px 100px; }
          .t-head > :nth-child(2){ display:none }
          .t-row > :nth-child(2){ display:none }
          .t-head > :nth-child(6), .t-row > :nth-child(6){ grid-column: 4 / 5; }
          .t-head > :nth-child(4){ grid-column: 3 / 4; }
          .t-head > :nth-child(5){ display:none }
          .t-row > :nth-child(5){ display:none }
        }
      `}</style>
    </div>
  );
}

/* ===== Skeleton / Empty ===== */

function SkeletonList() {
  return (
    <div className="skeleton">
      {Array.from({ length: 6 }).map((_, i) => (
        <div className="sk-row" key={i} />
      ))}
      <style>{`
        .skeleton{ display:flex; flex-direction:column; gap:8px; }
        .sk-row{ height:48px; background:linear-gradient(90deg, #f3f4f6, #f9fafb, #f3f4f6); background-size: 300% 300%; border-radius:10px; animation: sk 1.4s ease infinite; }
        @keyframes sk{ 0%{ background-position:0% 50% } 50%{ background-position:100% 50% } 100%{ background-position:0% 50% } }
      `}</style>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="empty">
      <p>No hay productos que coincidan.</p>
      <button className="btn-primary" onClick={onCreate}>
        Crear producto
      </button>
      <style>{`
        .empty{ padding:28px; border:1px dashed #e5e7eb; border-radius:12px; display:flex; flex-direction:column; gap:8px; align-items:center; justify-content:center; }
      `}</style>
    </div>
  );
}
