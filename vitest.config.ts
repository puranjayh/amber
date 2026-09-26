import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Test runner config. The engine is pure, so there is no setup file, no
 * environment, and no globals — `import { describe } from "vitest"` everywhere.
 * The alias mirrors tsconfig's `@/*` so tests import from `@/src/contracts`
 * exactly as production code does (docs/CONTRACT.md §1).
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
