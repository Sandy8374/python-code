import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { seedDatabase } from './server/seed.ts';
import authRouter from './server/routes/auth.ts';
import questionsRouter from './server/routes/questions.ts';
import executionRouter from './server/routes/execution.ts';
import progressRouter from './server/routes/progress.ts';
import featuresRouter from './server/routes/features.ts';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const IS_PROD = process.env.NODE_ENV === 'production';

async function startServer() {
  // Initialize SQLite schema and seed all Python categories, concepts, and exercises
  seedDatabase();

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  // Health & runtime engine status
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      engine: 'Pyodide WebAssembly (Browser Worker)',
      python_runtime: 'Pyodide CPython WebAssembly',
      timestamp: new Date().toISOString(),
    });
  });

  // Mount REST API routers
  app.use('/api/auth', authRouter);
  app.use('/api', questionsRouter);
  app.use('/api', executionRouter);
  app.use('/api', progressRouter);
  app.use('/api', featuresRouter);

  // Unknown API routes return JSON 404 instead of SPA HTML
  app.use('/api', (_req, res) => {
    res.status(404).json({ detail: 'API endpoint not found.' });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir, { index: false }));
    app.get('/{*splat}', (_req, res) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(500).send('Production build not found. Run npm run build first.');
      }
    });
  }

  // Global error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled server error:', err);
    res.status(500).json({ detail: err.message || 'Internal server error' });
  });

  app.listen(PORT, HOST, () => {
    console.log(`Python Mastery server listening on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
