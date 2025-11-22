// services/stockService.js
const { Prisma, MovimientoTipo } = require("@prisma/client");

// Decimal de Prisma (para operar bien el PPP)
const Decimal = Prisma.Decimal;

/**
 * Helper para asegurarse de que siempre tengamos un Decimal
 */
function toDecimal(value) {
  if (value instanceof Decimal) return value;
  if (value === null || value === undefined) return new Decimal(0);
  return new Decimal(value);
}

/**
 * ENTRADA DE COMPRA (afecta PPP)
 * - Se usa para ingresos de compra (factura, guía, carga inicial, etc.)
 * - Recalcula el PPP del producto y deja traza en StockMovimiento.
 *
 * @param {object} tx - cliente de Prisma dentro de una transacción
 * @param {object} params
 * @param {number} params.productoId
 * @param {number} params.cantidad
 * @param {number|string} params.costoUnitario
 * @param {import("@prisma/client").RefTipo} params.refTipo
 * @param {number} params.refId
 */
async function registrarEntradaCompra(tx, { productoId, cantidad, costoUnitario, refTipo, refId }) {
  if (cantidad <= 0) {
    throw new Error("La cantidad de entrada debe ser mayor a 0");
  }

  const producto = await tx.producto.findUnique({
    where: { id: productoId },
  });

  if (!producto) {
    throw new Error(`Producto con id ${productoId} no encontrado`);
  }

  const stockAntes = producto.stock || 0;
  const pppAntes = toDecimal(producto.ppp);
  const cantidadDec = toDecimal(cantidad);
  const costoDec = toDecimal(costoUnitario);

  // Total valorizado antes y de la nueva compra
  const totalAntes = pppAntes.mul(stockAntes);
  const totalNuevo = costoDec.mul(cantidadDec);
  const stockDespues = stockAntes + cantidad;

  // PPP nuevo (fórmula clásica). Si no había stock, PPP = costo de la compra.
  const pppDespues =
    stockDespues > 0 ? totalAntes.add(totalNuevo).div(stockDespues) : costoDec;

  // Actualizar producto
  await tx.producto.update({
    where: { id: productoId },
    data: {
      stock: stockDespues,
      ppp: pppDespues,
    },
  });

  // Registrar movimiento de stock
  await tx.stockMovimiento.create({
    data: {
      productoId,
      tipo: MovimientoTipo.IN,
      cantidad,
      costoUnitario: costoDec,
      pppAntes,
      pppDespues,
      refTipo,
      refId,
    },
  });
}

/**
 * SALIDA (no cambia PPP)
 * - Se usa para salidas a proyectos, devoluciones a proveedor, ajustes negativos, etc.
 *
 * @param {object} tx
 * @param {object} params
 * @param {number} params.productoId
 * @param {number} params.cantidad
 * @param {import("@prisma/client").RefTipo} params.refTipo
 * @param {number} params.refId
 * @param {boolean} [params.permitirStockNegativo=false]
 */
async function registrarSalida(
  tx,
  { productoId, cantidad, refTipo, refId, permitirStockNegativo = false }
) {
  if (cantidad <= 0) {
    throw new Error("La cantidad de salida debe ser mayor a 0");
  }

  const producto = await tx.producto.findUnique({
    where: { id: productoId },
  });

  if (!producto) {
    throw new Error(`Producto con id ${productoId} no encontrado`);
  }

  const stockAntes = producto.stock || 0;

  if (!permitirStockNegativo && stockAntes < cantidad) {
    throw new Error(
      `Stock insuficiente para el producto ${producto.nombre} (id ${productoId}). ` +
        `Stock actual: ${stockAntes}, solicitado: ${cantidad}`
    );
  }

  const stockDespues = stockAntes - cantidad;
  const ppp = toDecimal(producto.ppp);

  // Actualizar producto (PPP no cambia)
  await tx.producto.update({
    where: { id: productoId },
    data: {
      stock: stockDespues,
      // ppp se mantiene
    },
  });

  // Registrar movimiento de stock
  await tx.stockMovimiento.create({
    data: {
      productoId,
      tipo: MovimientoTipo.OUT,
      cantidad,
      costoUnitario: null, // opcionalmente podrías usar ppp aquí
      pppAntes: ppp,
      pppDespues: ppp,
      refTipo,
      refId,
    },
  });
}

/**
 * ENTRADA SIMPLE (retorno de proyecto)
 * - Suma stock pero NO modifica PPP.
 * - Úsalo cuando material vuelve desde proyecto a la bodega.
 *
 * @param {object} tx
 * @param {object} params
 * @param {number} params.productoId
 * @param {number} params.cantidad
 * @param {import("@prisma/client").RefTipo} params.refTipo
 * @param {number} params.refId
 */
async function registrarEntradaRetorno(tx, { productoId, cantidad, refTipo, refId }) {
  if (cantidad <= 0) {
    throw new Error("La cantidad de retorno debe ser mayor a 0");
  }

  const producto = await tx.producto.findUnique({
    where: { id: productoId },
  });

  if (!producto) {
    throw new Error(`Producto con id ${productoId} no encontrado`);
  }

  const stockAntes = producto.stock || 0;
  const stockDespues = stockAntes + cantidad;
  const ppp = toDecimal(producto.ppp);

  await tx.producto.update({
    where: { id: productoId },
    data: {
      stock: stockDespues,
      // ppp se mantiene
    },
  });

  await tx.stockMovimiento.create({
    data: {
      productoId,
      tipo: MovimientoTipo.IN,
      cantidad,
      costoUnitario: null, // opcionalmente podrías usar ppp aquí
      pppAntes: ppp,
      pppDespues: ppp,
      refTipo,
      refId,
    },
  });
}

module.exports = {
  registrarEntradaCompra,
  registrarSalida,
  registrarEntradaRetorno,
};
