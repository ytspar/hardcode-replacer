import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.VITE_BASE_URL || "/",
  root: ".",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
