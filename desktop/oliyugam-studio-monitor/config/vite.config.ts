import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const configDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(configDirectory, "..");

export default defineConfig({
  root: resolve(projectDirectory, "src/renderer"),
  base: "./",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: resolve(projectDirectory, "dist/renderer"),
    emptyOutDir: true,
  },
});