import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    main: "src/main/main.ts",
    preload: "src/preload/preload.ts",
  },
  outDir: "dist",
  format: ["cjs"],
  target: "node22",
  platform: "node",
  bundle: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ["electron", "better-sqlite3"],
  outExtension: () => ({ js: ".cjs" }),
});