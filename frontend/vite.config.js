import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const appUpdated = new Date().toISOString().slice(0, 10);

export default defineConfig({
  define: { __APP_UPDATED__: JSON.stringify(appUpdated) },
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
