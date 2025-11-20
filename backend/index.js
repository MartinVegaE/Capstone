require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const app = express();

/* =========================
   Helpers numéricos/fechas
   ========================= */

function round(n, dec) {
  const f = Math.pow(10, dec);
  return Math.round(n * f) / f;
}

function decStr(n, dec) {
  return round(n, dec).toFixed(dec); // para Decimal como string
}

function parseDate(s) {
  return s ? new Date(s) : undefined;
}

function toNumber(d) {
  return d == null ? 0 : parseFloat(String(d));
}

/* =========================
   Middlewares
   ========================= */

// CORS amplio (incluye PATCH/DELETE y preflight)
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS", "PUT"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// Logs simples para ver qué llega
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Health
app.get("/health", (_req, res) => res.json({ ok: true }));

/* =========================
   Productos (CRUD)
   ========================= */

// LISTAR
app.get("/productos", async (_req, res) => {
  const list = await prisma.producto.findMany({ orderBy: { id: "asc" } });
  res.json(list);
});

// CREAR (más tolerante con nombres de campos del front)
app.post("/productos", async (req, res) => {
  const b = req.body || {};

  // Aceptamos distintos aliases desde el front
  const skuRaw =
    b.sku ?? b.codigo ?? b.code ?? b.skuProducto ?? b.skuProductoNuevo;
  const nombreRaw =
    b.nombre ?? b.name ?? b.descripcion ?? b.description ?? b.titulo;

  if (!skuRaw || !nombreRaw) {
    return res
      .status(400)
      .json({ error: "sku y nombre son obligatorios" });
  }

  const stockRaw = b.stock ?? b.stockInicial ?? b.stockTotal ?? 0;
  const stock = Number(stockRaw);

  if (!Number.isFinite(stock) || stock < 0) {
    return res
      .status(400)
      .json({ error: "stock debe ser número >= 0" });
  }

  const data = {
    sku: String(skuRaw).trim(),
    nombre: String(nombreRaw).trim(),
    marca:
      (b.marca ?? b.brand ?? b.marcaProducto ?? null)?.trim?.() || null,
    categoria:
      (b.categoria ?? b.category ?? b.categoriaProducto ?? null)?.trim?.() ||
      null,
    ubicacion:
      (b.ubicacion ?? b.location ?? b.ubicacionBodega ?? null)?.trim?.() ||
      null,
    codigoBarras:
      (b.codigoBarras ?? b.barcode ?? b.codigo ?? null)?.trim?.() || null,
    stock,
  };

  try {
    const creado = await prisma.producto.create({ data });
    res.status(201).json(creado);
  } catch (e) {
    if (e?.code === "P2002") {
      const campo = e.meta?.target?.[0] || "campo único";
      return res
        .status(409)
        .json({ error: `Ya existe un producto con ese ${campo}` });
    }
    res.status(400).json({ error: String(e.message || e) });
  }
});

// ACTUALIZAR SOLO STOCK
app.patch("/productos/:id", async (req, res) => {
  const id = Number(req.params.id);
  const stock = Number(req.body?.stock);
  console.log("PATCH stock ->", { id, stock, body: req.body });

  if (!Number.isFinite(id) || !Number.isFinite(stock) || stock < 0) {
    return res
      .status(400)
      .json({ error: "id y stock deben ser numéricos, stock >= 0" });
  }
  try {
    const actualizado = await prisma.producto.update({
      where: { id },
      data: { stock },
    });
    res.json(actualizado);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// ELIMINAR
app.delete("/productos/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id))
    return res.status(400).json({ error: "id inválido" });
  try {
    await prisma.producto.delete({ where: { id } });
    res.status(204).send();
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// OBTENER 1 PRODUCTO
app.get("/productos/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id))
    return res.status(400).json({ error: "id inválido" });
  const p = await prisma.producto.findUnique({ where: { id } });
  if (!p) return res.status(404).json({ error: "no existe" });
  res.json(p);
});

// EDITAR CAMPOS (nombre, sku, marca, etc.)
app.put("/productos/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id))
    return res.status(400).json({ error: "id inválido" });

  const b = req.body || {};
  const data = {};

  if (b.sku != null) data.sku = String(b.sku).trim();
  if (b.nombre != null) data.nombre = String(b.nombre).trim();
  if (b.marca != null) data.marca = b.marca?.trim() || null;
  if (b.categoria != null) data.categoria = b.categoria?.trim() || null;
  if (b.ubicacion != null) data.ubicacion = b.ubicacion?.trim() || null;
  if (b.codigoBarras != null)
    data.codigoBarras = b.codigoBarras?.trim() || null;
  if (b.stock != null) {
    const s = Number(b.stock);
    if (!Number.isFinite(s) || s < 0)
      return res
        .status(400)
        .json({ error: "stock debe ser número >= 0" });
    data.stock = s;
  }

  try {
    const updated = await prisma.producto.update({ where: { id }, data });
    res.json(updated);
  } catch (e) {
    if (e?.code === "P2002") {
      const campo = e.meta?.target?.[0] || "campo único";
      return res
        .status(409)
        .json({ error: `Ya existe un producto con ese ${campo}` });
    }
    res.status(400).json({ error: String(e.message || e) });
  }
});

/* =========================
   Movimientos
   ========================= */

// POST /movimientos (por ahora sólo loguea y responde OK para evitar 404)
// Podemos refinarlo luego para que haga ajustes manuales.
app.post("/movimientos", async (req, res) => {
  console.log("[POST /movimientos] body:", req.body);
  res.status(201).json({ ok: true });
});

// LISTAR movimientos de stock (IN/OUT) con filtros básicos
app.get("/movimientos", async (req, res) => {
  try {
    const {
      q = "",
      tipo,
      page = "1",
      pageSize = "10",
    } = req.query;

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const sizeNumber = Math.max(parseInt(pageSize, 10) || 10, 1);
    const skip = (pageNumber - 1) * sizeNumber;

    const where = {};

    if (
      typeof tipo === "string" &&
      tipo.trim() !== "" &&
      tipo !== "ALL"
    ) {
      where.tipo = tipo; // enum MovimientoTipo en tu schema
    }

    if (typeof q === "string" && q.trim() !== "") {
      const query = q.trim();
      where.OR = [
        {
          producto: {
            sku: { contains: query, mode: "insensitive" },
          },
        },
        {
          producto: {
            nombre: { contains: query, mode: "insensitive" },
          },
        },
      ];
    }

    const movimientos = await prisma.stockMovimiento.findMany({
      where,
      orderBy: { id: "desc" },
      skip,
      take: sizeNumber,
      include: {
        producto: true,
      },
    });

    res.json(movimientos);
  } catch (e) {
    console.error("[GET /movimientos] Error:", e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});

/* =========================
   Ingresos (lectura + alta)
   ========================= */

// LISTAR cabeceras de ingresos
app.get("/ingresos", async (req, res) => {
  try {
    const { q = "", page = "1", pageSize = "10" } = req.query;

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const sizeNumber = Math.max(parseInt(pageSize, 10) || 10, 1);
    const skip = (pageNumber - 1) * sizeNumber;

    const where = {};

    if (typeof q === "string" && q.trim() !== "") {
      const query = q.trim();
      where.OR = [
        { proveedor: { contains: query, mode: "insensitive" } },
        { documento: { contains: query, mode: "insensitive" } },
        { observacion: { contains: query, mode: "insensitive" } },
      ];
    }

    const ingresos = await prisma.ingreso.findMany({
      where,
      orderBy: { id: "desc" },
      skip,
      take: sizeNumber,
    });

    res.json(ingresos);
  } catch (e) {
    console.error("[GET /ingresos] Error:", e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});

/* =========================
   Ingresos de stock + PPP
   ========================= */

app.post("/ingresos", async (req, res) => {
  const body = req.body || {};
  const items = Array.isArray(body.items) ? body.items : [];

  if (!Array.isArray(items) || items.length === 0) {
    return res
      .status(400)
      .json({ error: "Debe incluir al menos un ítem de ingreso." });
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      // Cabecera del ingreso
      const ingreso = await tx.ingreso.create({
        data: {
          fecha: parseDate(body.fecha),
          proveedor: body.proveedor ?? null,
          documento: body.documento ?? body.factura ?? null,
          observacion: body.observacion ?? null,
        },
      });

      // Procesar cada ítem
      for (const raw of items) {
        // Buscar producto por id o por sku
        let prod = null;
        let productoId = Number(raw?.productoId);

        if (Number.isFinite(productoId) && productoId > 0) {
          prod = await tx.producto.findUnique({
            where: { id: productoId },
            select: { id: true, stock: true, ppp: true },
          });
        } else {
          const skuRaw = raw?.sku ?? raw?.codigo ?? raw?.code;
          const sku = skuRaw == null ? "" : String(skuRaw).trim();
          if (!sku) {
            throw new Error(
              "Ítem inválido: debe incluir productoId o sku."
            );
          }
          prod = await tx.producto.findUnique({
            where: { sku },
            select: { id: true, stock: true, ppp: true },
          });
          if (!prod) {
            throw new Error(`Producto con SKU ${sku} no existe.`);
          }
          productoId = prod.id;
        }

        if (!prod) {
          throw new Error(`Producto ${productoId} no existe.`);
        }

        const cantidad = Number(raw?.cantidad ?? raw?.qty);
        if (!Number.isFinite(cantidad) || cantidad <= 0) {
          throw new Error("Ítem inválido: cantidad > 0 requerida.");
        }

        const costoUnitarioRaw =
          raw?.costoUnitario ??
          raw?.costo ??
          raw?.precio ??
          raw?.precioUnitario;
        const costoUnitario = Number(costoUnitarioRaw);
        if (!Number.isFinite(costoUnitario) || costoUnitario < 0) {
          throw new Error(
            "Ítem inválido: costoUnitario >= 0 requerido."
          );
        }

        const lote = raw?.lote ?? null;
        const venceAt = parseDate(
          raw?.venceAt ?? raw?.fechaVencimiento
        );

        const stockActual = prod.stock ?? 0;
        const pppActual = toNumber(prod.ppp);
        const nuevoStock = stockActual + cantidad;

        const nuevoPPP =
          stockActual === 0
            ? costoUnitario
            : (stockActual * pppActual +
                cantidad * costoUnitario) /
              nuevoStock;

        // Ítem del ingreso
        await tx.ingresoItem.create({
          data: {
            ingresoId: ingreso.id,
            productoId,
            cantidad,
            costoUnitario: decStr(costoUnitario, 2),
            lote,
            venceAt,
          },
        });

        // Actualizar Producto (stock + PPP)
        await tx.producto.update({
          where: { id: productoId },
          data: {
            stock: nuevoStock,
            ppp: decStr(nuevoPPP, 2),
          },
        });

        // Movimiento de stock (trazabilidad)
        await tx.stockMovimiento.create({
          data: {
            productoId,
            tipo: "IN",
            cantidad,
            costoUnitario: decStr(costoUnitario, 2),
            pppAntes: decStr(pppActual, 4),
            pppDespues: decStr(nuevoPPP, 4),
            refTipo: "INGRESO",
            refId: ingreso.id,
          },
        });
      }

      return ingreso;
    });

    res.status(201).json({ ok: true, ingresoId: created.id });
  } catch (e) {
    console.error("[POST /ingresos] Error:", e?.message || e);
    res.status(400).json({ error: e?.message || String(e) });
  }
});

/* =========================
   Reportes CSV (PPP)
   ========================= */

function csvEscape(s) {
  const v = (s ?? "").toString();
  return v.includes('"') || v.includes(",") || v.includes("\n")
    ? `"${v.replace(/"/g, '""')}"`
    : v;
}

// PPP vigente por producto (lo que está hoy en Producto)
app.get("/reportes/ppp.csv", async (_req, res) => {
  try {
    const rows = await prisma.producto.findMany({
      select: {
        id: true,
        sku: true,
        nombre: true,
        stock: true,
        ppp: true,
        actualizadoEn: true,
      },
      orderBy: { id: "asc" },
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="ppp_${ts}.csv"`
    );

    const header = "id,sku,nombre,stock,ppp,actualizadoEn\n";
    const body = rows
      .map((r) =>
        [
          r.id,
          csvEscape(r.sku ?? ""),
          csvEscape(r.nombre ?? ""),
          r.stock ?? 0,
          r.ppp == null
            ? "0.00"
            : Number.parseFloat(String(r.ppp)).toFixed(2),
          r.actualizadoEn?.toISOString?.() ?? "",
        ].join(",")
      )
      .join("\n");

    res.send(header + body);
  } catch (e) {
    console.error("[GET /reportes/ppp.csv] Error:", e?.message || e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// PPP histórico de compras (SUM(cantidad*costo)/SUM(cantidad) de todos los IngresoItem)
app.get("/reportes/ppp_historico.csv", async (_req, res) => {
  try {
    const productos = await prisma.producto.findMany({
      select: { id: true, sku: true, nombre: true },
      orderBy: { id: "asc" },
    });

    const items = await prisma.ingresoItem.findMany({
      select: {
        productoId: true,
        cantidad: true,
        costoUnitario: true,
      },
    });

    const agg = new Map(); // productoId -> { q, val }
    for (const it of items) {
      const pid = it.productoId;
      const q = Number(it.cantidad) || 0;
      const c = Number.parseFloat(String(it.costoUnitario)) || 0;
      const cur = agg.get(pid) || { q: 0, val: 0 };
      cur.q += q;
      cur.val += q * c;
      agg.set(pid, cur);
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="ppp_historico_${ts}.csv"`
    );

    const header =
      "id,sku,nombre,sum_cantidad,sum_valor,ppp_historico\n";
    const body = productos
      .map((p) => {
        const a = agg.get(p.id) || { q: 0, val: 0 };
        const pppHist = a.q > 0 ? a.val / a.q : 0;
        return [
          p.id,
          csvEscape(p.sku ?? ""),
          csvEscape(p.nombre ?? ""),
          a.q,
          a.val.toFixed(2),
          pppHist.toFixed(4),
        ].join(",");
      })
      .join("\n");

    res.send(header + body);
  } catch (e) {
    console.error(
      "[GET /reportes/ppp_historico.csv] Error:",
      e?.message || e
    );
    res.status(500).json({ error: e?.message || String(e) });
  }
});

/* =========================
   Proyectos: salidas/retornos
   ========================= */

app.post("/proyectos/salidas", async (req, res) => {
  const body = req.body || {};
  if (!body.proyecto || typeof body.proyecto !== "string") {
    return res
      .status(400)
      .json({ error: "Debe indicar 'proyecto' (string)." });
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return res
      .status(400)
      .json({ error: "Debe incluir al menos un ítem." });
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const header = await tx.movimientoProyecto.create({
        data: {
          proyecto: body.proyecto.trim(),
          tipo: "SALIDA",
          fecha: parseDate(body.fecha),
          documento: body.documento ?? null,
          observacion: body.observacion ?? null,
        },
      });

      for (const raw of body.items) {
        const cantidad = Number(raw?.cantidad);
        if (!Number.isFinite(cantidad) || cantidad <= 0) {
          throw new Error("Ítem inválido: cantidad > 0 requerida.");
        }

        // Buscar producto por id o sku
        let prod = null;
        if (raw?.productoId) {
          prod = await tx.producto.findUnique({
            where: { id: Number(raw.productoId) },
            select: {
              id: true,
              sku: true,
              stock: true,
              ppp: true,
            },
          });
        } else if (raw?.sku) {
          prod = await tx.producto.findUnique({
            where: { sku: String(raw.sku) },
            select: {
              id: true,
              sku: true,
              stock: true,
              ppp: true,
            },
          });
        } else {
          throw new Error(
            "Ítem inválido: debe incluir productoId o sku."
          );
        }

        if (!prod)
          throw new Error(
            `Producto no encontrado (${raw?.productoId ?? raw?.sku}).`
          );

        const stockActual = prod.stock ?? 0;
        if (stockActual < cantidad) {
          throw new Error(
            `Stock insuficiente para ${prod.sku || prod.id}. Actual: ${stockActual}, requerido: ${cantidad}.`
          );
        }

        const pppActualNum = toNumber(prod.ppp);
        const nuevoStock = stockActual - cantidad;

        // Detalle del movimiento a proyecto (guardamos costo = PPP vigente)
        await tx.movimientoProyectoItem.create({
          data: {
            movimientoId: header.id,
            productoId: prod.id,
            cantidad,
            costoUnitario: decStr(pppActualNum, 2),
          },
        });

        // Actualizar sólo el stock (PPP no cambia en salidas)
        await tx.producto.update({
          where: { id: prod.id },
          data: { stock: nuevoStock },
        });

        // Trazabilidad en StockMovimiento
        await tx.stockMovimiento.create({
          data: {
            productoId: prod.id,
            tipo: "OUT",
            cantidad,
            costoUnitario: decStr(pppActualNum, 2),
            pppAntes: decStr(pppActualNum, 4),
            pppDespues: decStr(pppActualNum, 4),
            refTipo: "PROYECTO_SALIDA",
            refId: header.id,
          },
        });
      }

      return header;
    });

    res.status(201).json({ ok: true, movimientoId: created.id });
  } catch (e) {
    console.error("[POST /proyectos/salidas] Error:", e?.message || e);
    res.status(400).json({ error: e?.message || String(e) });
  }
});

app.post("/proyectos/retornos", async (req, res) => {
  const body = req.body || {};
  if (!body.proyecto || typeof body.proyecto !== "string") {
    return res
      .status(400)
      .json({ error: "Debe indicar 'proyecto' (string)." });
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return res
      .status(400)
      .json({ error: "Debe incluir al menos un ítem." });
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const header = await tx.movimientoProyecto.create({
        data: {
          proyecto: body.proyecto.trim(),
          tipo: "RETORNO",
          fecha: parseDate(body.fecha),
          documento: body.documento ?? null,
          observacion: body.observacion ?? null,
        },
      });

      for (const raw of body.items) {
        const cantidad = Number(raw?.cantidad);
        if (!Number.isFinite(cantidad) || cantidad <= 0) {
          throw new Error("Ítem inválido: cantidad > 0 requerida.");
        }

        // Buscar producto por id o sku
        let prod = null;
        if (raw?.productoId) {
          prod = await tx.producto.findUnique({
            where: { id: Number(raw.productoId) },
            select: {
              id: true,
              sku: true,
              stock: true,
              ppp: true,
            },
          });
        } else if (raw?.sku) {
          prod = await tx.producto.findUnique({
            where: { sku: String(raw.sku) },
            select: {
              id: true,
              sku: true,
              stock: true,
              ppp: true,
            },
          });
        } else {
          throw new Error(
            "Ítem inválido: debe incluir productoId o sku."
          );
        }

        if (!prod)
          throw new Error(
            `Producto no encontrado (${raw?.productoId ?? raw?.sku}).`
          );

        const stockActual = prod.stock ?? 0;
        const pppActualNum = toNumber(prod.ppp);

        // Intentar usar el costo de la última SALIDA a proyecto de este producto
        const lastSalida = await tx.movimientoProyectoItem.findFirst({
          where: {
            productoId: prod.id,
            movimiento: { tipo: "SALIDA" },
          },
          orderBy: { id: "desc" },
          select: { costoUnitario: true },
        });

        const costoRetNum = lastSalida
          ? parseFloat(String(lastSalida.costoUnitario))
          : pppActualNum;

        const nuevoStock = stockActual + cantidad;
        const nuevoPPP =
          stockActual === 0
            ? costoRetNum
            : (stockActual * pppActualNum +
                cantidad * costoRetNum) /
              nuevoStock;

        // Detalle del retorno
        await tx.movimientoProyectoItem.create({
          data: {
            movimientoId: header.id,
            productoId: prod.id,
            cantidad,
            costoUnitario: decStr(costoRetNum, 2),
          },
        });

        // Actualizar stock y PPP
        await tx.producto.update({
          where: { id: prod.id },
          data: {
            stock: nuevoStock,
            ppp: decStr(nuevoPPP, 2),
          },
        });

        // Trazabilidad en StockMovimiento
        await tx.stockMovimiento.create({
          data: {
            productoId: prod.id,
            tipo: "IN",
            cantidad,
            costoUnitario: decStr(costoRetNum, 2),
            pppAntes: decStr(pppActualNum, 4),
            pppDespues: decStr(nuevoPPP, 4),
            refTipo: "PROYECTO_RETORNO",
            refId: header.id,
          },
        });
      }

      return header;
    });

    res.status(201).json({ ok: true, movimientoId: created.id });
  } catch (e) {
    console.error("[POST /proyectos/retornos] Error:", e?.message || e);
    res.status(400).json({ error: e?.message || String(e) });
  }
});

/* =========================
   Lookups por SKU / código
   ========================= */

app.get("/productos/by-sku/:sku", async (req, res) => {
  try {
    const sku = String(req.params.sku);
    const p = await prisma.producto.findUnique({ where: { sku } });
    if (!p) return res.status(404).json({ error: "no existe" });
    res.json(p);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// --- Lookup por código de barras ---
app.get("/productos/by-codigo/:code", async (req, res) => {
  try {
    const code = String(req.params.code);
    const p = await prisma.producto.findUnique({
      where: { codigoBarras: code },
    });
    if (!p) return res.status(404).json({ error: "no existe" });
    res.json(p);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

/* =========================
   Server start
   ========================= */

const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`API on http://0.0.0.0:${PORT}`);
});
