import { defineConfig } from "vitest/config";

const config: ReturnType<typeof defineConfig> = defineConfig({
  test: { include: ["test/**/*.test.ts"] },
});

export default config;
