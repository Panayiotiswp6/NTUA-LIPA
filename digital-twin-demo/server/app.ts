import compression from 'compression';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { ServerConfig } from './config';
import type { SuggestionService } from './suggestionService';
import { validateRequest } from './suggestionService';
import type { UsageBudget } from './budget';
import { twinRouter, type TwinContext } from './twin/routes';

export function createApp(config: ServerConfig, service: SuggestionService, budget: UsageBudget, twin?: TwinContext) {
  const app = express();
  app.disable('x-powered-by');
  // Brotli or gzip for every text response: the app shell shrinks about four times on the wire.
  app.use(compression());
  app.use(express.json({ limit: '256kb' }));
  app.use((_request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  // API answers depend on local data and must never be reused from a cache.
  app.use('/api', (_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); });

  app.get('/api/health', (_request, response) => {
    response.json({
      status: 'ok',
      ai: {
        enabled: service.aiEnabled,
        paused: config.aiPaused,
        model: service.aiEnabled ? config.chatModel : null,
        embeddingModel: service.aiEnabled ? config.embeddingModel : null,
      },
      usage: budget.snapshot(),
    });
  });

  app.post('/api/suggest', async (request, response) => {
    const problem = validateRequest(request.body);
    if (problem) {
      response.status(400).json({ error: problem });
      return;
    }
    try {
      const suggestion = await service.suggest(request.body);
      response.json({ suggestion });
    } catch (error) {
      response.status(422).json({ error: (error as Error).message });
    }
  });

  if (twin) app.use('/api/twin', twinRouter(twin));

  app.use('/api', (_request, response) => { response.status(404).json({ error: 'Not found' }); });

  if (config.staticDir && existsSync(config.staticDir)) {
    const root = path.resolve(config.staticDir);
    const assets = `${path.sep}assets${path.sep}`;
    app.use(express.static(root, {
      index: false,
      setHeaders(response, file) {
        // The build fingerprints everything under /assets, so a browser can keep those files for good.
        response.setHeader('Cache-Control', file.includes(assets) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
      },
    }));
    // Single-page app: every other GET returns the shell, always revalidated so a new build is picked up at once.
    app.get(/.*/, (_request, response) => { response.sendFile(path.join(root, 'index.html'), { headers: { 'Cache-Control': 'no-cache' } }); });
  }
  return app;
}
