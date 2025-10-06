// backend/src/routes/ingresos.ts
import { Router } from 'express';
import prisma from '../prisma';

const router = Router();

/* ===== Helpers ===== */
const round = (n: number, dec: number) => {
  const f = Math.pow(10, dec);
  return Math.round(n * f) / f;
};
const parseDate = (s?: string) => (s ? new Date(s) : undefined);
/** Para campos Decimal en Prisma con SQLite, usar string es lo más compatible. */
const decStr = (n: number, dec: number) => round(n, dec).toFixed(dec);
const toNumber = (d: unknown): number => {
  // Prisma Decimal suele tener toString(); si fuese number, igual sirve
  if (d === null || d === undefined) return 0;
  return parseFloat(String(d));
};

/* ===== Tipos del body ===== */
type IngresoItemDTO = {
  productoId: number;
  cantidad: number;       // > 0
  costoUnitario: number;  // >= 0
  lote?: string;
  venceAt?: string;       // ISO
};

type IngresoDTO = {
  fecha?: string;
  proveedor?: string;
  documento?: string;
  observacion?: string;
  items: IngresoItemDTO[];
};

/**
 * POST /ingresos
 * Crea un Ingreso con sus items, actualiza stock y PPP en Producto,
 * y registra la trazabilidad en StockMovimiento.
 */
router.post('/', async (req, res) => {
  const body = req.body as IngresoDTO;

  if (!Array.isArray(body?.items) || body.items.length === 0) {
    return res.status(400).json({ error: 'Debe incluir al menos un ítem de ingreso.' });
  }

  try {
    // Tipamos tx como any para evitar errores de delegates en distintos setups de TS
    const created = await prisma.$transaction(async (tx: any) => {
      // Cabecera Ingreso
      const ingreso = await tx.ingreso.create({
        data: {
          fecha: parseDate(body.fecha),
          proveedor: body.proveedor ?? null,
          documento: body.documento ?? null,
          observacion: body.observacion ?? null,
        },
      });

      // Procesar ítems
      for (const raw of body.items) {
        const it: IngresoItemDTO = {
          productoId: Number(raw?.productoId),
          cantidad: Number(raw?.cantidad),
          costoUnitario: Number(raw?.costoUnitario),
          lote: raw?.lote,
          venceAt: raw?.venceAt,
        };

        if (!Number.isFinite(it.productoId) || it.productoId <= 0) {
          throw new Error('Ítem inválido: productoId requerido y > 0.');
        }
        if (!Number.isFinite(it.cantidad) || it.cantidad <= 0) {
          throw new Error('Ítem inválido: cantidad > 0 requerida.');
        }
        if (!Number.isFinite(it.costoUnitario) || it.costoUnitario < 0) {
          throw new Error('Ítem inválido: costoUnitario >= 0 requerido.');
        }

        // Producto actual
        const prod = await tx.producto.findUnique({
          where: { id: it.productoId },
          select: { id: true, stock: true, ppp: true },
        });
        if (!prod) throw new Error(`Producto ${it.productoId} no existe.`);

        const stockActual = prod.stock ?? 0;
        const pppActual = toNumber(prod.ppp);
        const nuevoStock = stockActual + it.cantidad;

        const nuevoPPP =
          stockActual === 0
            ? it.costoUnitario
            : (stockActual * pppActual + it.cantidad * it.costoUnitario) / nuevoStock;

        // Ítem del ingreso
        await tx.ingresoItem.create({
          data: {
            ingresoId: ingreso.id,
            productoId: it.productoId,
            cantidad: it.cantidad,
            // Enviar como string (Decimal compatible con SQLite)
            costoUnitario: decStr(it.costoUnitario, 2),
            lote: it.lote,
            venceAt: it.venceAt ? new Date(it.venceAt) : undefined,
          },
        });

        // Actualizar Producto (stock y PPP como string)
        await tx.producto.update({
          where: { id: prod.id },
          data: {
            stock: nuevoStock,
            ppp: decStr(nuevoPPP, 2),
          },
        });

        // Movimiento de stock (PPP a 4 decimales para trazabilidad)
        await tx.stockMovimiento.create({
          data: {
            productoId: prod.id,
            tipo: 'IN' as any,         // literal string para enum
            cantidad: it.cantidad,
            costoUnitario: decStr(it.costoUnitario, 2),
            pppAntes: decStr(pppActual, 4),
            pppDespues: decStr(nuevoPPP, 4),
            refTipo: 'INGRESO' as any, // literal string para enum
            refId: ingreso.id,
          },
        });
      }

      return ingreso;
    });

    return res.status(201).json({ ok: true, ingresoId: created.id });
  } catch (err: any) {
    console.error('[POST /ingresos] Error:', err?.message ?? err);
    return res.status(400).json({ error: err?.message ?? 'Error creando ingreso.' });
  }
});

export default router;
