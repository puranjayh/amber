import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// The root vitest.config.ts only includes src/**, so `npm test` skips app tests.
// Until P1 widens that include, run these with: npx vitest run -c components/vitest.config.ts
export default defineConfig({
  root: fileURLToPath(new URL("../", import.meta.url)),
  resolve: {
    alias: { "@": fileURLToPath(new URL("../", import.meta.url)) },
  },
  test: {
    include: ["components/**/*.test.ts"],
    environment: "node",
  },
});
