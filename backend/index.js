require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { PrismaClient, RefTipo, ProyectoMovTipo, Prisma} = require("@prisma/client");

const prisma = new PrismaClient();
const app = express();

// Services de negocio (PPP, stock, etc.)
const {
  registrarSalida,
  registrarEntradaRetorno,
} = require("./services/stockService");
const { crearIngreso } = require("./services/ingresoService");

/* =========================
   Helpers
   ========================= */

function parseDate(s) {
  return s ? new Date(s) : undefined;
}

function apiToDbMovementType(apiTipo) {
  switch (apiTipo) {
    case "Ingreso":
      return "IN";
    case "Salida":
      return "OUT";
    case "Ajuste":
      return "ADJUST";
    default:
      return undefined;
  }
}

function dbToApiMovementType(dbTipo) {
  switch (dbTipo) {
    case "IN":
      return "Ingreso";
    case "OUT":
      return "Salida";
    case "ADJUST":
      return "Ajuste";
    default:
      return "Ajuste";
  }
}

function refTipoToMotivo(ref) {
  switch (ref) {
    case "INGRESO":
      return "Ingreso";
    case "MOVIMIENTO_PROYECTO_SALIDA":
      return "Salida a proyecto";
    case "MOVIMIENTO_PROYECTO_RETORNO":
      return "Retorno desde proyecto";
    case "DEVOLUCION_PROVEEDOR":
      return "Devolución a proveedor";
    case "AJUSTE":
      return "Ajuste manual";
    default:
      return ref || null;
  }
}

function csvEscape(s) {
  const v = (s ?? "").toString();
  return v.includes('"') || v.includes(",") || v.includes("\n")
    ? `"${v.replace(/"/g, '""')}"`
    : v;
}

function getNombreFromBody(body) {
  const raw =
    body?.nombre ??
    body?.name ??
    body?.label ??
    body?.titulo ??
    null;
  return typeof raw === "string" ? raw.trim() : "";
}

/* =========================
   Middlewares
   ========================= */

app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS", "PUT"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Health
app.get("/health", (_req, res) => res.json({ ok: true }));

/* =========================
   Auth
   ========================= */

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    console.log("[POST /login] body:", req.body);

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email y contraseña son obligatorios" });
    }

    const emailNorm = String(email).trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: emailNorm },
    });

    if (!user) {
      console.warn("[POST /login] usuario no encontrado:", emailNorm);
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const stored = user.passwordHash || user.password || null;

    if (!stored) {
      console.error("[POST /login] Usuario sin password en BD");
      return res
        .status(500)
        .json({ error: "Usuario sin contraseña configurada" });
    }

    let ok = false;
    if (
      typeof stored === "string" &&
      stored.startsWith("$2") &&
      stored.length > 30
    ) {
      // bcrypt
      ok = await bcrypt.compare(String(password), stored);
    } else {
      // texto plano (para pruebas)
      ok = String(password) === String(stored);
    }

    if (!ok) {
      console.warn("[POST /login] password incorrecto para:", emailNorm);
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const role = user.role || user.rol || "WAREHOUSE";

    return res.json({
      email: user.email,
      role,
    });
  } catch (e) {
    console.error("[POST /login] Error:", e);
    return res
      .status(500)
      .json({ error: "Error interno al iniciar sesión" });
  }
});

/* =========================
   Productos
   ========================= */
// LISTAR productos
app.get("/productos", async (_req, res) => {
  try {
    const list = await prisma.producto.findMany({
      orderBy: { id: "asc" },
      include: {
        proveedor: {
          select: { id: true, nombre: true, rut: true },
        },
      },
    });
    res.json(list);
  } catch (e) {
    console.error("[GET /productos] Error:", e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});


// CREAR producto
app.post("/productos", async (req, res) => {
  try {
    console.log("[POST /productos] body:", req.body);

    const {
      sku,
      nombre,
      descripcion,
      categoriaId,
      categoriaCodigo,
      subcategoriaId,
      proveedorId,
      stock,
      stockMinimo,
      ubicacion,
      codigoBarras,
      imagenUrl,
    } = req.body || {};

    if (!sku || !nombre) {
      return res.status(400).json({
        error: "SKU y nombre son obligatorios",
      });
    }

    // ==== Resolver categoría (por id o por código) ====
    let categoriaIdNum = null;

    if (categoriaId !== undefined && categoriaId !== null && categoriaId !== "") {
      const tmp = Number(categoriaId);
      if (Number.isNaN(tmp) || tmp <= 0) {
        return res
          .status(400)
          .json({ error: "categoriaId es obligatorio y debe ser numérico" });
      }
      categoriaIdNum = tmp;
    } else if (categoriaCodigo) {
      const cat = await prisma.categoria.findUnique({
        where: { codigo: String(categoriaCodigo) },
      });

      if (!cat) {
        return res.status(400).json({
          error: `No existe una categoría con código "${categoriaCodigo}". ` +
            `Crea la categoría primero en el catálogo.`,
        });
      }

      categoriaIdNum = cat.id;
    } else {
      return res.status(400).json({
        error:
          "Debes enviar categoriaId o categoriaCodigo para crear el producto.",
      });
    }

    // ==== Subcategoría opcional ====
    let subcategoriaIdNum = null;
    if (subcategoriaId !== undefined && subcategoriaId !== null && subcategoriaId !== "") {
      const tmp = Number(subcategoriaId);
      if (Number.isNaN(tmp) || tmp <= 0) {
        return res.status(400).json({
          error: "subcategoriaId debe ser numérico",
        });
      }
      subcategoriaIdNum = tmp;
    }

    // ==== Proveedor obligatorio ====
    const proveedorIdNum = Number(proveedorId);
    if (!proveedorIdNum || Number.isNaN(proveedorIdNum)) {
      return res.status(400).json({
        error: "proveedorId es obligatorio y debe ser numérico",
      });
    }

    // ==== Stock / stock mínimo ====
    const stockNum = stock !== undefined && stock !== null && stock !== ""
      ? Number(stock)
      : 0;
    const stockMinNum =
      stockMinimo !== undefined && stockMinimo !== null && stockMinimo !== ""
        ? Number(stockMinimo)
        : 0;

    if (Number.isNaN(stockNum) || stockNum < 0) {
      return res
        .status(400)
        .json({ error: "stock debe ser un número mayor o igual a 0" });
    }
    if (Number.isNaN(stockMinNum) || stockMinNum < 0) {
      return res.status(400).json({
        error: "stockMinimo debe ser un número mayor o igual a 0",
      });
    }

    const nuevo = await prisma.producto.create({
      data: {
        sku: String(sku).trim(),
        nombre: String(nombre).trim(),
        descripcion: descripcion ? String(descripcion).trim() : null,
        categoriaId: categoriaIdNum,
        subcategoriaId: subcategoriaIdNum,
        proveedorId: proveedorIdNum,
        stock: stockNum,
        stockMinimo: stockMinNum,
        ubicacion: ubicacion ? String(ubicacion).trim() : null,
        codigoBarras: codigoBarras ? String(codigoBarras).trim() : null,
        imagenUrl: imagenUrl ? String(imagenUrl).trim() : null,
      },
    });

    return res.json({ ok: true, data: nuevo });
  } catch (e) {
    console.error("[POST /productos] Error:", e);
    return res
      .status(500)
      .json({ error: "Error interno al crear el producto" });
  }
});

// OBTENER 1 producto
app.get("/productos/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "id inválido" });
  }

  try {
    const p = await prisma.producto.findUnique({
      where: { id },
    });
    if (!p) return res.status(404).json({ error: "no existe" });
    res.json(p);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// EDITAR producto (modelo nuevo con categoriaId / proveedorId / imagenUrl)
app.put("/productos/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "id inválido" });
  }

  const b = req.body || {};
  console.log("[PUT /productos/:id] body:", b);

  const data = {};

  if (b.sku != null) {
    const sku = String(b.sku).trim();
    if (!sku) {
      return res.status(400).json({ error: "sku no puede estar vacío" });
    }
    data.sku = sku;
  }

  if (b.nombre != null) {
    const nombre = String(b.nombre).trim();
    if (!nombre) {
      return res
        .status(400)
        .json({ error: "El nombre del producto es obligatorio." });
    }
    data.nombre = nombre;
  }

  if (b.descripcion !== undefined) {
    const d = b.descripcion;
    data.descripcion =
      d == null || String(d).trim() === "" ? null : String(d).trim();
  }

  if (b.ubicacion !== undefined) {
    const u = b.ubicacion;
    data.ubicacion =
      u == null || String(u).trim() === "" ? null : String(u).trim();
  }

  if (b.codigoBarras !== undefined) {
    const c = b.codigoBarras;
    data.codigoBarras =
      c == null || String(c).trim() === "" ? null : String(c).trim();
  }

  if (b.imagenUrl !== undefined) {
    const img = b.imagenUrl;
    data.imagenUrl =
      img == null || String(img).trim() === "" ? null : String(img).trim();
  }

  if (b.stock != null) {
    const s = Number(b.stock);
    if (!Number.isFinite(s) || s < 0) {
      return res
        .status(400)
        .json({ error: "stock debe ser un número mayor o igual a 0" });
    }
    data.stock = s;
  }

  if (b.stockMinimo != null) {
    const sm = Number(b.stockMinimo);
    if (!Number.isFinite(sm) || sm < 0) {
      return res
        .status(400)
        .json({ error: "stockMinimo debe ser un número mayor o igual a 0" });
    }
    data.stockMinimo = sm;
  }

  // Relaciones por ID
  if (b.categoriaId != null) {
    const catId = Number(b.categoriaId);
    if (!Number.isFinite(catId)) {
      return res
        .status(400)
        .json({ error: "categoriaId debe ser numérico" });
    }
    data.categoriaId = catId;
  }

  if (b.subcategoriaId != null) {
    if (b.subcategoriaId === "" || b.subcategoriaId === null) {
      data.subcategoriaId = null; // limpiar subcategoría
    } else {
      const subId = Number(b.subcategoriaId);
      if (!Number.isFinite(subId)) {
        return res
          .status(400)
          .json({ error: "subcategoriaId debe ser numérico" });
      }
      data.subcategoriaId = subId;
    }
  }

  if (b.proveedorId != null) {
    const provId = Number(b.proveedorId);
    if (!Number.isFinite(provId)) {
      return res
        .status(400)
        .json({ error: "proveedorId debe ser numérico" });
    }
    data.proveedorId = provId;
  }

  try {
    const updated = await prisma.producto.update({
      where: { id },
      data,
    });
    res.json(updated);
  } catch (e) {
    if (e?.code === "P2002") {
      const campo = e.meta?.target?.[0] || "campo único";
      return res
        .status(409)
        .json({ error: `Ya existe un producto con ese ${campo}` });
    }
    console.error("[PUT /productos/:id] Error:", e);
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// ELIMINAR producto
app.delete("/productos/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  console.log("[DELETE /productos/:id] id =", id);

  try {
    // Verificar si el producto tiene registros asociados
    const [
      ingresosItems,
      stockMovimientos,
      movProyectoItems,
      devolucionesProveedorItems,
    ] = await Promise.all([
      prisma.ingresoItem.count({ where: { productoId: id } }),
      prisma.stockMovimiento.count({ where: { productoId: id } }),
      prisma.movimientoProyectoItem
        ? prisma.movimientoProyectoItem.count({ where: { productoId: id } })
        : Promise.resolve(0),
      prisma.devolucionProveedorItem
        ? prisma.devolucionProveedorItem.count({ where: { productoId: id } })
        : Promise.resolve(0),
    ]);

    const tieneReferencias =
      ingresosItems > 0 ||
      stockMovimientos > 0 ||
      movProyectoItems > 0 ||
      devolucionesProveedorItems > 0;

    if (tieneReferencias) {
      // Regla de negocio: no se permite borrar
      return res.status(409).json({
        ok: false,
        message:
          "No se puede eliminar el producto porque tiene ingresos, movimientos o devoluciones asociadas. " +
          "Márcalo como inactivo si ya no se usa.",
      });
    }

    // Si no tiene hijos, se puede borrar
    await prisma.producto.delete({ where: { id } });

    return res.status(204).send();
  } catch (error) {
    console.error("[DELETE /productos/:id] Error eliminando producto:", error);

    if (error.code === "P2003") {
      return res.status(409).json({
        ok: false,
        message:
          "No se puede eliminar el producto porque está referenciado por otros registros.",
      });
    }

    return res
      .status(500)
      .json({ ok: false, message: "Error interno eliminando producto" });
  }
});


// Actualizar SOLO stock (no PPP)
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
   Movimientos
   ========================= */


async function registrarRetorno(tx, params) {
  const { productoId, cantidad, refTipo, refId } = params;

  if (!productoId) {
    throw new Error("productoId es obligatorio en registrarRetorno");
  }
  if (!cantidad || cantidad <= 0) {
    throw new Error("cantidad debe ser mayor a 0 en registrarRetorno");
  }
  if (!refTipo) {
    throw new Error("refTipo es obligatorio en registrarRetorno");
  }

  // Traer producto
  const prod = await tx.producto.findUnique({
    where: { id: productoId },
    select: { id: true, stock: true, ppp: true },
  });

  if (!prod) {
    throw new Error(`Producto con id ${productoId} no existe`);
  }

  // PPP antes/después (no cambia en un retorno)
  const pppActual = prod.ppp ?? 0;

  // Registrar movimiento de stock (IN)
  await tx.stockMovimiento.create({
    data: {
      productoId,
      tipo: "IN",
      cantidad,
      costoUnitario: null,
      pppAntes: pppActual,
      pppDespues: pppActual,
      refTipo,
      refId: refId ?? null,
    },
  });

  // Actualizar stock del producto
  await tx.producto.update({
    where: { id: productoId },
    data: {
      stock: prod.stock + cantidad,
    },
  });
}

module.exports = {
  registrarSalida,
  registrarRetorno,
};

// Helper genérico para obtener un proyecto a partir de varios formatos de entrada
async function resolveProyecto(arg1, arg2) {
  // Soportar tanto resolveProyecto(body) como resolveProyecto(tx, body)
  const from = arg2 !== undefined ? arg2 : arg1;

  let proyectoIdRaw;

  if (from && typeof from === "object" && !Array.isArray(from)) {
    if (from.proyectoId != null) {
      proyectoIdRaw = from.proyectoId;
    } else if (from.id != null) {
      proyectoIdRaw = from.id;
    } else if (from.proyecto && typeof from.proyecto === "object") {
      proyectoIdRaw = from.proyecto.id;
    } else {
      proyectoIdRaw = undefined;
    }
  } else {
    proyectoIdRaw = from;
  }

  const proyectoId = Number(proyectoIdRaw);

  if (!Number.isFinite(proyectoId) || proyectoId <= 0) {
    throw new Error("Proyecto inválido (ID incorrecto).");
  }

  const proyecto = await prisma.proyecto.findUnique({
    where: { id: proyectoId },
  });

  if (!proyecto) {
    throw new Error("El proyecto seleccionado no existe.");
  }

  return proyecto;
}


async function resolveBodegaInicial() {

  const bodega = await prisma.bodega.findFirst();

  if (!bodega) {
    throw new Error(
      "No hay bodegas configuradas. Crea la bodega inicial en el módulo de bodegas."
    );
  }

  return bodega;
}


app.post("/movimientos", async (req, res) => {
  try {
    console.log("[POST /movimientos] body:", req.body);

    const {
      tipo,
      proyectoId,
      documento,
      observacion,
      items,
    } = req.body || {};

    // Validaciones básicas de payload
    if (!tipo || typeof tipo !== "string") {
      return res.status(400).json({
        error:
          "El campo 'tipo' es obligatorio (por ejemplo: 'SALIDA', 'ENTRADA', 'AJUSTE').",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error:
          "Debes enviar al menos un ítem en 'items', con SKU y cantidad mayor a 0.",
      });
    }

    const cleanedItems = [];
    for (const raw of items) {
      const sku = (raw?.sku ?? "").trim();
      const cantidadNum = Number(raw?.cantidad);

      if (!sku) {
        return res.status(400).json({
          error:
            "Todos los ítems deben tener un 'sku' no vacío.",
        });
      }
      if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) {
        return res.status(400).json({
          error:
            "Todos los ítems deben tener una 'cantidad' numérica mayor a 0.",
        });
      }

      cleanedItems.push({
        sku,
        cantidad: cantidadNum,
      });
    }

    if (
      proyectoId != null &&
      (!Number.isInteger(proyectoId) || proyectoId <= 0)
    ) {
      return res.status(400).json({
        error:
          "Si envías 'proyectoId', debe ser un número entero mayor a 0.",
      });
    }

    return res.status(201).json({
      ok: true,
      message:
        "Movimiento recibido correctamente. La lógica de impacto en stock/PPP se implementará en una etapa posterior.",
      tipo,
      proyectoId: proyectoId ?? null,
      documento: (documento ?? null) || null,
      observacion: (observacion ?? null) || null,
      items: cleanedItems,
    });
  } catch (e) {
    console.error("[POST /movimientos] Error:", e);
    return res.status(500).json({
      error:
        "Error interno al registrar el movimiento. Revisa los logs del servidor.",
    });
  }
});


// LISTAR movimientos de stock
app.get("/movimientos", async (req, res) => {
  try {
    const {
      q = "",
      tipo = "",
      page = "1",
      pageSize = "10",
    } = req.query;

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const sizeNumber = Math.max(parseInt(pageSize, 10) || 10, 1);
    const skip = (pageNumber - 1) * sizeNumber;

    const where = {};

    if (typeof tipo === "string" && tipo.trim() !== "" && tipo !== "ALL") {
      const tipoDb = apiToDbMovementType(tipo.trim());
      if (tipoDb) {
        where.tipo = tipoDb;
      }
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

    const [rows, total] = await Promise.all([
      prisma.stockMovimiento.findMany({
        where,
        orderBy: { id: "desc" },
        skip,
        take: sizeNumber,
        include: {
          producto: {
            select: { sku: true },
          },
        },
      }),
      prisma.stockMovimiento.count({ where }),
    ]);

    const data = rows.map((m) => ({
      id: m.id,
      fecha: m.createdAt.toISOString(),
      tipo: dbToApiMovementType(m.tipo),
      sku: m.producto?.sku ?? "",
      cantidad: m.cantidad,
      bodega: null,
      motivo: refTipoToMotivo(m.refTipo),
      referencia: m.refId != null ? String(m.refId) : "",
    }));

    res.json({ data, total });
  } catch (e) {
    console.error("[GET /movimientos] Error:", e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});

/* =========================
   Ingresos
   ========================= */

// LISTAR ingresos
app.get("/ingresos", async (req, res) => {
  try {
    const { q = "", page = "1", pageSize = "10" } = req.query;

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const sizeNumber = Math.max(parseInt(pageSize, 10) || 10, 1);
    const skip = (pageNumber - 1) * sizeNumber;

    const where = {};

    // Filtro por texto (proveedor.nombre, numeroDocumento, observacion)
    if (typeof q === "string" && q.trim() !== "") {
      const query = q.trim();

      where.OR = [
        // nombre del proveedor
        {
          proveedor: {
            is: {
              nombre: {
                contains: query,
                mode: "insensitive",
              },
            },
          },
        },
        // número de documento
        {
          numeroDocumento: {
            contains: query,
            mode: "insensitive",
          },
        },
        // observación
        {
          observacion: {
            contains: query,
            mode: "insensitive",
          },
        },
      ];
    }

    const [ingresos, total] = await Promise.all([
      prisma.ingreso.findMany({
        where,
        orderBy: { id: "desc" },
        skip,
        take: sizeNumber,
        include: {
          proveedor: true,
          items: {
            include: {
              producto: {
                select: { sku: true },
              },
            },
          },
        },
      }),
      prisma.ingreso.count({ where }),
    ]);

    const data = ingresos.map((ing) => ({
      id: ing.id,
      proveedor: ing.proveedor ? ing.proveedor.nombre : "",
      tipoDocumento: ing.tipoDocumento,
      numeroDocumento: ing.numeroDocumento,
      observacion: ing.observacion ?? "",
      fecha: ing.fecha.toISOString(),
      estado: "Confirmado",

      items: ing.items.map((it) => ({
        sku: it.producto?.sku ?? "",
        cantidad: it.cantidad,
        costo:
          it.costoUnitario != null
            ? Number.parseFloat(String(it.costoUnitario))
            : undefined,
      })),
    }));

    res.json({ data, total });
  } catch (e) {
    console.error("[GET /ingresos] Error:", e);
    res.status(500).json({
      error: e && e.message ? e.message : String(e),
    });
  }
});


app.put("/ingresos/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "id inválido." });
  }

  const b = req.body || {};
  console.log("[PUT /ingresos/:id] body:", b);

  const data = {};

  if (b.documento !== undefined) {
    data.documento = b.documento ? String(b.documento).trim() : null;
  }
  if (b.observacion !== undefined) {
    data.observacion = b.observacion ? String(b.observacion).trim() : null;
  }
  if (b.fecha !== undefined) {
    data.fecha = parseDate(b.fecha);
  }

  try {
    const updated = await prisma.ingreso.update({
      where: { id },
      data,
    });
    res.json(updated);
  } catch (e) {
    console.error("[PUT /ingresos/:id] Error:", e);
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// CREAR ingreso usando servicio (PPP, stock, etc.)
app.post("/ingresos", async (req, res) => {
  console.log("[POST /ingresos] body:", JSON.stringify(req.body, null, 2));
  try {
    const result = await crearIngreso(req.body);
    res.status(201).json({
      ok: true,
      ingresoId: result.ingreso.id,
    });
  } catch (e) {
    console.error("[POST /ingresos] Error:", e?.message || e);
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

/* =========================
   Proyectos: salidas/retornos
   ========================= */

async function resolveProveedor(tx, payload) {
  // 1) proveedorId directo (lo que envía el frontend)
  if (payload.proveedorId != null) {
    const id = Number(payload.proveedorId);
    if (!Number.isFinite(id)) {
      throw new Error("proveedorId inválido");
    }

    const prov = await tx.proveedor.findUnique({ where: { id } });
    if (!prov) {
      throw new Error(`Proveedor con id ${id} no encontrado.`);
    }
    return prov;
  }

  // 2) proveedor.id dentro del objeto proveedor (compatibilidad)
  if (
    payload.proveedor &&
    typeof payload.proveedor === "object" &&
    payload.proveedor.id != null
  ) {
    const id = Number(payload.proveedor.id);
    if (!Number.isFinite(id)) {
      throw new Error("proveedor.id inválido");
    }

    const prov = await tx.proveedor.findUnique({ where: { id } });
    if (!prov) {
      throw new Error(`Proveedor con id ${id} no encontrado.`);
    }
    return prov;
  }

  // 3) Lógica antigua: buscar por rut / nombre (sin crear)
  if (payload.proveedor && typeof payload.proveedor === "object") {
    const rawRut = payload.proveedor.rut ?? "";
    const rawNombre = payload.proveedor.nombre ?? "";

    const rut =
      typeof rawRut === "string" ? rawRut.trim() : String(rawRut).trim();
    const nombre =
      typeof rawNombre === "string"
        ? rawNombre.trim()
        : String(rawNombre).trim();

    if (rut) {
      const prov = await tx.proveedor.findFirst({
        where: { rut },
      });
      if (!prov) {
        throw new Error(`Proveedor con RUT ${rut} no encontrado.`);
      }
      return prov;
    }

    if (nombre) {
      const prov = await tx.proveedor.findFirst({
        where: { nombre },
      });
      if (!prov) {
        throw new Error(`Proveedor con nombre "${nombre}" no encontrado.`);
      }
      return prov;
    }
  }

  // 4) Nada válido
  throw new Error(
    "Debe indicar proveedorId o un objeto proveedor con rut/nombre válido."
  );
}


async function resolveBodegaPrincipal(tx) {
  const principal = await tx.bodega.findFirst({
    where: { esPrincipal: true },
  });
  if (!principal) {
    throw new Error(
      "No se encontró bodega principal. Crea una y marca esPrincipal = true."
    );
  }
  return principal;
}

async function resolveProveedor(tx, body) {
  if (body.proveedorId) {
    const prov = await tx.proveedor.findUnique({
      where: { id: Number(body.proveedorId) },
    });
    if (!prov) {
      throw new Error(`Proveedor con id ${body.proveedorId} no encontrado.`);
    }
    return prov;
  }

  if (body.proveedor && typeof body.proveedor === "object") {
    const { rut, nombre } = body.proveedor;

    if (rut) {
      const prov = await tx.proveedor.findFirst({
        where: { rut: String(rut).trim() },
      });
      if (!prov) {
        throw new Error(`Proveedor con RUT ${rut} no encontrado.`);
      }
      return prov;
    }

    if (nombre) {
      const prov = await tx.proveedor.findFirst({
        where: { nombre: String(nombre).trim() },
      });
      if (!prov) {
        throw new Error(`Proveedor con nombre "${nombre}" no encontrado.`);
      }
      return prov;
    }
  }

  throw new Error(
    "Debe indicar proveedorId o proveedor.rut / proveedor.nombre."
  );
}

// =========================
// Egresos (salidas) desde bodega a proyecto
// =========================
app.post("/proyectos/salidas", async (req, res) => {
  try {
    console.log("[POST /proyectos/salidas] body:", req.body);

    const { proyectoId, documento, observacion, items } = req.body || {};

    // 1) Validar y resolver proyecto
    let proyecto;
    try {
      // acepta { proyectoId } gracias a resolveProyecto
      proyecto = await resolveProyecto({ proyectoId });
    } catch (err) {
      console.error("[POST /proyectos/salidas] Proyecto inválido:", err);
      return res
        .status(400)
        .json({ error: err.message || "Proyecto inválido." });
    }

    // 2) Resolver bodega inicial (desde donde sale el stock)
    let bodega;
    try {
      bodega = await resolveBodegaInicial();
    } catch (err) {
      console.error("[POST /proyectos/salidas] Bodega inválida:", err);
      return res
        .status(400)
        .json({ error: err.message || "Bodega inválida." });
    }

    // 3) Validar items
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error:
          "Debes enviar al menos un ítem con SKU y cantidad mayor a 0.",
      });
    }

    const cleanedItems = [];
    for (const raw of items) {
      const sku = String(raw?.sku || "").trim();
      const cantidadNum = Number(raw?.cantidad);

      if (!sku) {
        return res.status(400).json({
          error: "Todos los ítems deben tener un SKU no vacío.",
        });
      }
      if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) {
        return res.status(400).json({
          error:
            "Todos los ítems deben tener una cantidad numérica mayor a 0.",
        });
      }

      cleanedItems.push({ sku, cantidad: cantidadNum });
    }

    // 4) Traer productos por SKU
    const skus = cleanedItems.map((it) => it.sku);
    const productos = await prisma.producto.findMany({
      where: { sku: { in: skus } },
    });

    if (productos.length !== cleanedItems.length) {
      const encontrados = new Set(productos.map((p) => p.sku));
      const faltantes = cleanedItems
        .filter((it) => !encontrados.has(it.sku))
        .map((it) => it.sku);

      return res.status(400).json({
        error:
          "Hay productos del formulario que no existen en el catálogo: " +
          faltantes.join(", "),
      });
    }

    const mapProductos = new Map();
    for (const p of productos) {
      mapProductos.set(p.sku, p);
    }

    // 5) Transacción: cabecera + ítems + movimiento de stock (usando registrarSalida)
    const result = await prisma.$transaction(async (tx) => {
      const mov = await tx.movimientoProyecto.create({
        data: {
          tipo: ProyectoMovTipo.SALIDA,
          tipoDocumento: null,
          numeroDocumento:
            documento && String(documento).trim() !== ""
              ? String(documento).trim()
              : null,
          observacion:
            observacion && String(observacion).trim() !== ""
              ? String(observacion).trim()
              : null,
          proyecto: {
            connect: { id: proyecto.id },
          },
          bodega: {
            connect: { id: bodega.id },
          },
        },
      });

      for (const it of cleanedItems) {
        const prod = mapProductos.get(it.sku);
        const costoUnitario = prod.ppp ?? 0;

        // Ítem del movimiento de proyecto
        await tx.movimientoProyectoItem.create({
          data: {
            movimientoId: mov.id,
            productoId: prod.id,
            cantidad: it.cantidad,
            costoUnitario,
          },
        });

        // Movimiento de stock + actualización de stock/PPP
        await registrarSalida(tx, {
          productoId: prod.id,
          cantidad: it.cantidad,
          refTipo: RefTipo.MOVIMIENTO_PROYECTO_SALIDA,
          refId: mov.id,
        });
      }

      return mov;
    });

    return res.status(201).json({
      ok: true,
      movimientoId: result.id,
    });
  } catch (e) {
    console.error("[POST /proyectos/salidas] Error:", e);
    const msg =
      e instanceof Error
        ? e.message
        : "Error interno al registrar egreso.";
    return res.status(400).json({ error: msg });
  }
});


// RETORNOS desde proyecto
app.post("/proyectos/retornos", async (req, res) => {
  const body = req.body || {};

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return res
      .status(400)
      .json({ error: "Debe incluir al menos un ítem." });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const proyecto = await resolveProyecto(tx, body);
      const bodega = await resolveBodegaPrincipal(tx);

      const header = await tx.movimientoProyecto.create({
        data: {
          tipo: ProyectoMovTipo.RETORNO,
          fecha: parseDate(body.fecha) || new Date(),
          tipoDocumento: null,
          numeroDocumento:
            body.documento && String(body.documento).trim() !== ""
              ? String(body.documento).trim()
              : null,
          observacion:
            body.observacion && String(body.observacion).trim() !== ""
              ? String(body.observacion).trim()
              : null,
          proyecto: {
            connect: { id: proyecto.id },
          },
          bodega: {
            connect: { id: bodega.id },
          },
        },
      });

      for (const raw of body.items) {
        const cantidad = Number(raw?.cantidad);
        if (!Number.isFinite(cantidad) || cantidad <= 0) {
          throw new Error("Ítem inválido: cantidad > 0 requerida.");
        }

        let prod = null;
        if (raw.productoId) {
          prod = await tx.producto.findUnique({
            where: { id: Number(raw.productoId) },
          });
        } else if (raw.sku) {
          prod = await tx.producto.findUnique({
            where: { sku: String(raw.sku).trim() },
          });
        } else {
          throw new Error(
            "Ítem inválido: debe incluir productoId o sku."
          );
        }

        if (!prod) {
          throw new Error(
            `Producto no encontrado (${raw?.productoId ?? raw?.sku}).`
          );
        }

        const costoUnitario = prod.ppp
          ? Number.parseFloat(String(prod.ppp))
          : 0;

        await tx.movimientoProyectoItem.create({
          data: {
            movimientoId: header.id,
            productoId: prod.id,
            cantidad,
            costoUnitario,
          },
        });

        await registrarEntradaRetorno(tx, {
          productoId: prod.id,
          cantidad,
          refTipo: RefTipo.MOVIMIENTO_PROYECTO_RETORNO, // 👈 enum correcto
          refId: header.id,
        });
      }

      return { header, proyecto, bodega };
    });

    res.status(201).json({
      ok: true,
      movimientoId: result.header.id,
      proyecto: {
        id: result.proyecto.id,
        nombre: result.proyecto.nombre,
      },
    });
  } catch (e) {
    console.error("[POST /proyectos/retornos] Error:", e?.message || e);
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// LISTAR movimientos de proyecto (salidas y retornos)
app.get("/proyectos/movimientos", async (req, res) => {
  try {
    const {
      q = "",
      tipo = "ALL",
      page = "1",
      pageSize = "20",
    } = req.query;

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const sizeNumber = Math.max(parseInt(pageSize, 10) || 20, 1);
    const skip = (pageNumber - 1) * sizeNumber;

    const where = {};

    // Filtro por tipo: SALIDA / RETORNO
    if (typeof tipo === "string" && tipo !== "ALL" && tipo.trim() !== "") {
      const t = tipo.trim().toUpperCase();
      if (t === "SALIDA" || t === "RETORNO") {
        where.tipo = t;
      }
    }

    // (opcional) filtro por documento/observación
    if (typeof q === "string" && q.trim() !== "") {
      const term = q.trim();
      where.OR = [
        { numeroDocumento: { contains: term, mode: "insensitive" } },
        { observacion: { contains: term, mode: "insensitive" } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.movimientoProyecto.findMany({
        where,
        orderBy: { id: "desc" },
        skip,
        take: sizeNumber,
        include: {
          proyecto: {
            select: { nombre: true },
          },
          items: {
            include: {
              producto: {
                select: {
                  sku: true,
                  nombre: true,
                },
              },
            },
          },
        },
      }),
      prisma.movimientoProyecto.count({ where }),
    ]);

    const data = rows.map((m) => ({
      id: m.id,
      fecha: m.fecha.toISOString(),
      tipo: m.tipo === "SALIDA" ? "Salida" : "Retorno",
      proyecto: m.proyecto?.nombre ?? "",
      documento: m.numeroDocumento ?? "",
      observacion: m.observacion ?? "",
      items: m.items.map((it) => ({
        sku: it.producto?.sku ?? "",
        nombre: it.producto?.nombre ?? "",
        cantidad: it.cantidad,
        costoUnitario:
          it.costoUnitario != null
            ? Number.parseFloat(String(it.costoUnitario))
            : undefined,
      })),
    }));

    res.json({ data, total });
  } catch (e) {
    console.error("[GET /proyectos/movimientos] Error:", e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});



/* =========================
   Reportes PPP
   ========================= */

app.get("/reportes/ppp.csv", async (_req, res) => {
  function formatFecha(d) {
    const pad = (n) => String(n).padStart(2, "0");
    const dia = pad(d.getDate());
    const mes = pad(d.getMonth() + 1);
    const anio = d.getFullYear();
    const horas = pad(d.getHours());
    const mins = pad(d.getMinutes());
    return `${dia}-${mes}-${anio} ${horas}:${mins}`;
  }

  try {
    const ahora = new Date();

    const productos = await prisma.producto.findMany({
      orderBy: { sku: "asc" },
      include: {
        categoria: { select: { nombre: true, codigo: true } },
        subcategoria: { select: { nombre: true } },
        proveedor: { select: { nombre: true } },
      },
    });

    const rows = productos.map((p) => {
      const pppNumber = p.ppp ? Number(p.ppp) : 0;
      const total = p.stock * pppNumber;

      return {
        fechaReporte: formatFecha(ahora),
        sku: p.sku,
        nombre: p.nombre,
        categoria: p.categoria?.nombre ?? "",
        subcategoria: p.subcategoria?.nombre ?? "",
        proveedor: p.proveedor?.nombre ?? "",
        stockActual: p.stock,
        stockMinimo: p.stockMinimo,
        ppp: pppNumber.toFixed(2),
        valorTotal: Math.round(total),
      };
    });

    const headers = [
      "Fecha reporte",
      "SKU",
      "Nombre producto",
      "Categoría",
      "Subcategoría",
      "Proveedor",
      "Stock actual",
      "Stock mínimo",
      "PPP (CLP)",
      "Valor total stock (CLP)",
    ];

    const csvLines = [
      headers.join(";"),
      ...rows.map((r) =>
        headers
          .map((h) => {
            const v = r[
              h
                .toLowerCase()
                .replace(/\s+/g, "")
                .replace(/[()]/g, "")
            ] ?? r[
              ({
                "Fecha reporte": "fechaReporte",
                SKU: "sku",
                "Nombre producto": "nombre",
                "Categoría": "categoria",
                "Subcategoría": "subcategoria",
                Proveedor: "proveedor",
                "Stock actual": "stockActual",
                "Stock mínimo": "stockMinimo",
                "PPP (CLP)": "ppp",
                "Valor total stock (CLP)": "valorTotal",
              }[h] || h.toLowerCase())
            ];

            const s =
              v === null || v === undefined ? "" : String(v);
            return `"${s.replace(/"/g, '""')}"`;
          })
          .join(";")
      ),
    ];

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=ppp_actual.csv"
    );
    res.send(csvLines.join("\n"));
  } catch (error) {
    console.error("Error generando CSV de PPP actual:", error);
    res
      .status(500)
      .json({ error: "Error generando CSV de PPP actual" });
  }
});

// ============================
// Reporte PPP histórico (CSV)
// ============================
app.get("/reportes/ppp_historico.csv", async (_req, res) => {
  function formatFecha(d) {
    const pad = (n) => String(n).padStart(2, "0");
    const dia = pad(d.getDate());
    const mes = pad(d.getMonth() + 1);
    const anio = d.getFullYear();
    const horas = pad(d.getHours());
    const mins = pad(d.getMinutes());
    return `${dia}-${mes}-${anio} ${horas}:${mins}`;
  }

  function escapeCsv(value) {
    if (value === null || value === undefined) return '""';
    const s = String(value);
    return `"${s.replace(/"/g, '""')}"`;
  }

  try {
    const movimientos = await prisma.stockMovimiento.findMany({
      orderBy: [
        { createdAt: "asc" },
        { id: "asc" },
      ],
      include: {
        producto: {
          select: {
            sku: true,
            nombre: true,
          },
        },
      },
    });

    const ahora = new Date();

    // -----------------------------
    // Construir detalle + resumen
    // -----------------------------
    const detalle = [];
    const resumenPorProducto = {};

    for (const m of movimientos) {
      const sku = m.producto?.sku ?? "";
      const nombreProd = m.producto?.nombre ?? "";

      const tipo = m.tipo;
      const refTipo = m.refTipo;
      const refId = m.refId ?? "";

      const cantidad = m.cantidad;
      const costoUnitario = m.costoUnitario
        ? Number(m.costoUnitario)
        : 0;
      const pppAntes = m.pppAntes ? Number(m.pppAntes) : 0;
      const pppDespues = m.pppDespues ? Number(m.pppDespues) : 0;

      // Valor del movimiento
      const valorMovimiento = cantidad * costoUnitario;

      detalle.push({
        fecha: m.createdAt,
        sku,
        nombreProd,
        tipo,
        cantidad,
        costoUnitario,
        pppAntes,
        pppDespues,
        valorMovimiento,
        refTipo,
        refId,
      });

      const key = sku || String(m.productoId);
      if (!resumenPorProducto[key]) {
        resumenPorProducto[key] = {
          sku,
          nombreProd,
          movimientos: 0,
          cantidadTotal: 0,
          valorTotal: 0,
        };
      }
      resumenPorProducto[key].movimientos += 1;
      resumenPorProducto[key].cantidadTotal += cantidad;
      resumenPorProducto[key].valorTotal += valorMovimiento;
    }

    // -----------------------------
    // Resumen por producto
    // -----------------------------
    const resumenRows = Object.values(resumenPorProducto).sort((a, b) =>
      (a.sku || "").localeCompare(b.sku || "")
    );

    const lines = [];

    // Metadatos
    lines.push(
      ["Histórico PPP de stock", "Fire Prevention", ""]
        .map(escapeCsv)
        .join(";")
    );
    lines.push(
      ["Fecha reporte", formatFecha(ahora), ""]
        .map(escapeCsv)
        .join(";")
    );
    lines.push("");

    // RESUMEN POR PRODUCTO
    lines.push(escapeCsv("RESUMEN POR PRODUCTO"));
    const resumenHeaders = [
      "SKU",
      "Nombre producto",
      "N° movimientos",
      "Cantidad total movida (unid.)",
      "Valor total movimientos (CLP)",
    ];
    lines.push(resumenHeaders.map(escapeCsv).join(";"));

    for (const r of resumenRows) {
      lines.push(
        [
          r.sku,
          r.nombreProd,
          r.movimientos,
          r.cantidadTotal,
          Math.round(r.valorTotal),
        ].map(escapeCsv).join(";")
      );
    }

    lines.push("");

    // DETALLE MOVIMIENTOS PPP
    lines.push(escapeCsv("DETALLE MOVIMIENTOS PPP"));
    const detalleHeaders = [
      "Fecha movimiento",
      "SKU",
      "Nombre producto",
      "Tipo movimiento",
      "Cantidad",
      "Costo unitario (CLP)",
      "PPP antes (CLP)",
      "PPP después (CLP)",
      "Valor movimiento (CLP)",
      "Ref tipo",
      "Ref ID",
    ];
    lines.push(detalleHeaders.map(escapeCsv).join(";"));

    for (const d of detalle) {
      lines.push(
        [
          formatFecha(d.fecha),
          d.sku,
          d.nombreProd,
          d.tipo,
          d.cantidad,
          d.costoUnitario.toFixed(2),
          d.pppAntes.toFixed(2),
          d.pppDespues.toFixed(2),
          Math.round(d.valorMovimiento),
          d.refTipo,
          d.refId ?? "",
        ].map(escapeCsv).join(";")
      );
    }

    // Enviar CSV
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=ppp_historico_contable.csv"
    );
    res.send(lines.join("\n"));
  } catch (error) {
    console.error("Error generando CSV de PPP histórico:", error);
    res
      .status(500)
      .json({ error: "Error generando CSV de PPP histórico" });
  }
});

/* =========================
   Reportes CSV - Inventario general
   ========================= */

app.get("/reportes/inventario.csv", async (_req, res) => {
  try {
    const productos = await prisma.producto.findMany({
      orderBy: [
        { categoriaId: "asc" },
        { nombre: "asc" },
      ],
      include: {
        categoria: {
          select: { codigo: true, nombre: true },
        },
        subcategoria: {
          select: { nombre: true },
        },
        proveedor: {
          select: { nombre: true, rut: true },
        },
      },
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="inventario_${ts}.csv"`
    );

    const header =
      [
        "sku",
        "nombre",
        "descripcion",
        "categoria",
        "subcategoria",
        "proveedor",
        "stock",
        "stock_minimo",
        "ppp",
        "stock_valorizado",
        "actualizado_en",
      ].join(",") + "\n";

    const body = productos
      .map((p) => {
        const categoria = p.categoria
          ? `${p.categoria.codigo ?? ""} ${p.categoria.nombre ?? ""}`.trim()
          : "";
        const subcat = p.subcategoria?.nombre ?? "";
        const proveedor = p.proveedor?.nombre ?? "";

        const stock = p.stock ?? 0;
        const stockMin = p.stockMinimo ?? 0;
        const pppNum =
          p.ppp == null
            ? 0
            : Number.parseFloat(String(p.ppp)) || 0;
        const stockVal = (stock * pppNum).toFixed(2);

        return [
          csvEscape(p.sku ?? ""),
          csvEscape(p.nombre ?? ""),
          csvEscape(p.descripcion ?? ""),
          csvEscape(categoria),
          csvEscape(subcat),
          csvEscape(proveedor),
          stock,
          stockMin,
          pppNum.toFixed(2),
          stockVal,
          p.actualizadoEn?.toISOString?.() ?? "",
        ].join(",");
      })
      .join("\n");

    res.send(header + body);
  } catch (e) {
    console.error("[GET /reportes/inventario.csv] Error:", e?.message || e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});

/* =========================
   Reportes CSV - Centros de costo / Proyectos
   ========================= */

app.get("/reportes/centros_costo.csv", async (_req, res) => {
  try {
    const proyectos = await prisma.proyecto.findMany({
      orderBy: [
        { activo: "desc" },
        { nombre: "asc" },
      ],
      include: {
        _count: { select: { movimientos: true } },
      },
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="centros_costo_${ts}.csv"`
    );

    const header =
      [
        "id",
        "codigo",
        "nombre",
        "descripcion",
        "estado",
        "creado_en",
        "actualizado_en",
        "total_movimientos",
      ].join(",") + "\n";

    const body = proyectos
      .map((p) =>
        [
          p.id,
          csvEscape(p.codigo ?? ""),
          csvEscape(p.nombre ?? ""),
          csvEscape(p.descripcion ?? ""),
          p.activo ? "ACTIVO" : "INACTIVO",
          p.creadoEn.toISOString(),
          p.actualizadoEn.toISOString(),
          p._count?.movimientos ?? 0,
        ].join(",")
      )
      .join("\n");

    res.send(header + body);
  } catch (e) {
    console.error("[GET /reportes/centros_costo.csv] Error:", e?.message || e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// =========================
// Reporte Centros de Costo / Proyectos CSV
// =========================

app.get("/reportes/centros_costo.csv", async (req, res) => {
  try {
    const { q = "", soloActivos = "0" } = req.query;

    const where = {};

    if (typeof q === "string" && q.trim() !== "") {
      const query = q.trim();
      where.OR = [
        { nombre: { contains: query, mode: "insensitive" } },
        { codigo: { contains: query, mode: "insensitive" } },
        { descripcion: { contains: query, mode: "insensitive" } },
      ];
    }

    if (String(soloActivos) === "1") {
      where.activo = true;
    }

    const proyectos = await prisma.proyecto.findMany({
      where,
      orderBy: [
        { activo: "desc" },
        { nombre: "asc" },
      ],
      include: {
        _count: {
          select: { movimientos: true },
        },
      },
    });

    // Headers CSV
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="centros_costo_${ts}.csv"`
    );

    // Encabezado
    const header =
      "id,nombre,codigo,descripcion,activo,creadoEn,actualizadoEn,movimientos\n";

    // Filas
    const body = proyectos
      .map((p) =>
        [
          p.id,
          csvEscape(p.nombre ?? ""),
          csvEscape(p.codigo ?? ""),
          csvEscape(p.descripcion ?? ""),
          p.activo ? "1" : "0",
          p.creadoEn.toISOString(),
          p.actualizadoEn.toISOString(),
          p._count?.movimientos ?? 0,
        ].join(",")
      )
      .join("\n");

    res.send(header + body);
  } catch (e) {
    console.error("[GET /reportes/centros_costo.csv] Error:", e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});

/* =========================
   Catálogos simples (marcas, proyectos)
   ========================= */

async function createSimpleNombreRoutes(path, model) {
  // LISTAR
  app.get(`/${path}`, async (_req, res) => {
    try {
      const rows = await model.findMany({
        orderBy: { nombre: "asc" },
      });
      res.json(rows);
    } catch (e) {
      console.error(`[GET /${path}] Error:`, e);
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // CREAR
  app.post(`/${path}`, async (req, res) => {
    try {
      console.log(`[POST /${path}] body:`, req.body);

      const nombre = getNombreFromBody(req.body);
      if (!nombre) {
        return res
          .status(400)
          .json({ error: "El nombre es obligatorio." });
      }

      const created = await model.create({
        data: { nombre },
      });

      res.status(201).json(created);
    } catch (e) {
      if (e?.code === "P2002") {
        const campo = e.meta?.target?.[0] || "campo único";
        return res
          .status(409)
          .json({ error: `Ya existe un registro con ese ${campo}.` });
      }
      console.error(`[POST /${path}] Error:`, e);
      res.status(400).json({ error: e?.message || String(e) });
    }
  });

  // EDITAR
  app.put(`/${path}/:id`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: "id inválido" });
      }

      console.log(`[PUT /${path}/${id}] body:`, req.body);

      const nombre = getNombreFromBody(req.body);
      if (!nombre) {
        return res
          .status(400)
          .json({ error: "El nombre es obligatorio." });
      }

      const updated = await model.update({
        where: { id },
        data: { nombre },
      });

      res.json(updated);
    } catch (e) {
      if (e?.code === "P2002") {
        const campo = e.meta?.target?.[0] || "campo único";
        return res
          .status(409)
          .json({ error: `Ya existe un registro con ese ${campo}.` });
      }
      console.error(`[PUT /${path}/:id] Error:`, e);
      res.status(400).json({ error: e?.message || String(e) });
    }
  });

  // ELIMINAR
  app.delete(`/${path}/:id`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: "id inválido" });
      }

      await model.delete({ where: { id } });
      res.status(204).send();
    } catch (e) {
      console.error(`[DELETE /${path}/:id] Error:`, e);
      res.status(400).json({ error: e?.message || String(e) });
    }
  });
}

// Marcas y Proyectos
createSimpleNombreRoutes("marcas", prisma.marca);

/* =========================
   Bodegas
   ========================= */

app.get("/bodegas", async (_req, res) => {
  try {
    const rows = await prisma.bodega.findMany({
      orderBy: { nombre: "asc" },
    });
    res.json(rows);
  } catch (e) {
    console.error("[GET /bodegas] Error:", e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.post("/bodegas", async (req, res) => {
  try {
    console.log("[POST /bodegas] body:", req.body);

    const rawNombre = req.body?.nombre ?? req.body?.name ?? null;
    const nombre =
      typeof rawNombre === "string" ? rawNombre.trim() : "";

    const rawCodigo =
      req.body?.codigo ??
      req.body?.code ??
      req.body?.codigoBodega ??
      null;
    const codigo =
      rawCodigo != null && String(rawCodigo).trim() !== ""
        ? String(rawCodigo).trim()
        : null;

    if (!nombre) {
      return res.status(400).json({ error: "El nombre es obligatorio." });
    }

    const created = await prisma.bodega.create({
      data: { nombre, codigo },
    });

    res.status(201).json(created);
  } catch (e) {
    if (e?.code === "P2002") {
      const campo = e.meta?.target?.[0] || "campo único";
      return res
        .status(409)
        .json({ error: `Ya existe una bodega con ese ${campo}.` });
    }
    console.error("[POST /bodegas] Error:", e);
    res.status(400).json({ error: e?.message || String(e) });
  }
});

app.put("/bodegas/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "id inválido" });
    }

    console.log(`[PUT /bodegas/${id}] body:`, req.body);

    const rawNombre = req.body?.nombre ?? req.body?.name ?? null;
    const nombre =
      typeof rawNombre === "string" ? rawNombre.trim() : "";

    const rawCodigo =
      req.body?.codigo ??
      req.body?.code ??
      req.body?.codigoBodega ??
      null;
    const codigo =
      rawCodigo != null && String(rawCodigo).trim() !== ""
        ? String(rawCodigo).trim()
        : null;

    if (!nombre) {
      return res.status(400).json({ error: "El nombre es obligatorio." });
    }

    const updated = await prisma.bodega.update({
      where: { id },
      data: { nombre, codigo },
    });

    res.json(updated);
  } catch (e) {
    if (e?.code === "P2002") {
      const campo = e.meta?.target?.[0] || "campo único";
      return res
        .status(409)
        .json({ error: `Ya existe una bodega con ese ${campo}.` });
    }
    console.error("[PUT /bodegas/:id] Error:", e);
    res.status(400).json({ error: e?.message || String(e) });
  }
});

/* =========================
   Proveedores
   ========================= */

app.get("/proveedores", async (req, res) => {
  try {
    const { incluirInactivos = "0", q = "" } = req.query;

    const where = {};

    // Solo activos por defecto
    if (!(incluirInactivos === "1" || incluirInactivos === "true")) {
      where.activo = true;
    }

    // Búsqueda por nombre / RUT
    if (typeof q === "string" && q.trim() !== "") {
      const query = q.trim();
      where.OR = [
        { nombre: { contains: query } },
        { rut: { contains: query } },
      ];
    }

    const rows = await prisma.proveedor.findMany({
      where,
      orderBy: { nombre: "asc" },
      take: 30,
      select: {
        id: true,
        nombre: true,
        rut: true,
        email: true,
        telefono: true,
        activo: true,
      },
    });

    res.json(rows);
  } catch (e) {
    console.error("[GET /proveedores] Error:", e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});


// Obtener 1 proveedor por id
app.get("/proveedores/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "id inválido" });
    }

    const prov = await prisma.proveedor.findUnique({ where: { id } });
    if (!prov) return res.status(404).json({ error: "no existe" });

    res.json(prov);
  } catch (e) {
    console.error("[GET /proveedores/:id] Error:", e);
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// Crear proveedor
app.post("/proveedores", async (req, res) => {
  try {
    const b = req.body || {};
    console.log("[POST /proveedores] body:", b);

    const nombre =
      typeof b.nombre === "string"
        ? b.nombre.trim()
        : typeof b.name === "string"
        ? b.name.trim()
        : "";

    if (!nombre) {
      return res
        .status(400)
        .json({ error: "El nombre del proveedor es obligatorio." });
    }

    const data = {
      nombre,
      rut: b.rut ? String(b.rut).trim() || null : null,
      email: b.email ? String(b.email).trim() || null : null,
      telefono: b.telefono ? String(b.telefono).trim() || null : null,
      direccion: b.direccion ? String(b.direccion).trim() || null : null,
      activo:
        typeof b.activo === "boolean"
          ? b.activo
          : b.activo === "false"
          ? false
          : true,
    };

    const created = await prisma.proveedor.create({ data });
    res.status(201).json(created);
  } catch (e) {
    if (e?.code === "P2002") {
      // rut único
      const campo = e.meta?.target?.[0] || "campo único";
      return res
        .status(409)
        .json({ error: `Ya existe un proveedor con ese ${campo}.` });
    }
    console.error("[POST /proveedores] Error:", e);
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// Editar proveedor
app.put("/proveedores/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "id inválido" });
    }

    const b = req.body || {};
    console.log(`[PUT /proveedores/${id}] body:`, b);

    const data = {};

    if (b.nombre != null || b.name != null) {
      const nombre =
        typeof b.nombre === "string"
          ? b.nombre.trim()
          : typeof b.name === "string"
          ? b.name.trim()
          : "";
      if (!nombre) {
        return res
          .status(400)
          .json({ error: "El nombre del proveedor es obligatorio." });
      }
      data.nombre = nombre;
    }

    if (b.rut !== undefined) {
      data.rut =
        b.rut === null || b.rut === ""
          ? null
          : String(b.rut).trim();
    }
    if (b.email !== undefined) {
      data.email =
        b.email === null || b.email === ""
          ? null
          : String(b.email).trim();
    }
    if (b.telefono !== undefined) {
      data.telefono =
        b.telefono === null || b.telefono === ""
          ? null
          : String(b.telefono).trim();
    }
    if (b.direccion !== undefined) {
      data.direccion =
        b.direccion === null || b.direccion === ""
          ? null
          : String(b.direccion).trim();
    }
    if (b.activo !== undefined) {
      data.activo =
        typeof b.activo === "boolean"
          ? b.activo
          : b.activo === "false"
          ? false
          : true;
    }

    const updated = await prisma.proveedor.update({
      where: { id },
      data,
    });

    res.json(updated);
  } catch (e) {
    if (e?.code === "P2002") {
      const campo = e.meta?.target?.[0] || "campo único";
      return res
        .status(409)
        .json({ error: `Ya existe un proveedor con ese ${campo}.` });
    }
    console.error("[PUT /proveedores/:id] Error:", e);
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// "Eliminar" proveedor
app.delete("/proveedores/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "id inválido" });
    }

    const updated = await prisma.proveedor.update({
      where: { id },
      data: { activo: false },
    });

    res.json(updated);
  } catch (e) {
    console.error("[DELETE /proveedores/:id] Error:", e);
    res.status(400).json({ error: e?.message || String(e) });
  }
});

/* =========================
   Devoluciones a proveedor
   ========================= */

app.post("/devoluciones/proveedor", async (req, res) => {
  const body = req.body || {};
  console.log(
    "[POST /devoluciones/proveedor] body:",
    JSON.stringify(body, null, 2)
  );

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return res
      .status(400)
      .json({ error: "Debe incluir al menos un ítem." });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1) Proveedor
      const proveedor = await resolveProveedor(tx, body);

      // 2) Bodega principal
      const bodega = await resolveBodegaPrincipal(tx);

      // 3) Cabecera de devolución
      const header = await tx.devolucionProveedor.create({
        data: {
          proveedor: {
            connect: { id: proveedor.id },
          },
          bodega: {
            connect: { id: bodega.id },
          },
          fecha: parseDate(body.fecha) || new Date(),

          numeroDocumento: body.numeroDocumento
            ? String(body.numeroDocumento).trim()
            : null,
          observacion: body.observacion ?? null,
        },
      });

      // 4) Ítems
      for (const raw of body.items) {
        const cantidad = Number(raw?.cantidad);
        if (!Number.isFinite(cantidad) || cantidad <= 0) {
          throw new Error("Ítem inválido: cantidad > 0 requerida.");
        }

        let prod = null;
        if (raw.productoId) {
          prod = await tx.producto.findUnique({
            where: { id: Number(raw.productoId) },
          });
        } else if (raw.sku) {
          prod = await tx.producto.findUnique({
            where: { sku: String(raw.sku).trim() },
          });
        } else {
          throw new Error(
            "Ítem inválido: debe incluir productoId o sku."
          );
        }

        if (!prod) {
          throw new Error(
            `Producto no encontrado (${raw?.productoId ?? raw?.sku}).`
          );
        }

        const pppActual = prod.ppp
          ? Number.parseFloat(String(prod.ppp))
          : 0;

        await tx.devolucionProveedorItem.create({
          data: {
            devolucionId: header.id,
            productoId: prod.id,
            cantidad,
            costoUnitario: pppActual,
          },
        });

        await registrarSalida(tx, {
          productoId: prod.id,
          cantidad,
          refTipo: RefTipo.DEVOLUCION_PROVEEDOR,
          refId: header.id,
        });
      }

      return { header, proveedor, bodega };
    });

    return res.status(201).json({
      ok: true,
      devolucionId: result.header.id,
      proveedor: {
        id: result.proveedor.id,
        nombre: result.proveedor.nombre,
      },
      bodega: {
        id: result.bodega.id,
        nombre: result.bodega.nombre,
      },
    });
  } catch (e) {
    console.error(
      "[POST /devoluciones/proveedor] Error:",
      e?.message || e
    );
    return res.status(400).json({ error: e?.message || String(e) });
  }
});

/* =========================
   Devoluciones a proveedor - LISTAR
   ========================= */

app.get("/devoluciones/proveedor", async (req, res) => {
  try {
    const {
      q = "",
      proveedorId,
      fechaDesde,
      fechaHasta,
      page = "1",
      pageSize = "10",
    } = req.query;

    const pageNumber = Math.max(parseInt(String(page), 10) || 1, 1);
    const sizeNumber = Math.max(parseInt(String(pageSize), 10) || 10, 1);
    const skip = (pageNumber - 1) * sizeNumber;

    const where = {};

    // Filtro por proveedorId
    if (proveedorId != null && proveedorId !== "") {
      const pid = Number(proveedorId);
      if (Number.isFinite(pid)) {
        where.proveedorId = pid;
      }
    }

    // Filtro por proveedor, rut, doc, observación
    if (typeof q === "string" && q.trim() !== "") {
      const query = q.trim();
      where.OR = [
        { numeroDocumento: { contains: query, mode: "insensitive" } },
        { observacion: { contains: query, mode: "insensitive" } },
        {
          proveedor: {
            OR: [
              { nombre: { contains: query, mode: "insensitive" } },
              { rut: { contains: query, mode: "insensitive" } },
            ],
          },
        },
      ];
    }

    // Filtro por rango de fechas
    const fechaFilter = {};
    if (typeof fechaDesde === "string" && fechaDesde.trim() !== "") {
      const d = new Date(fechaDesde);
      if (!Number.isNaN(d.getTime())) fechaFilter.gte = d;
    }
    if (typeof fechaHasta === "string" && fechaHasta.trim() !== "") {
      const d = new Date(fechaHasta);
      if (!Number.isNaN(d.getTime())) fechaFilter.lte = d;
    }
    if (Object.keys(fechaFilter).length > 0) {
      where.fecha = fechaFilter;
    }

    const [rows, total] = await Promise.all([
      prisma.devolucionProveedor.findMany({
        where,
        orderBy: { id: "desc" },
        skip,
        take: sizeNumber,
        include: {
          proveedor: true,
          bodega: true,
          items: {
            include: {
              producto: {
                select: { sku: true, nombre: true },
              },
            },
          },
        },
      }),
      prisma.devolucionProveedor.count({ where }),
    ]);

    const data = rows.map((d) => {
      let totalCantidad = 0;
      let totalValor = 0;

      const items = d.items.map((it) => {
        const cantidad = Number(it.cantidad) || 0;
        const costo = Number.parseFloat(String(it.costoUnitario)) || 0;
        totalCantidad += cantidad;
        totalValor += cantidad * costo;

        return {
          id: it.id,
          productoId: it.productoId,
          sku: it.producto?.sku ?? "",
          nombreProducto: it.producto?.nombre ?? "",
          cantidad,
          costoUnitario: costo,
        };
      });

      return {
        id: d.id,
        fecha: d.fecha.toISOString(),
        numeroDocumento: d.numeroDocumento ?? "",
        observacion: d.observacion ?? "",
        proveedor: d.proveedor
          ? {
              id: d.proveedor.id,
              nombre: d.proveedor.nombre,
              rut: d.proveedor.rut ?? "",
            }
          : null,
        bodega: d.bodega
          ? {
              id: d.bodega.id,
              nombre: d.bodega.nombre,
            }
          : null,
        totalCantidad,
        totalValor,
        items,
      };
    });

    res.json({ data, total });
  } catch (e) {
    console.error("[GET /devoluciones/proveedor] Error:", e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});

/* =========================
   Devoluciones a proveedor - DETALLE
   ========================= */

app.get("/devoluciones/proveedor/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "id inválido" });
    }

    const d = await prisma.devolucionProveedor.findUnique({
      where: { id },
      include: {
        proveedor: true,
        bodega: true,
        items: {
          include: {
            producto: {
              select: { sku: true, nombre: true },
            },
          },
        },
      },
    });

    if (!d) {
      return res.status(404).json({ error: "no existe" });
    }

    let totalCantidad = 0;
    let totalValor = 0;

    const items = d.items.map((it) => {
      const cantidad = Number(it.cantidad) || 0;
      const costo = Number.parseFloat(String(it.costoUnitario)) || 0;
      totalCantidad += cantidad;
      totalValor += cantidad * costo;

      return {
        id: it.id,
        productoId: it.productoId,
        sku: it.producto?.sku ?? "",
        nombreProducto: it.producto?.nombre ?? "",
        cantidad,
        costoUnitario: costo,
      };
    });

    const result = {
      id: d.id,
      fecha: d.fecha.toISOString(),
      numeroDocumento: d.numeroDocumento ?? "",
      observacion: d.observacion ?? "",
      proveedor: d.proveedor
        ? {
            id: d.proveedor.id,
            nombre: d.proveedor.nombre,
            rut: d.proveedor.rut ?? "",
          }
        : null,
      bodega: d.bodega
        ? {
            id: d.bodega.id,
            nombre: d.bodega.nombre,
          }
        : null,
      totalCantidad,
      totalValor,
      items,
    };

    res.json(result);
  } catch (e) {
    console.error("[GET /devoluciones/proveedor/:id] Error:", e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});


// Listar subcategorías
app.get("/subcategorias", async (req, res) => {
  try {
    const { categoriaId } = req.query;

    const where = {};
    if (categoriaId !== undefined) {
      const catId = Number(categoriaId);
      if (!Number.isInteger(catId) || catId <= 0) {
        return res
          .status(400)
          .json({ error: "categoriaId debe ser un número entero válido" });
      }
      where.categoriaId = catId;
    }

    const subcategorias = await prisma.subcategoria.findMany({
      where,
      include: {
        categoria: true,
      },
      orderBy: [
        { categoriaId: "asc" },
        { nombre: "asc" },
      ],
    });

    res.json(subcategorias);
  } catch (error) {
    console.error("Error al listar subcategorías:", error);
    res.status(500).json({ error: "Error al listar subcategorías" });
  }
});

app.get("/subcategorias/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res
        .status(400)
        .json({ error: "El id debe ser un número entero válido" });
    }

    const subcategoria = await prisma.subcategoria.findUnique({
      where: { id },
      include: { categoria: true },
    });

    if (!subcategoria) {
      return res.status(404).json({ error: "Subcategoría no encontrada" });
    }

    res.json(subcategoria);
  } catch (error) {
    console.error("Error al obtener subcategoría:", error);
    res.status(500).json({ error: "Error al obtener subcategoría" });
  }
});

app.post("/subcategorias", async (req, res) => {
  try {
    const { nombre, categoriaId } = req.body;

    if (!nombre || !categoriaId) {
      return res
        .status(400)
        .json({ error: "nombre y categoriaId son obligatorios" });
    }

    const trimmedNombre = String(nombre).trim();
    const catId = Number(categoriaId);

    if (!trimmedNombre) {
      return res
        .status(400)
        .json({ error: "El nombre de la subcategoría no puede estar vacío" });
    }

    if (!Number.isInteger(catId) || catId <= 0) {
      return res
        .status(400)
        .json({ error: "categoriaId debe ser un número entero válido" });
    }

    // Verificar que la categoría exista
    const categoria = await prisma.categoria.findUnique({
      where: { id: catId },
    });
    if (!categoria) {
      return res.status(404).json({ error: "Categoría no encontrada" });
    }

    // Evitar duplicado
    const yaExiste = await prisma.subcategoria.findFirst({
      where: {
        categoriaId: catId,
        nombre: trimmedNombre,
      },
    });

    if (yaExiste) {
      return res.status(409).json({
        error:
          "Ya existe una subcategoría con ese nombre para la categoría indicada",
      });
    }

    const creada = await prisma.subcategoria.create({
      data: {
        nombre: trimmedNombre,
        categoriaId: catId,
      },
    });

    res.status(201).json(creada);
  } catch (error) {
    console.error("Error al crear subcategoría:", error);
    res.status(500).json({ error: "Error al crear subcategoría" });
  }
});

app.put("/subcategorias/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { nombre, categoriaId } = req.body;

    if (!Number.isInteger(id) || id <= 0) {
      return res
        .status(400)
        .json({ error: "El id debe ser un número entero válido" });
    }

    if (!nombre && !categoriaId) {
      return res.status(400).json({
        error: "Debes enviar al menos nombre o categoriaId para actualizar",
      });
    }

    const data = {};

    if (nombre !== undefined) {
      const trimmedNombre = String(nombre).trim();
      if (!trimmedNombre) {
        return res.status(400).json({
          error: "El nombre de la subcategoría no puede estar vacío",
        });
      }
      data.nombre = trimmedNombre;
    }

    if (categoriaId !== undefined) {
      const catId = Number(categoriaId);
      if (!Number.isInteger(catId) || catId <= 0) {
        return res
          .status(400)
          .json({ error: "categoriaId debe ser un número entero válido" });
      }

      const categoria = await prisma.categoria.findUnique({
        where: { id: catId },
      });
      if (!categoria) {
        return res.status(404).json({ error: "Categoría no encontrada" });
      }

      data.categoriaId = catId;
    }

    const actualizada = await prisma.subcategoria.update({
      where: { id },
      data,
    });

    res.json(actualizada);
  } catch (error) {
    console.error("Error al actualizar subcategoría:", error);

    if (error.code === "P2002") {
      return res.status(409).json({
        error:
          "Ya existe una subcategoría con ese nombre para la categoría indicada",
      });
    }

    res.status(500).json({ error: "Error al actualizar subcategoría" });
  }
});

app.delete("/subcategorias/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res
        .status(400)
        .json({ error: "El id debe ser un número entero válido" });
    }

    await prisma.subcategoria.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar subcategoría:", error);

    if (error.code === "P2003") {
      return res.status(409).json({
        error:
          "No se puede eliminar la subcategoría porque tiene productos asociados",
      });
    }

    res.status(500).json({ error: "Error al eliminar subcategoría" });
  }
});

// LISTAR CATEGORÍAS
app.get("/categorias", async (_req, res) => {
  try {
    const list = await prisma.categoria.findMany({
      orderBy: [{ codigo: "asc" }], // EXT, DET, ACF, FUN
    });
    res.json(list);
  } catch (error) {
    console.error("Error al listar categorías:", error);
    res.status(500).json({ error: "Error al listar categorías" });
  }
});

app.get("/proyectos", async (req, res) => {
  try {
    const { q = "", soloActivos = "0" } = req.query;

    const where = {};

    if (typeof q === "string" && q.trim() !== "") {
      const query = q.trim();
      where.OR = [
        { nombre: { contains: query, mode: "insensitive" } },
        { codigo: { contains: query, mode: "insensitive" } },
        { descripcion: { contains: query, mode: "insensitive" } },
      ];
    }

    if (String(soloActivos) === "1") {
      where.activo = true;
    }

    const proyectos = await prisma.proyecto.findMany({
      where,
      orderBy: [
        { activo: "desc" }, // activos primero
        { nombre: "asc" },
      ],
      include: {
        _count: {
          select: { movimientos: true },
        },
      },
    });

    const data = proyectos.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      codigo: p.codigo,
      descripcion: p.descripcion,
      activo: p.activo,
      creadoEn: p.creadoEn.toISOString(),
      actualizadoEn: p.actualizadoEn.toISOString(),
      movimientosCount: p._count?.movimientos ?? 0,
    }));

    res.json(data);
  } catch (e) {
    console.error("[GET /proyectos] Error:", e);
    res.status(500).json({
      error: e && e.message ? e.message : String(e),
    });
  }
});

/**
 * GET /proyectos/:id
 */
app.get("/proyectos/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res
        .status(400)
        .json({ error: "El id debe ser un número entero válido" });
    }

    const p = await prisma.proyecto.findUnique({
      where: { id },
      include: {
        _count: { select: { movimientos: true } },
      },
    });

    if (!p) {
      return res.status(404).json({ error: "Proyecto no encontrado" });
    }

    res.json({
      id: p.id,
      nombre: p.nombre,
      codigo: p.codigo,
      descripcion: p.descripcion,
      activo: p.activo,
      creadoEn: p.creadoEn.toISOString(),
      actualizadoEn: p.actualizadoEn.toISOString(),
      movimientosCount: p._count?.movimientos ?? 0,
    });
  } catch (e) {
    console.error("[GET /proyectos/:id] Error:", e);
    res.status(500).json({
      error: e && e.message ? e.message : String(e),
    });
  }
});

/**
 * POST /proyectos
 */
function normalizeNullableString(value) {
  if (value === undefined || value === null) return null;

  const str = String(value).trim();
  if (str === "") return null;

  return str;
}

app.post("/proyectos", async (req, res) => {
  try {
    const { nombre, codigo, descripcion, activo } = req.body || {};

    if (!nombre || !String(nombre).trim()) {
      return res
        .status(400)
        .json({ error: "El nombre del proyecto es obligatorio" });
    }

    const creado = await prisma.proyecto.create({
      data: {
        nombre: String(nombre).trim(),
        codigo: normalizeNullableString(codigo),
        descripcion: normalizeNullableString(descripcion),
        activo: activo === undefined ? true : Boolean(activo),
      },
    });

    res.status(201).json(creado);
  } catch (e) {
    console.error("[POST /proyectos] Error:", e);

    if (e && e.code === "P2002") {
      return res.status(409).json({
        error:
          "Ya existe un proyecto con ese nombre o código. Ambos deben ser únicos.",
      });
    }

    res.status(500).json({
      error: e && e.message ? e.message : String(e),
    });
  }
});

/**
 * PUT /proyectos/:id
 */

app.put("/proyectos/:id", async (req, res) => {
  const id = Number(req.params.id);

  console.log("[PUT /proyectos/:id] params.id:", id);
  console.log("[PUT /proyectos/:id] raw body:", req.body);
  console.log("[PUT /proyectos/:id] typeof activo:", typeof req.body.activo);

  try {
    let { nombre, codigo, descripcion, activo } = req.body;

    if (!nombre || typeof nombre !== "string") {
      return res
        .status(400)
        .json({ error: "El nombre del proyecto es obligatorio" });
    }

    // Normalizar strings vacíos a null
    if (codigo === "") codigo = null;
    if (descripcion === "") descripcion = null;

    let parsedActivo;
    if (typeof activo === "boolean") {
      parsedActivo = activo;
    } else if (typeof activo === "string") {
      const v = activo.toLowerCase().trim();
      if (v === "true" || v === "1") parsedActivo = true;
      else if (v === "false" || v === "0") parsedActivo = false;
    }

    const data = {
      nombre,
      codigo,
      descripcion,
    };

    if (typeof parsedActivo === "boolean") {
      data.activo = parsedActivo;
    }

    console.log("[PUT /proyectos/:id] data que se envía a Prisma:", data);

    const proyecto = await prisma.proyecto.update({
      where: { id },
      data,
    });

    res.json(proyecto);
  } catch (err) {
    console.error("[PUT /proyectos/:id] Error:", err);
    res.status(500).json({ error: "Error actualizando proyecto" });
  }
});



/**
 * DELETE /proyectos/:id
 */
app.delete("/proyectos/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res
        .status(400)
        .json({ error: "El id debe ser un número entero válido" });
    }

    await prisma.proyecto.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (e) {
    console.error("[DELETE /proyectos/:id] Error:", e);

    if (e && e.code === "P2003") {
      return res.status(409).json({
        error:
          "No se puede eliminar el proyecto porque tiene movimientos asociados.",
      });
    }

    res.status(500).json({
      error: e && e.message ? e.message : String(e),
    });
  }
});

// PATCH /proyectos/:id/activo
app.patch("/proyectos/:id/activo", async (req, res) => {
  const id = Number(req.params.id);
  const { activo } = req.body;

  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "ID inválido" });
  }
  if (typeof activo !== "boolean") {
    return res
      .status(400)
      .json({ error: "El campo 'activo' debe ser booleano" });
  }

  try {
    const proyecto = await prisma.proyecto.update({
      where: { id },
      data: { activo },
    });
    res.json(proyecto);
  } catch (err) {
    console.error("[PATCH /proyectos/:id/activo] Error:", err);
    return res
      .status(500)
      .json({ error: "Error al actualizar estado del proyecto" });
  }
});


// utils opcional
function toStringOrNull(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

// =======================
// USUARIOS (CRUD simple)
// =======================

// Listar usuarios
app.get("/usuarios", async (_req, res) => {
  try {
    const list = await prisma.user.findMany({
      orderBy: { id: "asc" },
      include: {
        worker: {
          select: {
            id: true,
            fullName: true,
            rut: true,
          },
        },
      },
    });

    res.json(
      list.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        worker: u.worker,
      }))
    );
  } catch (e) {
    console.error("[GET /usuarios] Error:", e);
    res
      .status(500)
      .json({ error: "Error al listar usuarios" });
  }
});

// Crear usuario
app.post("/usuarios", async (req, res) => {
  try {
    const { email, role, isActive = true, password } = req.body || {};

    if (!email || !role) {
      return res
        .status(400)
        .json({ error: "Email y rol son obligatorios" });
    }

    if (!password || String(password).trim().length < 8) {
      return res.status(400).json({
        error:
          "La contraseña es obligatoria y debe tener al menos 8 caracteres",
      });
    }

    const emailNorm = String(email).trim().toLowerCase();

    const existing = await prisma.user.findUnique({
      where: { email: emailNorm },
    });
    if (existing) {
      return res
        .status(409)
        .json({ error: "Ya existe un usuario con ese email" });
    }

    const passwordHash = await bcrypt.hash(
      String(password),
      10
    );

    const user = await prisma.user.create({
      data: {
        email: emailNorm,
        role,
        isActive: Boolean(isActive),
        passwordHash,
      },
      include: {
        worker: {
          select: {
            id: true,
            fullName: true,
            rut: true,
          },
        },
      },
    });

    res.status(201).json({
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      worker: user.worker,
    });
  } catch (e) {
    console.error("[POST /usuarios] Error:", e);
    res
      .status(500)
      .json({ error: "Error al crear usuario" });
  }
});

// Actualizar usuario (email/rol/estado y, opcionalmente, password)
app.put("/usuarios/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res
        .status(400)
        .json({ error: "ID inválido" });
    }

    const { email, role, isActive, password } = req.body || {};

    const data = {};

    if (email !== undefined) {
      data.email = String(email).trim().toLowerCase();
    }
    if (role !== undefined) {
      data.role = role;
    }
    if (typeof isActive === "boolean") {
      data.isActive = isActive;
    }

    if (password && String(password).trim().length > 0) {
      if (String(password).length < 8) {
        return res.status(400).json({
          error:
            "La nueva contraseña debe tener al menos 8 caracteres",
        });
      }
      data.passwordHash = await bcrypt.hash(
        String(password),
        10
      );
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      include: {
        worker: {
          select: {
            id: true,
            fullName: true,
            rut: true,
          },
        },
      },
    });

    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      worker: user.worker,
    });
  } catch (e) {
    console.error("[PUT /usuarios/:id] Error:", e);
    if (e.code === "P2002") {
      return res.status(409).json({
        error: "Ya existe otro usuario con ese email",
      });
    }
    res
      .status(500)
      .json({ error: "Error al actualizar usuario" });
  }
});

// Eliminar usuario
app.delete("/usuarios/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res
        .status(400)
        .json({ error: "ID inválido" });
    }

    await prisma.user.delete({ where: { id } });
    res.status(204).send();
  } catch (e) {
    console.error("[DELETE /usuarios/:id] Error:", e);
    res
      .status(500)
      .json({ error: "Error al eliminar usuario" });
  }
});

/* =========================
   Start server
   ========================= */

const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`API on http://0.0.0.0:${PORT}`);
});
