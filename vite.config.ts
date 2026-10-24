import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

// Stamp the service worker per deploy so the browser always sees a new worker
// (byte-diff) after a release, which triggers update + cache purge.
function deployVersion(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12);
  }
  const swPath = resolve(__dirname, 'public/sw.js');
  return `${Math.floor(statSync(swPath).mtimeMs)}-${readFileSync(swPath).length}`;
}

function serviceWorkerVersionPlugin(): Plugin {
  const version = deployVersion();
  return {
    name: 'stamp-service-worker-version',
    apply: 'build',
    closeBundle() {
      const swPath = resolve(__dirname, 'dist/sw.js');
      const sw = readFileSync(swPath, 'utf8');
      if (!sw.includes('__DEPLOY_VERSION__')) {
        throw new Error('dist/sw.js is missing the __DEPLOY_VERSION__ placeholder');
      }
      const stamped = sw.replace(/__DEPLOY_VERSION__/g, version);
      if (stamped === sw) {
        throw new Error('Service worker version stamping failed');
      }
      writeFileSync(swPath, stamped);
      console.log(`sw.js stamped with deploy version ${version}`);
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorkerVersionPlugin()],
  server: {
    port: 3002,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
