// src/api/catalogs.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/http";

export interface Categoria {
  id: number;
  nombre: string;
}

export interface Marca {
  id: number;
  nombre: string;
}

export interface Bodega {
  id: number;
  nombre: string;
  codigo: string | null;
}

export interface Proyecto {
  id: number;
  nombre: string;
}

// ---- Categorías ----
export function useCategorias() {
  return useQuery<Categoria[]>({
    queryKey: ["categorias"],
    queryFn: async () => {
      const res = await api.get<Categoria[]>("/categorias");
      return res.data;
    },
  });
}

export function useCreateCategoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (nombre: string) => {
      const res = await api.post<Categoria>("/categorias", { nombre });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categorias"] });
    },
  });
}

// ---- Marcas ----
export function useMarcas() {
  return useQuery<Marca[]>({
    queryKey: ["marcas"],
    queryFn: async () => {
      const res = await api.get<Marca[]>("/marcas");
      return res.data;
    },
  });
}

export function useCreateMarca() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (nombre: string) => {
      const res = await api.post<Marca>("/marcas", { nombre });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marcas"] });
    },
  });
}

// ---- Bodegas ----
export function useBodegas() {
  return useQuery<Bodega[]>({
    queryKey: ["bodegas"],
    queryFn: async () => {
      const res = await api.get<Bodega[]>("/bodegas");
      return res.data;
    },
  });
}

export function useCreateBodega() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { nombre: string; codigo?: string }) => {
      const res = await api.post<Bodega>("/bodegas", {
        nombre: payload.nombre,
        codigo: payload.codigo ?? null,
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bodegas"] });
    },
  });
}

// ---- Proyectos ----
export function useProyectos() {
  return useQuery<Proyecto[]>({
    queryKey: ["proyectos"],
    queryFn: async () => {
      const res = await api.get<Proyecto[]>("/proyectos");
      return res.data;
    },
  });
}

export function useCreateProyecto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (nombre: string) => {
      const res = await api.post<Proyecto>("/proyectos", { nombre });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proyectos"] });
    },
  });
}
