import { Router } from 'express';
import { z } from 'zod';
import prisma from '../prisma';
import type { Prisma } from '@prisma/client';

export const productos = Router();
export default productos;

// Puedes mover esto a .env
const LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD ?? 5);

// Query robusta: convierte strings a número/bool y aplica defaults
const QuerySchema = z.object({
  q: z.string().optional(),
  minStock: z.coerce.number().optional(),
  maxStock: z.coerce.number().optional(),
  soloBajoStock: z.coerce.boolean().optional(),
  sortBy: z.enum(['name', 'sku', 'stock', 'createdAt']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// GET /productos
productos.get('/', async (req, res) => {
  try {
    const { q, minStock, maxStock, soloBajoStock, sortBy, sortDir, page, pageSize } =
      QuerySchema.parse(req.query);

    const and: Prisma.ProductWhereInput[] = [];

if (q && q.trim() !== '') {
  and.push({
    OR: [
      // OJO: en SQLite no va `mode: 'insensitive'`
      { name: { contains: q } },
      { sku:  { contains: q } },
    ],
  });
}

    if (typeof minStock === 'number' && !Number.isNaN(minStock)) {
      and.push({ stock: { gte: minStock } });
    }
    if (typeof maxStock === 'number' && !Number.isNaN(maxStock)) {
      and.push({ stock: { lte: maxStock } });
    }
    if (soloBajoStock) {
      and.push({ stock: { lte: LOW_STOCK_THRESHOLD } });
    }

    const where: Prisma.ProductWhereInput | undefined = and.length ? { AND: and } : undefined;

    // orderBy tip-safe con switch para evitar errores de indexación
    const orderBy: Prisma.ProductOrderByWithRelationInput = (() => {
      switch (sortBy) {
        case 'name': return { name: sortDir };
        case 'sku': return { sku: sortDir };
        case 'stock': return { stock: sortDir };
        case 'createdAt': return { createdAt: sortDir };
      }
    })();

    const [total, items] = await prisma.$transaction([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, name: true, sku: true, stock: true, createdAt: true },
      }),
    ]);

    res.json({ items, page, pageSize, total });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Parámetros inválidos o error interno' });
  }
});



// ============ CREATE: POST /productos ============
const CreateBody = z.object({
  name: z.string().min(1, 'name requerido').trim(),
  sku: z.string().min(1, 'sku requerido').trim(),
  stock: z.coerce.number().int().min(0).default(0),
});

productos.post('/', async (req, res) => {
  try {
    const { name, sku, stock } = CreateBody.parse(req.body);

    const created = await prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: { name, sku, stock },
        select: { id: true, name: true, sku: true, stock: true, createdAt: true },
      });

      // registra movimiento inicial si parte con stock > 0
      if (stock > 0) {
        await tx.stockMovement.create({
          data: {
            productId: p.id,
            type: 'SET',            // enum MovementType
            delta: stock,           // de 0 a stock
            before: 0,
            after: stock,
            reason: 'Creación de producto con stock inicial',
            source: 'api',
            actor: 'system',
          },
        });
      }
      return p;
    });

    res.status(201).json(created);
  } catch (err: any) {
    // SKU duplicado
    if (err?.code === 'P2002') {
      return res.status(409).json({ error: 'El SKU ya existe' });
    }
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Body inválido', issues: err.format() });
    }
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// ============ UPDATE: PUT /productos/:id ============
const UpdateBody = z.object({
  name: z.string().min(1).trim().optional(),
  sku: z.string().min(1).trim().optional(),
  stock: z.coerce.number().int().min(0).optional(),
}).refine(obj => Object.keys(obj).length > 0, { message: 'Envía al menos un campo' });

productos.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });

    const body = UpdateBody.parse(req.body);

    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.product.findUnique({ where: { id } });
      if (!current) throw new Error('NOT_FOUND');

      const nextStock = body.stock ?? current.stock;

      const p = await tx.product.update({
        where: { id },
        data: {
          name: body.name ?? current.name,
          sku:  body.sku  ?? current.sku,
          stock: nextStock,
        },
        select: { id: true, name: true, sku: true, stock: true, createdAt: true },
      });

      // Si se envió stock y cambió, registramos movimiento SET
      if (body.stock != null && body.stock !== current.stock) {
        await tx.stockMovement.create({
          data: {
            productId: id,
            type: 'SET',
            delta: nextStock - current.stock,
            before: current.stock,
            after: nextStock,
            reason: 'Actualización de stock (PUT producto)',
            source: 'api',
            actor: 'system',
          },
        });
      }

      return p;
    });

    res.json(updated);
  } catch (err: any) {
    if (err?.message === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    if (err?.code === 'P2002') {
      return res.status(409).json({ error: 'El SKU ya existe' });
    }
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Body inválido', issues: err.format() });
    }
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
});
// PATCH /productos/:id/stock  { set: number }
const PatchStockBody = z.object({ set: z.coerce.number().int().min(0) });

productos.patch('/:id/stock', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });

    const body = PatchStockBody.parse(req.body);

    const current = await prisma.product.findUnique({
      where: { id },
      select: { stock: true },
    });
    if (!current) return res.status(404).json({ error: 'Producto no encontrado' });

    const before = current.stock;
    const after = Math.max(0, body.set);
    const delta = after - before;

    const [updated] = await prisma.$transaction([
      prisma.product.update({ where: { id }, data: { stock: after } }),
      // OJO: tu schema usa StockMovement (no Movement) y exige before/after
      prisma.stockMovement.create({
        data: {
          productId: id,
          type: 'ADJUST',         // MovementType del enum
          delta,
          before,
          after,
          reason: 'Actualización directa de stock (API)',
          source: 'api',
          actor: 'system',        // opcional, pero útil para auditoría
        },
      }),
    ]);

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Body inválido o error interno' });
  }
});

// GET /productos/:id/movimientos?page=1&pageSize=20
productos.get('/:id/movimientos', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });

    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20)));

    const where: Prisma.StockMovementWhereInput = { productId: id };

    const [total, items] = await prisma.$transaction([
      prisma.stockMovement.count({ where }),
      prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    res.json({ items, page, pageSize, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
});
// GET /productos/:id  -> detalle
productos.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });

    const p = await prisma.product.findUnique({
      where: { id },
      select: { id: true, name: true, sku: true, stock: true, createdAt: true, updatedAt: true },
    });

    if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(p);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /productos/export  -> CSV de productos filtrados
productos.get('/export', async (req, res) => {
  try {
    // Reusamos el schema de filtros
    const { q, minStock, maxStock, soloBajoStock, sortBy, sortDir } = QuerySchema.parse({
      ...req.query,
      // fuerza a ignorar paginación en export
      page: 1,
      pageSize: 100_000,
    });

    const and: Prisma.ProductWhereInput[] = [];
    if (q && q.trim() !== '') {
      and.push({ OR: [{ name: { contains: q } }, { sku: { contains: q } }] }); // SQLite: sin 'insensitive'
    }
    if (typeof minStock === 'number' && !Number.isNaN(minStock)) and.push({ stock: { gte: minStock } });
    if (typeof maxStock === 'number' && !Number.isNaN(maxStock)) and.push({ stock: { lte: maxStock } });
    if (soloBajoStock) and.push({ stock: { lte: LOW_STOCK_THRESHOLD } });

    const where: Prisma.ProductWhereInput | undefined = and.length ? { AND: and } : undefined;

    const orderBy: Prisma.ProductOrderByWithRelationInput = (() => {
      switch (sortBy) {
        case 'name': return { name: sortDir };
        case 'sku': return { sku: sortDir };
        case 'stock': return { stock: sortDir };
        case 'createdAt': return { createdAt: sortDir };
      }
    })();

    const items = await prisma.product.findMany({
      where,
      orderBy,
      select: { id: true, name: true, sku: true, stock: true, createdAt: true },
      // sin skip/take: exporta todo lo filtrado
    });

    // CSV simple y seguro
    const esc = (v: unknown) =>
      `"${String(v ?? '').replace(/"/g, '""')}"`;

    const header = ['id','name','sku','stock','createdAt'].map(esc).join(',');
    const rows = items.map(p =>
      [p.id, p.name, p.sku, p.stock, p.createdAt.toISOString()].map(esc).join(',')
    );

    const csv = [header, ...rows].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="productos_${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Parámetros inválidos o error interno' });
  }
});
