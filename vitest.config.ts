import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  define: {
    __NAIVE_STYLE_ISOLATION_VERSION__: JSON.stringify("2.44.1"),
    __NAIVE_STYLE_ISOLATION_NAMESPACE__: JSON.stringify("consumer-expense-app"),
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
