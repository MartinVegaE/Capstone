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

    const user = await prisma.user.findUnique({
      where: { email: emailNorm },
    });

    if (!user) {
      console.warn("[POST /login] usuario no encontrado:", emailNorm);
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const stored = user.passwordHash ?? user.password ?? null;

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
      ok = await bcrypt.compare(String(password), stored);
    } else {
      ok = String(password) === String(stored);
    }

    if (!ok) {
      console.warn("[POST /login] password incorrecto para:", emailNorm);
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const role = user.role ?? user.rol ?? "WAREHOUSE";

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
  const b = req.body || {};
  console.log("[POST /productos] body:", b);

  const skuRaw =
    b.sku ?? b.codigo ?? b.code ?? b.skuProducto ?? b.skuProductoNuevo;
  const nombreRaw =
    b.nombre ?? b.name ?? b.descripcion ?? b.description ?? b.titulo;

  if (!skuRaw || !nombreRaw) {
    console.warn("[POST /productos] Falta sku o nombre");
    return res
      .status(400)
      .json({ error: "sku y nombre son obligatorios" });
  }

  // IDs de relaciones
  const categoriaId = Number(b.categoriaId);
  const proveedorId = Number(b.proveedorId);
  const subcategoriaId =
    b.subcategoriaId != null ? Number(b.subcategoriaId) : undefined;

  if (!Number.isFinite(categoriaId)) {
    return res
      .status(400)
      .json({ error: "categoriaId es obligatorio y debe ser numérico." });
  }
  if (!Number.isFinite(proveedorId)) {
    return res
      .status(400)
      .json({ error: "proveedorId es obligatorio y debe ser numérico." });
  }
  if (subcategoriaId !== undefined && !Number.isFinite(subcategoriaId)) {
    return res
      .status(400)
      .json({ error: "subcategoriaId debe ser numérico si se envía." });
  }

  const stockRaw = b.stock ?? b.stockInicial ?? b.stockTotal ?? 0;
  const stock = Number(stockRaw);
  const stockMinimoRaw = b.stockMinimo ?? b.stockCritico ?? 0;
  const stockMinimo = Number(stockMinimoRaw);

  if (!Number.isFinite(stock) || stock < 0) {
    console.warn("[POST /productos] Stock inválido:", stockRaw);
    return res
      .status(400)
      .json({ error: "stock debe ser número >= 0" });
  }
  if (!Number.isFinite(stockMinimo) || stockMinimo < 0) {
    console.warn("[POST /productos] stockMinimo inválido:", stockMinimoRaw);
    return res
      .status(400)
      .json({ error: "stockMinimo debe ser número >= 0" });
  }

  const dataBase = {
    sku: String(skuRaw).trim(),
    nombre: String(nombreRaw).trim(),
    descripcion:
      b.descripcion != null && String(b.descripcion).trim() !== ""
        ? String(b.descripcion).trim()
        : null,
    ubicacion:
      b.ubicacion != null && String(b.ubicacion).trim() !== ""
        ? String(b.ubicacion).trim()
        : null,
    codigoBarras:
      b.codigoBarras != null && String(b.codigoBarras).trim() !== ""
        ? String(b.codigoBarras).trim()
        : null,
    stock,
    stockMinimo,
    imagenUrl:
      b.imagenUrl != null && String(b.imagenUrl).trim() !== ""
        ? String(b.imagenUrl).trim()
        : null,
  };

  console.log("[POST /productos] data a crear (base):", dataBase);

  try {
    const creado = await prisma.producto.create({
      data: {
        ...dataBase,
        // 🔗 Relaciones
        categoria: { connect: { id: categoriaId } },
        proveedor: { connect: { id: proveedorId } },
        ...(subcategoriaId !== undefined && {
          subcategoria: { connect: { id: subcategoriaId } },
        }),
      },
    });

    console.log("[POST /productos] creado:", creado);
    res.status(201).json(creado);
  } catch (e) {
    console.error("[POST /productos] Error Prisma:", e);

    if (e?.code === "P2002") {
      const campo = e.meta?.target?.[0] || "campo único";
      return res
        .status(409)
        .json({ error: `Ya existe un producto con ese ${campo}` });
    }

    res
      .status(400)
      .json({ error: e?.message || String(e) || "Error creando producto" });
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
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "id inválido" });
  }
  try {
    await prisma.producto.delete({ where: { id } });
    res.status(204).send();
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
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

// Stub para ajustes manuales futuros
app.post("/movimientos", async (req, res) => {
  console.log("[POST /movimientos] body:", req.body);
  res.status(201).json({ ok: true });
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

    if (typeof q === "string" && q.trim() !== "") {
      const query = q.trim();
      where.OR = [
        { proveedor: { contains: query, mode: "insensitive" } },
        { documento: { contains: query, mode: "insensitive" } },
        { observacion: { contains: query, mode: "insensitive" } },
      ];
    }

    const [ingresos, total] = await Promise.all([
      prisma.ingreso.findMany({
        where,
        orderBy: { id: "desc" },
        skip,
        take: sizeNumber,
        include: {
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
      proveedor: ing.proveedor ?? "",
      documento: ing.documento ?? "",
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
    res.status(500).json({ error: e?.message || String(e) });
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


// SALIDAS a proyecto
app.post("/proyectos/salidas", async (req, res) => {
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
          proyecto: proyecto.nombre,
          tipo: ProyectoMovTipo.SALIDA,
          fecha: parseDate(body.fecha) || new Date(),
          documento: body.documento || null,
          observacion: body.observacion ?? null,
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
            where: { sku: String(raw.sku) },
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

        await registrarSalida(tx, {
          productoId: prod.id,
          cantidad,
          refTipo: RefTipo.PROYECTO_SALIDA,
          refId: header.id,
        });
      }

      return { header, proyecto, bodega };
    });

    res.status(201).json({
      ok: true,
      movimientoId: result.header.id,
      proyecto: result.proyecto,
    });
  } catch (e) {
    console.error("[POST /proyectos/salidas] Error:", e?.message || e);
    res.status(400).json({ error: e?.message || String(e) });
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
          proyecto: proyecto.nombre,
          tipo: ProyectoMovTipo.RETORNO,
          fecha: parseDate(body.fecha) || new Date(),
          documento: body.documento || null,
          observacion: body.observacion ?? null,
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
            where: { sku: String(raw.sku) },
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
          refTipo: RefTipo.PROYECTO_RETORNO,
          refId: header.id,
        });
      }

      return { header, proyecto, bodega };
    });

    res.status(201).json({
      ok: true,
      movimientoId: result.header.id,
      proyecto: result.proyecto,
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
      pageSize = "10",
    } = req.query;

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const sizeNumber = Math.max(parseInt(pageSize, 10) || 10, 1);
    const skip = (pageNumber - 1) * sizeNumber;

    const where = {};

    // Filtro por tipo: SALIDA / RETORNO
    if (typeof tipo === "string" && tipo !== "ALL" && tipo.trim() !== "") {
      const t = tipo.trim().toUpperCase();
      if (t === "SALIDA" || t === "RETORNO") {
        where.tipo = t;
      }
    }

    // Búsqueda por proyecto, documento u observación
    if (typeof q === "string" && q.trim() !== "") {
      const query = q.trim();
      where.OR = [
        { proyecto: { contains: query, mode: "insensitive" } },
        { documento: { contains: query, mode: "insensitive" } },
        { observacion: { contains: query, mode: "insensitive" } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.movimientoProyecto.findMany({
        where,
        orderBy: { id: "desc" },
        skip,
        take: sizeNumber,
        include: {
          items: {
            include: {
              producto: {
                select: { sku: true, nombre: true },
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
      proyecto: m.proyecto,
      documento: m.documento ?? "",
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
    console.error("[GET /proyectos/movimientos] Error:", e?.message || e);
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


/* =========================
   Start server
   ========================= */

const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`API on http://0.0.0.0:${PORT}`);
});
