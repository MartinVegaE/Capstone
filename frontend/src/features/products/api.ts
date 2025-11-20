// src/features/products/api.ts
import { httpGet, httpPost, httpPut, httpDelete } from "../../lib/http";

// Ajusta estos tipos a tu modelo real de Prisma
export interface Producto {
  id: number;
  nombre: string;
  sku: string;
  descripcion?: string;
  stockTotal: number;
  // agrega lo que tengas en tu modelo
}

export interface CreateProductoDto {
  nombre: string;
  sku: string;
  descripcion?: string;
}

export interface UpdateProductoDto {
  nombre?: string;
  sku?: string;
  descripcion?: string;
}

// LISTAR
export function fetchProductos() {
  return httpGet<Producto[]>("/productos");
}

// OBTENER POR ID
export function fetchProducto(id: number) {
  return httpGet<Producto>(`/productos/${id}`);
}

// CREAR
export function createProducto(body: CreateProductoDto) {
  return httpPost<Producto, CreateProductoDto>("/productos", body);
}

// ACTUALIZAR
export function updateProducto(id: number, body: UpdateProductoDto) {
  return httpPut<Producto, UpdateProductoDto>(`/productos/${id}`, body);
}

// ELIMINAR
export function deleteProducto(id: number) {
  return httpDelete<{ success: boolean }>(`/productos/${id}`);
}
