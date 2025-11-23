// src/api/catalogs.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { http } from "../lib/http";

export type Categoria = {
  id: number;
  codigo: string;  // EXT, DET, ACF, FUN
  nombre: string;  // Extinción, Detección, ...
};

export function useCategorias() {
  return useQuery({
    queryKey: ["categorias"],
    queryFn: async () => {
      const res = await http.get<Categoria[]>("/categorias");
      return res.data;
    },
  });
}
