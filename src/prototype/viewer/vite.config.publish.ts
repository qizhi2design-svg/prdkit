import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

// 只读模式构建配置
export default defineConfig({
  plugins: [
    react(),
    // 数据注入插件
    {
      name: 'inject-prototype-data',
      generateBundle() {
        // 读取临时数据文件（由打包逻辑生成）
        const dataPath = path.resolve(__dirname, '.publish-data.json');
        if (fs.existsSync(dataPath)) {
          const data = fs.readFileSync(dataPath, 'utf-8');
          // 将数据作为独立文件添加到构建产物中
          this.emitFile({
            type: 'asset',
            fileName: 'data.json',
            source: data
          });
        }
      }
    }
  ],
  define: {
    // 注入只读模式标志
    'import.meta.env.VITE_READONLY_MODE': JSON.stringify('true')
  },
  build: {
    outDir: '../../../dist/viewer-publish',
    emptyOutDir: true,
    // 优化构建
    minify: 'terser',
    sourcemap: false,
    rollupOptions: {
      output: {
        // 优化代码分割
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'antd-vendor': ['antd', '@ant-design/icons']
        }
      }
    }
  }
});
