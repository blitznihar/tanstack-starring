import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "lcov"],
      reportsDirectory: "coverage",
      all: true,
      include: [
        "src/domain/**/*.ts",
        "src/lib/dates.ts",
        "src/lib/env.ts",
        "src/server/auth/password.ts",
        "src/server/auth/rbac.ts",
      ],
      exclude: [
        "src/routeTree.gen.ts",
        "src/vite-env.d.ts",
        "src/routes/**",
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
