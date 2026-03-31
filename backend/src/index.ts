import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config.js';
import { healthcheckDb } from './db.js';
import { buildEntityRouter } from './routes/entities.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', async (_req, res, next) => {
  try {
    await healthcheckDb();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.use('/api', buildEntityRouter());
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`Backend listening on http://localhost:${env.PORT}`);
});
