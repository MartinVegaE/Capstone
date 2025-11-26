require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { PrismaClient, RefTipo, ProyectoMovTipo } = require("@prisma/client");

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

    // 👇 SIN `mode`, y usando findUnique porque email es @unique
    const user = await prisma.user.findUnique({
      where: { email: emailNorm },
    });

    if (!user) {
      console.warn("[POST /login] usuario no encontrado:", emailNorm);
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    // Compatibilidad: passwordHash nuevo / password viejo (si existe)
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


// CREAR producto (con categoría, subcategoría opcional y proveedor obligatorio)
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
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

  try {
    await prisma.producto.delete({
      where: { id },
    });

    return res.json({ ok: true });
  } catch (err) {
    // Caso típico: P2003 = constraint de FK
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2003"
    ) {
      return res.status(409).json({
        error:
          "No se puede eliminar el producto porque tiene movimientos asociados (ingresos, salidas o devoluciones).",
      });
    }

    console.error("Error eliminando producto:", err);
    return res
      .status(500)
      .json({ error: "Error interno al eliminar el producto." });
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

  // 1) Traer producto
  const prod = await tx.producto.findUnique({
    where: { id: productoId },
    select: { id: true, stock: true, ppp: true },
  });

  if (!prod) {
    throw new Error(`Producto con id ${productoId} no existe`);
  }

  // 2) PPP antes/después (no cambia en un retorno)
  const pppActual = prod.ppp ?? 0;

  // 3) Registrar movimiento de stock (IN)
  await tx.stockMovimiento.create({
    data: {
      productoId,
      tipo: "IN",           // Enum MovimientoTipo.IN
      cantidad,
      costoUnitario: null,
      pppAntes: pppActual,
      pppDespues: pppActual,
      refTipo,              // 👈 otra vez, valor que viene del caller
      refId: refId ?? null,
    },
  });

  // 4) Actualizar stock del producto
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
      // por compatibilidad: body.proyecto.id
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
  // Por ahora usamos la primera bodega que exista.
  // Si después tienes un flag "esPrincipal" o similar, se cambia aquí.
  const bodega = await prisma.bodega.findFirst();

  if (!bodega) {
    throw new Error(
      "No hay bodegas configuradas. Crea la bodega inicial en el módulo de bodegas."
    );
  }

  return bodega;
}



// Stub para ajustes manuales futuros, ahora con validación y mensajes claros
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

    // Si quieres que este endpoint siempre se use con proyecto:
    // (puedes quitar esta validación si decides usarlo solo para ajustes de bodega)
    if (
      proyectoId != null &&
      (!Number.isInteger(proyectoId) || proyectoId <= 0)
    ) {
      return res.status(400).json({
        error:
          "Si envías 'proyectoId', debe ser un número entero mayor a 0.",
      });
    }

    // En este punto el payload es válido.
    // Como el comentario original dice "Stub para ajustes manuales futuros",
    // todavía NO modificamos la base de datos para no arriesgar PPP ni stock.
    // Solo devolvemos una respuesta clara y un resumen de lo que se recibió.

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
        // nombre del proveedor (relación 1-a-1)
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
          proveedor: true, // para poder usar proveedor.nombre
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
      // 👇 lo que muestra la columna PROVEEDOR en el front
      proveedor: ing.proveedor ? ing.proveedor.nombre : "",
      // 👇 el front arma el texto del documento con estos 2 campos
      tipoDocumento: ing.tipoDocumento,         // FACTURA | GUIA | NC
      numeroDocumento: ing.numeroDocumento,     // string
      observacion: ing.observacion ?? "",
      fecha: ing.fecha.toISOString(),
      estado: "Confirmado", // por ahora fijo

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



// EDITAR cabecera de ingreso (simple)
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
    // Para compatibilidad, respondemos algo simple:
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
        where: { nombre }, // 👈 sin mode, SQLite no lo soporta
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
          tipoDocumento: null, // por ahora
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
          refTipo: RefTipo.MOVIMIENTO_PROYECTO_SALIDA, // según tu enum RefTipo
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
          // 👇 IMPORTANTE: cargar el proyecto
          proyecto: {
            select: { nombre: true },
          },
          // 👇 y los productos de los ítems
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
      proyecto: m.proyecto?.nombre ?? "",          // 👈 nombre plano
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

    const agg = new Map();
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
createSimpleNombreRoutes("proyectos", prisma.proyecto);

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

    // Búsqueda por nombre / RUT (SIN mode: "insensitive" porque usamos SQLite)
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
      take: 30, // límite razonable para el combo/buscador
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

// "Eliminar" proveedor (baja lógica: activo = false)
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
          // OJO: sin tipoDocumento por ahora
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

    // 👇 AHORA SÍ: responder algo al cliente
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

    // Filtro por proveedorId (opcional)
    if (proveedorId != null && proveedorId !== "") {
      const pid = Number(proveedorId);
      if (Number.isFinite(pid)) {
        where.proveedorId = pid;
      }
    }

    // Filtro por texto libre (proveedor, rut, doc, observación)
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

    // Filtro por rango de fechas (opcional)
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

    // Adaptamos al shape que va a consumir React
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
        items, // si en la lista solo quieres resumen, en el front puedes ignorar esto
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


// Listar subcategorías (opcionalmente filtradas por categoriaId)
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
        categoria: true, // así el front puede mostrar código/nombre de la categoría
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

    // Evitar duplicado (respeta @@unique([categoriaId, nombre])
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

    // P2002 = unique constraint violation
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

    // 204 = No Content
    res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar subcategoría:", error);

    // P2003 = violation of foreign key constraint (productos asociados)
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

    // P2002 = unique constraint violation
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
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res
        .status(400)
        .json({ error: "El id debe ser un número entero válido" });
    }

    const { nombre, codigo, descripcion, activo } = req.body || {};

    const data = {};

    if (nombre !== undefined) {
      if (!String(nombre).trim()) {
        return res.status(400).json({
          error: "El nombre del proyecto no puede estar vacío",
        });
      }
      data.nombre = String(nombre).trim();
    }

    if (codigo !== undefined) {
      data.codigo = normalizeNullableString(codigo);
    }

    if (descripcion !== undefined) {
      data.descripcion = normalizeNullableString(descripcion);
    }

    if (activo !== undefined) {
      data.activo = Boolean(activo);
    }

    const actualizado = await prisma.proyecto.update({
      where: { id },
      data,
    });

    res.json(actualizado);
  } catch (e) {
    console.error("[PUT /proyectos/:id] Error:", e);

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

    // P2003 = FK constraint (movimientos asociados)
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
