import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: "unit",
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],

      // QUAN TRỌNG: bật `all` để những file KHÔNG được test nào import
      // vẫn bị tính là 0% thay vì biến mất khỏi báo cáo.
      all: true,
      include: ["src/**/*.ts"],

      exclude: [
        "src/**/*.d.ts",
        "src/**/docs/**", // swagger jsdoc, không có logic
        "src/**/dto/index.ts", // barrel re-export
        "src/**/constants/index.ts",
        "src/server.ts", // bootstrap: cover bằng smoke test nếu cần
        "src/core/tracing/tracing.ts", // SDK init, side-effect thuần
      ],

      thresholds: {
        lines: 80,
        statements: 80,
        branches: 75,
        functions: 80,

        // Siết riêng phần domain – đây là nơi bug đắt nhất.
        "src/modules/**/domain/**": {
          lines: 100,
          statements: 100,
          branches: 95,
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
