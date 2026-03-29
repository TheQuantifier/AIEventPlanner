import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiBaseUrl = env.API_BASE_URL || env.VITE_API_BASE_URL || "http://localhost:4000";

  return {
    root: "web",
    plugins: [react()],
    define: {
      __API_BASE_URL__: JSON.stringify(apiBaseUrl)
    },
    server: {
      host: "0.0.0.0",
      port: 3000
    },
    preview: {
      host: "0.0.0.0",
      port: 3000
    },
    build: {
      outDir: "dist",
      emptyOutDir: true
    }
  };
});
