// ─── Structured Logger (Pino) ───────────────────────────────────────────────
// JSON-formatted logs with automatic request-ID binding.
// In development mode (`NODE_ENV !== 'production'`), logs are piped through
// `pino-pretty` for human-readable output.

import pino from 'pino';
import { config } from '../config.js';

const transport =
  config.nodeEnv !== 'production'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      }
    : undefined;

export const logger = pino({
  level: config.logLevel,
  transport,
  serializers: pino.stdSerializers,
  base: { service: 'page-pulse' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;
