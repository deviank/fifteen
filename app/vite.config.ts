import { defineConfig } from "vite";

export default defineConfig({
  base: "/fifteen/",
  server: {
    host: "0.0.0.0",
    port: 47219,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 47219,
    strictPort: true,
    allowedHosts: true,
  },
});
