import { defineConfig } from "vitest/config";
import os from "node:os";
import tsconfigPaths from "vite-tsconfig-paths";

const CPU_COUNT = os.cpus().length;

export default defineConfig({
  plugins: [tsconfigPaths()], 
  test: {
    name: "unit",
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    globals: false,

    // ── TỐC ĐỘ ────────────────────────────────────────────────
    pool: "threads",
    maxWorkers: CPU_COUNT,
    fileParallelism: true,
    isolate: true,

    // ── COVERAGE ──────────────────────────────────────────────
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/docs/**",
        "src/**/*.swagger.ts",
        "src/**/dto/index.ts",
        "src/**/constants/index.ts",
        "src/**/dto/**",
        "src/server.ts",
        "src/core/tracing/tracing.ts",
        "src/app.ts",
      ],
      thresholds: {
        lines: 100,
        statements: 100,
        branches: 100,
        functions: 100,
        "src/modules/**/domain/**": {
          lines: 100,
          statements: 100,
          branches: 100,
          functions: 100,
        },
        "src/shared/value-objects/**": {
          lines: 100,
          statements: 100,
          branches: 100,
          functions: 100,
        },
      },
    },
  },
});
