// src/app.ts
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth";
import productosRouter from "./routes/productosV2";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(cors());
app.use(express.json());

// Rutas públicas
app.use("/auth", authRoutes);
// Aquí conectamos nuestro router nuevo
app.use("/productos", productosRouter);

export default app;
