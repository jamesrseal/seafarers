import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';

// "App updated" = date of the last commit that changed application code
// (frontend or backend source), so data-only refreshes don't bump it. The `:/`
// pathspec is repo-root-relative, so this works even though Vite builds from
// frontend/. Falls back to the build date if git history isn't available
// (e.g. a shallow clone with no app-code commit in range).
function lastAppCommitDate() {
  try {
    const date = execSync('git log -1 --format=%cs -- :/frontend :/backend/src', { encoding: 'utf8' }).trim();
    if (date) return date;
  } catch { /* git unavailable — fall through to build date */ }
  return new Date().toISOString().slice(0, 10);
}

export default defineConfig({
  define: { __APP_UPDATED__: JSON.stringify(lastAppCommitDate()) },
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
