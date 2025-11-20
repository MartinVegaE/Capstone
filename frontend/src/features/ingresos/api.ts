import { httpGet } from "../../lib/http";

export interface Ingreso {
  id: number;
  fecha: string;
  proveedor?: string;
}

export function fetchIngresos() {
  return httpGet<Ingreso[]>("/ingresos");
}
