require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const app = express();

// CORS amplio (incluye PATCH/DELETE y preflight)
app.use(cors({
  origin: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

// Logs simples para ver qué llega
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Health
app.get("/health", (_req, res) => res.json({ ok: true }));

// LISTAR
app.get("/productos", async (_req, res) => {
  const list = await prisma.producto.findMany({ orderBy: { id: "asc" } });
  res.json(list);
});

// CREAR
app.post("/productos", async (req, res) => {
  const b = req.body || {};
  if (!b.sku || !b.nombre) return res.status(400).json({ error: "sku y nombre son obligatorios" });
  const stock = Number(b.stock ?? 0);
  if (!Number.isFinite(stock) || stock < 0) return res.status(400).json({ error: "stock debe ser número >= 0" });

  try {
    const creado = await prisma.producto.create({
      data: {
        sku: String(b.sku).trim(),
        nombre: String(b.nombre).trim(),
        marca: b.marca?.trim() || null,
        categoria: b.categoria?.trim() || null,
        ubicacion: b.ubicacion?.trim() || null,
        codigoBarras: b.codigoBarras?.trim() || null,
        stock
      }
    });
    res.status(201).json(creado);
  } catch (e) {
    if (e?.code === "P2002") {
      const campo = e.meta?.target?.[0] || "campo único";
      return res.status(409).json({ error: `Ya existe un producto con ese ${campo}` });
    }
    res.status(400).json({ error: String(e.message || e) });
  }
});

// ACTUALIZAR STOCK
app.patch("/productos/:id", async (req, res) => {
  const id = Number(req.params.id);
  const stock = Number(req.body?.stock);
  console.log("PATCH stock ->", { id, stock, body: req.body });
  if (!Number.isFinite(id) || !Number.isFinite(stock) || stock < 0) {
    return res.status(400).json({ error: "id y stock deben ser numéricos, stock >= 0" });
  }
  try {
    const actualizado = await prisma.producto.update({
      where: { id },
      data: { stock }
    });
    res.json(actualizado);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// ELIMINAR
app.delete("/productos/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id inválido" });
  try {
    await prisma.producto.delete({ where: { id } });
    res.status(204).send();
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`API on http://0.0.0.0:${PORT}`);
});
