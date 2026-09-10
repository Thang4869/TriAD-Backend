import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: "integration",
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["./tests/integration/global-setup.ts"],
    setupFiles: ["./tests/integration/setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
