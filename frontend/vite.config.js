import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';

let appUpdated = '';
try { appUpdated = execSync('git log -1 --format=%ci').toString().trim().slice(0, 10); } catch {}

export default defineConfig({
  define: { __APP_UPDATED__: JSON.stringify(appUpdated) },
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
