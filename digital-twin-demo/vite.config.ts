import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API server runs separately (npm run dev:server); Vite forwards /api to it.
const apiPort = process.env.API_PORT || '3000';
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { proxy: { '/api': `http://localhost:${apiPort}` } },
  preview: { proxy: { '/api': `http://localhost:${apiPort}` } },
});
