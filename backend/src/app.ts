import express from 'express';
import cors from 'cors';
import { productos } from './routes/productos';
import ingresosRouter from './routes/ingresos';

const app = express();
app.use(cors());
app.use(express.json());
app.use(cors({ origin: [/^http:\/\/localhost:\d+$/], credentials: true }));
app.use(express.json());
app.use('/ingresos', ingresosRouter);
app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/productos', productos);

export default app;
