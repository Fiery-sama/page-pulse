// ─── Page Pulse – Server Bootstrap ──────────────────────────────────────────
// Configures Express middleware, mounts API routes, and starts the HTTP
// server with graceful shutdown support (SIGTERM / SIGINT).

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { errorHandlerMiddleware } from './middleware/errorHandler.js';
import { auditRouter } from './routes/auditRouter.js';

// ── Application factory (exported for test use) ────────────────────────────

export function createApp() {
  const app = express();

  // ── Security & parsing ──────────────────────────────────────────────────
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  // ── Observability ───────────────────────────────────────────────────────
  app.use(requestIdMiddleware);
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => (req.url ?? '').includes('/health') },
      customProps: (req) => ({ requestId: (req as express.Request).id }),
    }),
  );

  // ── API routes ──────────────────────────────────────────────────────────
  app.use('/api/v1', auditRouter);

  // ── Root redirect ─────────────────────────────────────────────────────
  app.get('/', (_req, res) => {
    res.json({
      service: 'Page Pulse',
      version: '1.0.0',
      docs: '/api/v1/health',
    });
  });

  // ── 404 handler ─────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'The requested endpoint does not exist',
        timestamp: new Date().toISOString(),
      },
    });
  });

  // ── Global error handler (must be last) ─────────────────────────────────
  app.use(errorHandlerMiddleware);

  return app;
}

// ── Start server (skipped during test imports) ─────────────────────────────

const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST;

if (!isTestEnv) {
  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info(
      { port: config.port, env: config.nodeEnv },
      `🚀 Page Pulse is running on http://localhost:${config.port}`,
    );
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal, closing server…');
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
    // Force-kill after 10 seconds if connections are hanging
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
