import fs from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const appVersion = (
  process.env.VITE_APP_VERSION ||
  process.env.RELEASE_VERSION ||
  pkg.version ||
  '0.9.0'
).replace(/^v/i, '');
const buildNumber =
  process.env.VITE_BUILD_NUMBER ||
  process.env.BUILD_NUMBER ||
  process.env.GITHUB_RUN_NUMBER ||
  'local';
const commitSha = (
  process.env.VITE_COMMIT_SHA ||
  process.env.COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  'dev'
).slice(0, 7);
const githubRepo =
  process.env.VITE_GITHUB_REPO ||
  process.env.GITHUB_REPOSITORY ||
  'Key3952/airgorah';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_NUMBER__: JSON.stringify(String(buildNumber)),
    __COMMIT_SHA__: JSON.stringify(commitSha),
    __GITHUB_REPO__: JSON.stringify(githubRepo),
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          icons: ['lucide-react'],
        },
      },
    },
  },
});
