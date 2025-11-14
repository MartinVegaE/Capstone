// src/routes/productos.ts
import { Router } from "express";
import { z } from "zod";
import prisma from "../prisma"; // ← CORRECTO: está en src/prisma.ts

const router = Router();
export default router;

/* =========================
   SPECS por familia (Zod)
   ========================= */
const specsTuberias = z.object({
  familia: z.literal("Tuberías"),
  material: z.string(),
  diametroNominal: z.string(),
  schedule_clase: z.string().optional(),
  tipoConexion: z.string().optional(),
  presionNominal: z.string().optional(),
  acabado_color: z.string().optional(),
  presentaciones: z
    .object({
      tipo: z.literal("barra").default("barra"),
      longitudes_m: z.array(z.number().positive()).min(1), // ej: [3,6]
    })
    .optional(),
}).strict();

const specsFittings = z.object({
  familia: z.literal("Fittings"),
  tipo: z.string(), // Codo/Tee/Unión/Reducción/Acople/Tapa/Cruz
  material: z.string().optional(),
  diametroEntrada: z.string().optional(),
  diametroSalida: z.string().optional(),
  angulo: z.number().optional(),
  tipoConexion: z.string().optional(),
  presionNominal: z.string().optional(),
  norma: z.string().optional(),
}).strict();

const specsValvulas = z.object({
  familia: z.literal("Válvulas"),
  tipo: z.string(), // OS&Y/Mariposa/Check/Alivio/Indicadora/Tamper/ITP
  diametro: z.string(),
  conexion: z.string(), // brida/ranurada/roscada
  presionNominal: z.string().optional(),
  materialCuerpo: z.string().optional(),
  materialAsiento: z.string().optional(),
  tamperSwitch: z.boolean().optional(),
  norma: z.string().optional(),
}).strict();

const specsRociadores = z.object({
  familia: z.literal("Rociadores"),
  tipo: z.string(), // Pendent/Upright/Sidewall
  KFactor: z.string(),
  temperatura: z.string(),
  rosca: z.string().optional(),
  cobertura: z.string().optional(),
  acabado: z.string().optional(),
  modeloListado: z.string().optional(), // UL/FM
}).strict();

const specsDeteccion = z.object({
  familia: z.literal("Detección"),
  tipo: z.string(), // humo/calor/CO/estación/sirena/panel/VESDA
  protocolo: z.string().optional(),
  tension: z.string().optional(),
  gradoIP: z.string().optional(),
  compatibilidad: z.string().optional(), // opcional (como pediste)
}).strict();

const specsMangueras = z.object({
  familia: z.literal("Mangueras"),
  diametro: z.string(),
  longitud_m: z.number().positive(),
  acople: z.string().optional(), // NH/NST/instantáneo
  presionServicio: z.string().optional(),
  norma: z.string().optional(),
}).strict();

const specsExtintores = z.object({
  familia: z.literal("Extintores"),
  agente: z.string(), // ABC/BC/CO2/Agua/AF
  capacidad: z.string(),
  clase: z.string().optional(),
  presurizado: z.boolean().optional(),
  serie: z.string(),
  fechaVencimiento: z.coerce.date(),
  norma: z.string().optional(),
  certificador: z.string().optional(),
}).strict();

const specsSenaletica = z.object({
  familia: z.literal("Señalética"),
  material: z.string().optional(),
  dimensiones: z.string().optional(),
  fotoluminiscente: z.boolean().optional(),
  norma: z.string().optional(),
}).strict();

const specsEpp = z.object({
  familia: z.literal("EPP"),
  tipo: z.string(),
  talla: z.string().optional(),
  norma: z.string().optional(),
}).strict();

const specsConsumibles = z.object({
  familia: z.literal("Consumibles"),
  tipo: z.string(),
  compatibilidad: z.string().optional(),
}).strict();

const specsServicios = z.object({
  familia: z.literal("Servicios"),
  tipoServicio: z.string(),
}).strict();

const specsSchema = z.discriminatedUnion("familia", [
  specsTuberias,
  specsFittings,
  specsValvulas,
  specsRociadores,
  specsDeteccion,
  specsMangueras,
  specsExtintores,
  specsSenaletica,
  specsEpp,
  specsConsumibles,
  specsServicios,
]);

/* =========================
   Producto base
   ========================= */
const BaseProduct = z.object({
  sku: z.string().min(1),
  nombre: z.string().min(1),
  familia: z.string().min(1),
  subfamilia: z.string().optional(),
  unidadMedidaBase: z.enum(["unidad", "metro", "set", "caja"]),
  stockMin: z.coerce.number().int().min(0).default(0),
  marca: z.string().optional(),
  modelo: z.string().optional(),
  norma: z.string().optional(),
  codigoBarras: z.string().optional(),
  activo: z.coerce.boolean().default(true),
  descripcion: z.string().optional(),
  proveedorId: z.coerce.number().int().optional(),
  specs: specsSchema,
});

/* =========================
   LISTAR: GET /products
   ========================= */
const ListQuery = z.object({
  q: z.string().optional(),
  familia: z.string().optional(),
  subfamilia: z.string().optional(),
  sortBy: z.enum(["nombre", "sku", "createdAt"]).default("nombre"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

router.get("/", async (req, res) => {
  try {
    const { q, familia, subfamilia, sortBy, sortDir, page, pageSize } =
      ListQuery.parse(req.query);

    const AND: any[] = [];
    if (q && q.trim() !== "") {
      // SQLite: sin mode: 'insensitive'
      AND.push({ OR: [{ nombre: { contains: q } }, { sku: { contains: q } }] });
    }
    if (familia) AND.push({ familia });
    if (subfamilia) AND.push({ subfamilia });

    const where = AND.length ? { AND } : undefined;
    const orderBy: any = { [sortBy]: sortDir };

    const [total, data] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    res.json({ data, total, page, pageSize });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: "Parámetros inválidos" });
  }
});

/* =========================
   CREAR: POST /products
   ========================= */
router.post("/", async (req, res) => {
  const parsed = BaseProduct.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const data = parsed.data;

  // Reglas de unidad base
  if (data.specs.familia === "Extintores" && data.unidadMedidaBase !== "unidad") {
    return res
      .status(400)
      .json({ error: { message: "Extintores deben tener unidadMedidaBase = 'unidad'." } });
  }
  if (
    (data.specs.familia === "Tuberías" || data.specs.familia === "Mangueras") &&
    data.unidadMedidaBase !== "metro"
  ) {
    return res
      .status(400)
      .json({ error: { message: "Tuberías/Mangueras deben tener unidadMedidaBase = 'metro'." } });
  }

  try {
    const created = await prisma.product.create({
      data: {
        sku: data.sku,
        nombre: data.nombre,
        familia: data.familia,
        subfamilia: data.subfamilia,
        unidadMedidaBase: data.unidadMedidaBase,
        stockMin: data.stockMin,
        stock_m: 0,
        ppp: 0,
        marca: data.marca,
        modelo: data.modelo,
        norma: data.norma,
        codigoBarras: data.codigoBarras,
        activo: data.activo,
        descripcion: data.descripcion,
        proveedorId: data.proveedorId,
        specs: data.specs,
      },
    });
    res.status(201).json(created);
  } catch (err: any) {
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "SKU o código de barras duplicado" });
    }
    console.error(err);
    res.status(500).json({ error: "Error al crear producto" });
  }
});

/* =========================
   DETALLE: GET /products/:id
   ========================= */
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID inválido" });

  const p = await prisma.product.findUnique({ where: { id } });
  if (!p) return res.status(404).json({ error: "Producto no encontrado" });
  res.json(p);
});

/* =========================
   EDITAR PARCIAL: PATCH /products/:id
   ========================= */
const PartialProduct = BaseProduct.partial();

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID inválido" });

  const parsed = PartialProduct.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const body = parsed.data;

  // Reglas si viene specs + unidad base
  if (body.specs && body.unidadMedidaBase) {
    if (body.specs.familia === "Extintores" && body.unidadMedidaBase !== "unidad") {
      return res
        .status(400)
        .json({ error: { message: "Extintores deben tener unidadMedidaBase = 'unidad'." } });
    }
    if (
      (body.specs.familia === "Tuberías" || body.specs.familia === "Mangueras") &&
      body.unidadMedidaBase !== "metro"
    ) {
      return res
        .status(400)
        .json({ error: { message: "Tuberías/Mangueras deben tener unidadMedidaBase = 'metro'." } });
    }
  }

  try {
    const updated = await prisma.product.update({ where: { id }, data: body });
    res.json(updated);
  } catch (err: any) {
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "SKU/código duplicado" });
    }
    console.error(err);
    res.status(500).json({ error: "Error al actualizar producto" });
  }
});

/* =========================
   AJUSTE DE STOCK BASE (Decimal)
   PATCH /products/:id/stockm  { set: number }
   ========================= */
const PatchStockM = z.object({ set: z.coerce.number() });

router.patch("/:id/stockm", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID inválido" });

  const { set } = PatchStockM.parse(req.body);

  const current = await prisma.product.findUnique({
    where: { id },
    select: { stock_m: true },
  });
  if (!current) return res.status(404).json({ error: "Producto no encontrado" });

  const before = current.stock_m;
  const after = set;

  const updated = await prisma.product.update({
    where: { id },
    data: { stock_m: after },
  });

  res.json({ ...updated, _meta: { before, after } });
});
