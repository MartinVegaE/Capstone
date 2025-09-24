// /backend/src/app.ts (o server.ts)
import express from 'express';
import productosRouter from './routes/productos';
import cors from 'cors';
// simple y efectivo


const app = express();
app.use(express.json()); // 👈 necesario para leer JSON en PATCH/POST
app.use(cors({ origin: true })); 
// (tu /health si ya lo tenías)
app.get('/health', (_req, res) => res.json({ ok: true }));

// 👇 monta tus rutas de productos
app.use('/productos', productosRouter);

export default app;
