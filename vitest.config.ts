import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "node",
    root: "./",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: ["node_modules/", "dist/", "tests/", "**/*.d.ts"],
    },
    alias: {
      "@": "/src",
      "@core": "/src/core",
      "@modules": "/src/modules",
      "@shared": "/src/shared",
      "@config": "/src/config",
    },
    pool: "forks",
    maxWorkers: 1,
  },
});
