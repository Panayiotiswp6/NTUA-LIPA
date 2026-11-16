import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { ServerConfig } from './config';
import type { SuggestionService } from './suggestionService';
import { validateRequest } from './suggestionService';
import type { UsageBudget } from './budget';

export function createApp(config: ServerConfig, service: SuggestionService, budget: UsageBudget) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));
  app.use((_request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

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

  app.use('/api', (_request, response) => { response.status(404).json({ error: 'Not found' }); });

  if (config.staticDir && existsSync(config.staticDir)) {
    const root = path.resolve(config.staticDir);
    app.use(express.static(root, { index: false, maxAge: '1h' }));
    // Single-page app: every other GET returns the shell.
    app.get(/.*/, (_request, response) => { response.sendFile(path.join(root, 'index.html')); });
  }
  return app;
}
