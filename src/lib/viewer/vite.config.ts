import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const cliRoot = path.resolve(__dirname, '../../..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, cliRoot, '');
  const apiPort = env.API_PORT || process.env.API_PORT || '3001';

  return {
    envDir: cliRoot,
    plugins: [react()],
    build: {
      outDir: '../../../dist/viewer',
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
        '/preview': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
        '/checkpoint-preview': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
        '/ws': {
          target: `ws://localhost:${apiPort}`,
          ws: true,
          changeOrigin: true,
        },
      },
      hmr: {},
    }
  };
});
