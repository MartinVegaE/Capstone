require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

app.get("/health", (_req, res) => res.json({ ok: true }));
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

app.get("/productos", async (_req, res) => {
  const items = await prisma.producto.findMany({ orderBy: { id: "desc" } });
  res.json(items);
});


app.listen(PORT, () => {
  console.log(`API escuchando en http://localhost:${PORT}`);
});
