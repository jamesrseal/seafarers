import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';

// The time of the last commit that changed application code (frontend or
// backend source), so data-only refreshes don't bump it. The header shows the
// later of this and the latest data refresh as "Updated". A full ISO timestamp
// (%cI), not a date, because the header shows a time too. The `:/` pathspec is
// repo-root-relative, so this works even though Vite builds from frontend/.
// Falls back to the build time if git history isn't available (e.g. a shallow
// clone with no app-code commit in range).
function lastAppCommitTime() {
  try {
    const time = execSync('git log -1 --format=%cI -- :/frontend :/backend/src', { encoding: 'utf8' }).trim();
    if (time) return time;
  } catch { /* git unavailable — fall through to build time */ }
  return new Date().toISOString();
}

export default defineConfig({
  define: { __APP_UPDATED__: JSON.stringify(lastAppCommitTime()) },
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
