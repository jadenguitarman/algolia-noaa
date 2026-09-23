import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig(({ mode }) => {
  const sharedEnv = loadEnv(mode, resolve(__dirname, ".."), "");

  return {
    plugins: [react()],
    envDir: resolve(__dirname, ".."),
    define: {
      "import.meta.env.VITE_SIGNALDOCK_BASE_URL": JSON.stringify(
        process.env.NEXT_PUBLIC_SIGNALDOCK_BASE_URL ?? sharedEnv.NEXT_PUBLIC_SIGNALDOCK_BASE_URL,
      ),
      "import.meta.env.VITE_SIGNALDOCK_APP_KEY": JSON.stringify(
        process.env.NEXT_PUBLIC_SIGNALDOCK_APP_KEY ?? sharedEnv.NEXT_PUBLIC_SIGNALDOCK_APP_KEY,
      ),
    },
    build: { outDir: "dist" },
  };
});
