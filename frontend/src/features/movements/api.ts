import { httpGet } from "../../lib/http";

export interface Movimiento {
  id: number;
  tipo: string; // "INGRESO" | "SALIDA" | etc.
  fecha: string;
  referencia?: string;
}

export function fetchMovimientos() {
  return httpGet<Movimiento[]>("/movimientos");
}
