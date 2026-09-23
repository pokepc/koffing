import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: {
      koffing: fileURLToPath(new URL("../../packages/koffing/src/index.ts", import.meta.url)),
    },
  },
});
