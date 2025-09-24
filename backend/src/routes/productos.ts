import { Router } from 'express';
import prisma from '../prisma';
import { buildProductsQuery } from '../utils/productsQuery';
import { Prisma } from '@prisma/client';

const router = Router();

// GET /productos
router.get('/', async (req, res) => {
  try {
    const { where, orderBy, skip, take, page, pageSize } = buildProductsQuery({
      q: req.query.q as string | undefined,
      minStock: req.query.minStock ? Number(req.query.minStock) : undefined,
      maxStock: req.query.maxStock ? Number(req.query.maxStock) : undefined,
      soloBajoStock: req.query.soloBajoStock === 'true',
      sortBy: (req.query.sortBy as any) || undefined,
      sortDir: (req.query.sortDir as any) || undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    }) as {
      where: Prisma.ProductWhereInput,
      orderBy: Prisma.ProductOrderByWithRelationInput | Prisma.ProductOrderByWithRelationInput[] | undefined,
      skip: number | undefined,
      take: number | undefined,
      page: number | undefined,
      pageSize: number | undefined
    };

    const [items, total] = await Promise.all([
      prisma.product.findMany({ where, orderBy, skip, take }),
      prisma.product.count({ where }),
    ]);

    res.json({ items, page, pageSize, total });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;