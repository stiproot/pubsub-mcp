import { defineConfig } from "vitest/config";
import { config } from "dotenv";

// Load .env file for tests
config();

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/**",
        "dist/**",
        "**/*.test.ts",
        "**/__tests__/**",
      ],
    },
  },
});
