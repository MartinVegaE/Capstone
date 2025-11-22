// services/ingresoService.js
const { PrismaClient, RefTipo, TipoDocumento } = require("@prisma/client");
const prisma = new PrismaClient();

const {
  registrarEntradaCompra,
} = require("./stockService");

/**
 * Crea un ingreso completo:
 * - Crea/usa proveedor
 * - Usa bodega principal por defecto (si no se pasa otra)
 * - Crea/usa productos
 * - Crea Ingreso + IngresoItems
 * - Actualiza stock + PPP + StockMovimiento
 *
 * @param {object} payload
 * @param {string} payload.tipoDocumento      // FACTURA | GUIA_DESPACHO | NOTA_CREDITO | OTRO
 * @param {string} payload.numeroDocumento
 * @param {string} [payload.observacion]
 * @param {number} [payload.bodegaId]         // opcional, si no va -> bodega principal
 * @param {object}  payload.proveedor         // { nombre, rut?, email?, telefono?, direccion? }
 * @param {Array}  payload.items              // ver descripción abajo
 *
 * items[]:
 *  - sku               (string, requerido)
 *  - nombre            (string, requerido si el producto no existe)
 *  - categoriaCodigo   (string, requerido si se crea producto: EXT/DET/ACF/FUN)
 *  - subcategoriaNombre (string opcional)
 *  - cantidad          (number, requerido)
 *  - costoUnitario     (number, requerido)
 *  - stockMinimo       (number opcional)
 *  - imagenUrl         (string opcional)
 */
async function crearIngreso(payload) {
  const {
    tipoDocumento,
    numeroDocumento,
    observacion,
    bodegaId,
    proveedor,
    items,
  } = payload;

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error("El ingreso debe tener al menos un item");
  }

  return prisma.$transaction(async (tx) => {
    // 1) Bodega
    let bodega;
    if (bodegaId) {
      bodega = await tx.bodega.findUnique({ where: { id: bodegaId } });
      if (!bodega) {
        throw new Error(`Bodega con id ${bodegaId} no encontrada`);
      }
    } else {
      bodega = await tx.bodega.findFirst({
        where: { esPrincipal: true },
      });

      if (!bodega) {
        throw new Error(
          "No se encontró bodega principal. Crea una o marca esPrincipal = true."
        );
      }
    }

    // 2) Proveedor
    let proveedorDB;

    if (proveedor?.rut) {
      // Si viene RUT, usamos upsert por rut (clave única)
      proveedorDB = await tx.proveedor.upsert({
        where: { rut: proveedor.rut },
        update: {
          nombre: proveedor.nombre ?? undefined,
          email: proveedor.email ?? undefined,
          telefono: proveedor.telefono ?? undefined,
          direccion: proveedor.direccion ?? undefined,
        },
        create: {
          nombre: proveedor.nombre ?? "Proveedor sin nombre",
          rut: proveedor.rut,
          email: proveedor.email ?? null,
          telefono: proveedor.telefono ?? null,
          direccion: proveedor.direccion ?? null,
        },
      });
    } else if (proveedor?.nombre) {
      // Sin RUT: buscar por nombre, si no existe, crear
      proveedorDB =
        (await tx.proveedor.findFirst({
          where: { nombre: proveedor.nombre },
        })) ||
        (await tx.proveedor.create({
          data: {
            nombre: proveedor.nombre,
            email: proveedor.email ?? null,
            telefono: proveedor.telefono ?? null,
            direccion: proveedor.direccion ?? null,
          },
        }));
    } else {
      throw new Error(
        "Se requiere al menos el nombre del proveedor en payload.proveedor.nombre"
      );
    }

    // 3) Crear Ingreso
    const tipoDoc =
      tipoDocumento && TipoDocumento[tipoDocumento]
        ? TipoDocumento[tipoDocumento]
        : TipoDocumento.GUIA_DESPACHO; // default razonable

    const ingreso = await tx.ingreso.create({
      data: {
        proveedorId: proveedorDB.id,
        bodegaId: bodega.id,
        tipoDocumento: tipoDoc,
        numeroDocumento: numeroDocumento || "SIN_NUMERO",
        observacion: observacion || null,
      },
    });

    // 4) Procesar items: crear/usar producto + IngresoItem + stock/PPP
    const itemsCreados = [];

    for (const item of items) {
      const {
        sku,
        nombre,
        categoriaCodigo,
        subcategoriaNombre,
        cantidad,
        costoUnitario,
        stockMinimo,
        imagenUrl,
      } = item;

      if (!sku) {
        throw new Error("Cada item debe tener un sku");
      }
      if (!cantidad || cantidad <= 0) {
        throw new Error(
          `La cantidad del item con sku ${sku} debe ser mayor a 0`
        );
      }
      if (costoUnitario === undefined || costoUnitario === null) {
        throw new Error(
          `El item con sku ${sku} debe tener costoUnitario definido`
        );
      }

      // 4.1) Buscar producto por sku
      let producto = await tx.producto.findUnique({
        where: { sku },
      });

      // 4.2) Si no existe, crearlo
      if (!producto) {
        if (!nombre) {
          throw new Error(
            `El producto con sku ${sku} no existe y se requiere 'nombre' para crearlo`
          );
        }
        if (!categoriaCodigo) {
          throw new Error(
            `El producto con sku ${sku} no existe y se requiere 'categoriaCodigo' (EXT/DET/ACF/FUN)`
          );
        }

        const categoria = await tx.categoria.findUnique({
          where: { codigo: categoriaCodigo },
        });

        if (!categoria) {
          throw new Error(
            `Categoría con código ${categoriaCodigo} no encontrada`
          );
        }

        let subcategoria = null;
        if (subcategoriaNombre) {
          subcategoria = await tx.subcategoria.findUnique({
            where: {
              categoriaId_nombre: {
                categoriaId: categoria.id,
                nombre: subcategoriaNombre,
              },
            },
          });

          if (!subcategoria) {
            throw new Error(
              `Subcategoría "${subcategoriaNombre}" no existe para la categoría ${categoriaCodigo}`
            );
          }
        }

        producto = await tx.producto.create({
          data: {
            sku,
            nombre,
            descripcion: null,
            categoriaId: categoria.id,
            subcategoriaId: subcategoria ? subcategoria.id : null,
            proveedorId: proveedorDB.id,
            stock: 0,
            stockMinimo: stockMinimo ?? 0,
            ubicacion: null,
            codigoBarras: null,
            imagenUrl: imagenUrl ?? null,
            ppp: 0,
          },
        });
      }

      // 4.3) Crear IngresoItem
      const ingresoItem = await tx.ingresoItem.create({
        data: {
          ingresoId: ingreso.id,
          productoId: producto.id,
          cantidad,
          costoUnitario,
          lote: item.lote ?? null,
          venceAt: item.venceAt ? new Date(item.venceAt) : null,
        },
      });

      // 4.4) Actualizar stock + PPP + StockMovimiento
      await registrarEntradaCompra(tx, {
        productoId: producto.id,
        cantidad,
        costoUnitario,
        refTipo: RefTipo.INGRESO,
        refId: ingreso.id,
      });

      itemsCreados.push({
        ingresoItem,
        producto,
      });
    }

    return {
      ingreso,
      proveedor: proveedorDB,
      bodega,
      items: itemsCreados.map((i) => ({
        ingresoItem: i.ingresoItem,
        producto: i.producto,
      })),
    };
  });
}

module.exports = {
  crearIngreso,
};
