require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");

const app = express();
app.use(cors());
app.use(express.json());

const prisma = new PrismaClient();
const PORT = process.env.PORT || 4000;

// Health
app.get("/health", (_req, res) => res.json({ ok: true }));

// DB Health
app.get("/db-health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ db: "ok" });
  } catch (e) {
    res.status(500).json({ db: "fail", error: String(e) });
  }
});

// === Productos ===

// GET /productos?search=texto
app.get("/productos", async (req, res) => {
  const search = (req.query.search || "").toString().trim();
  const where = search
    ? {
        OR: [
          { nombre: { contains: search } },
          { sku: { contains: search } },
          { codigoBarras: { contains: search } },
        ],
      }
    : {};
  const items = await prisma.producto.findMany({
    where,
    orderBy: { id: "desc" },
  });
  res.json(items);
});

// POST /productos
app.post("/productos", async (req, res) => {
  const { sku, nombre, marca, categoria, stock, ubicacion, codigoBarras } = req.body || {};
  if (!sku || !nombre) {
    return res.status(400).json({ error: "sku y nombre son obligatorios" });
  }
  try {
    const creado = await prisma.producto.create({
      data: {
        sku: String(sku),
        nombre: String(nombre),
        marca: marca ?? null,
        categoria: categoria ?? null,
        stock: Number.isFinite(stock) ? Number(stock) : 0,
        ubicacion: ubicacion ?? null,
        codigoBarras: codigoBarras ?? null,
      },
    });
    res.status(201).json(creado);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});
// PATCH /productos/:id  { stock: number }
app.patch("/productos/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { stock } = req.body || {};
  if (!Number.isFinite(id) || !Number.isFinite(Number(stock))) {
    return res.status(400).json({ error: "id y stock deben ser numéricos" });
  }
  try {
    const actualizado = await prisma.producto.update({
      where: { id },
      data: { stock: Number(stock) },
    });
    res.json(actualizado);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
})
// DELETE /productos/:id
app.delete("/productos/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id inválido" });
  try {
    await prisma.producto.delete({ where: { id } });
    res.status(204).send(); // sin contenido
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});
;


app.listen(PORT, () => console.log(`API http://localhost:${PORT}`));

app.get("/", (_req, res) => {
  res.send(`
    <html>
      <head><meta charset="utf-8"><title>Capstone API</title></head>
      <body style="font-family: sans-serif">
        <h1>Capstone API</h1>
        <ul>
          <li><a href="/health">/health</a></li>
          <li><a href="/db-health">/db-health</a></li>
          <li><a href="/productos">/productos</a></li>
        </ul>
      </body>
    </html>
  `);
});
