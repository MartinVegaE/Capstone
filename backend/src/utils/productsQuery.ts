import { Prisma } from '@prisma/client';

export type ListParams = {
  q?: string;
  minStock?: number;
  maxStock?: number;
  soloBajoStock?: boolean;
  sortBy?: 'name' | 'sku' | 'stock' | 'createdAt';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
};

export function buildProductsQuery(p: ListParams) {
  const page = Math.max(1, Number(p.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(p.pageSize) || 20));
  const skip = (page - 1) * pageSize;
  const take = pageSize;

  const where: Prisma.ProductoWhereInput = {};

  if (p.q) {
    const q = p.q.trim();
    where.OR = [
      { nombre: { contains: q } },
      { sku:  { contains: q } },
    ];
  }
  if (p.minStock != null) where.stock = { ...(where.stock as any), gte: Number(p.minStock) };
  if (p.maxStock != null) where.stock = { ...(where.stock as any), lte: Number(p.maxStock) };
  if (p.soloBajoStock) {
    // ejemplo: considera “bajo stock” <= 5 (ajústalo o hazlo param)
    const threshold = 5;
    where.stock = { ...(where.stock as any), lte: threshold };
  }

  const sortBy = p.sortBy ?? 'name';
  const sortDir = p.sortDir ?? 'asc';
  const orderBy: Prisma.ProductoOrderByWithRelationInput = { [sortBy]: sortDir };

  return { where, orderBy, skip, take, page, pageSize };
}
