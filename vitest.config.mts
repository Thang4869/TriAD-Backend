import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  test: {
    projects: ["./vitest.unit.config.mts", "./vitest.integration.config.mts"],
  },
  plugins: [tsconfigPaths()],
});
