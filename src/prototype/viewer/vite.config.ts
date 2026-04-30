import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const apiPort = process.env.API_PORT || '3001';

export default defineConfig({
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
      // WebSocket 代理
      '/ws': {
        target: `ws://localhost:${apiPort}`,
        ws: true,
        changeOrigin: true,
      },
    },
    // 配置 WebSocket 代理到 API 服务器
    hmr: {
      // Vite 自己的 HMR 使用默认配置
    },
  }
});
