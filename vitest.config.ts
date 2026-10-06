import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["src/test/setup.ts"],
    // tsc emits compiled *.test.js into dist/; don't run them twice.
    exclude: [...configDefaults.exclude, "dist/**"],
  },
});
