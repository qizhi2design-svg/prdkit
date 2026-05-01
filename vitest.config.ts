import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: /^#commands\/(.*)\.js$/, replacement: path.resolve(__dirname, "src/commands/$1.ts") },
      { find: /^#constants\/(.*)\.js$/, replacement: path.resolve(__dirname, "src/constants/$1.ts") },
      { find: /^#core\/(.*)\.js$/, replacement: path.resolve(__dirname, "src/core/$1.ts") },
      { find: /^#lib\/(.*)\.js$/, replacement: path.resolve(__dirname, "src/lib/$1.ts") },
      { find: /^#types\/(.*)\.js$/, replacement: path.resolve(__dirname, "src/types/$1.ts") },
      { find: /^#utils\/(.*)\.js$/, replacement: path.resolve(__dirname, "src/utils/$1.ts") }
    ]
  },
  test: {
    environment: "node"
  }
});
