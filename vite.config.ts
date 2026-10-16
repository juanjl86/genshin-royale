import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  base: "./",
  server: { host: "0.0.0.0", port: 5178, strictPort: true },
  preview: {
    host: "0.0.0.0",
    port: 4172,
    strictPort: true,
    allowedHosts: ["vmi3188333.tailbae6b9.ts.net", ".tailbae6b9.ts.net", "localhost"],
  },
  build: { outDir: "dist", emptyOutDir: true, target: "es2020" },
});
