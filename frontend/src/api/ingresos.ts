// frontend/src/api/ingresos.ts
import { api } from "../api";

export type IngresoItemDTO = {
  productoId: number;
  cantidad: number;
  costoUnitario: number;
  lote?: string;
  venceAt?: string; // yyyy-mm-dd
};

export async function crearIngreso(payload: {
  fecha?: string;
  proveedor?: string;
  documento?: string;
  observacion?: string;
  items: IngresoItemDTO[];
}) {
  const { data } = await api.post("/ingresos", payload);
  return data as { ok: true; ingresoId: number };
}
