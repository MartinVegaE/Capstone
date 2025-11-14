// backend/src/app.ts
import "dotenv/config";
import express from "express";
import cors from "cors";

import productsRouter from "./routes/productos"; // ← tu router de productos (en español)
import prisma from "./prisma";

const app = express();

/* ===== Middlewares ===== */
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

/* ===== Health & DB check ===== */
app.get("/health", async (_req, res) => {
  try {
    // chequeo rápido a la DB
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: "up", env: process.env.NODE_ENV ?? "development" });
  } catch (e) {
    res.status(500).json({ ok: false, db: "down" });
  }
});

/* ===== Routes ===== */
app.use("/products", productsRouter);     // GET/POST/PATCH productos alineado a tu schema
// app.use("/ingresos", ingresosRouter);  // cuando lo tengas
// app.use("/movimientos", movimientosRouter); // cuando lo tengas

/* ===== 404 ===== */
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

/* ===== Error handler ===== */
app.use(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
);

export default app;
