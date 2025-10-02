import express from 'express';
import cors from 'cors';
import { productos } from './routes/productos';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/productos', productos);

export default app;
