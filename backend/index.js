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
    });
    res.json(list);
  } catch (e) {
    console.error("[GET /productos] Error:", e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// CREAR producto (versión tolerante)
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

  const stockRaw = b.stock ?? b.stockInicial ?? b.stockTotal ?? 0;
  const stock = Number(stockRaw);

  if (!Number.isFinite(stock) || stock < 0) {
    console.warn("[POST /productos] Stock inválido:", stockRaw);
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

  console.log("[POST /productos] data a crear:", data);

  try {
    const creado = await prisma.producto.create({ data });
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

// EDITAR producto (campos básicos)
app.put("/productos/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "id inválido" });
  }

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

async function resolveProyecto(tx, body) {
  if (body.proyectoId) {
    const p = await tx.proyecto.findUnique({
      where: { id: Number(body.proyectoId) },
    });
    if (!p) throw new Error(`Proyecto con id ${body.proyectoId} no encontrado.`);
    return p;
  }
  if (body.proyecto) {
    const p = await tx.proyecto.findFirst({
      where: { nombre: String(body.proyecto) },
    });
    if (!p)
      throw new Error(
        `Proyecto con nombre "${body.proyecto}" no encontrado.`
      );
    return p;
  }
  throw new Error("Debe indicar proyectoId o proyecto (nombre).");
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
    const { incluirInactivos = "0" } = req.query;

    const where =
      incluirInactivos === "1" || incluirInactivos === "true"
        ? {}
        : { activo: true };

    const rows = await prisma.proveedor.findMany({
      where,
      orderBy: { nombre: "asc" },
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


/* =========================
   Start server
   ========================= */

const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`API on http://0.0.0.0:${PORT}`);
});
