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
    },
    // 移除 type="module" 和 crossorigin 以支持 file:// 协议
    {
      name: 'remove-module-type',
      transformIndexHtml(html) {
        // 移除 type="module" 和 crossorigin 属性
        return html
          .replace(/type="module"\s+crossorigin/g, '')
          .replace(/crossorigin\s+/g, '')
          .replace(/\s+crossorigin/g, '');
      }
    }
  ],
  // 使用相对路径避免 CORS 问题
  base: './',
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
        // 使用 iife 格式以支持 file:// 协议
        format: 'iife',
        // 单文件输出，避免 ES modules 的 CORS 问题
        inlineDynamicImports: true
      }
    }
  }
});
