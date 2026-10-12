import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // The Python API runs on :8000 during development.
    proxy: { "/api": "http://localhost:8000" },
  },
});
