import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("migrations");
  return {
    test: {
      projects: [
        // Pure modules and scripts, in Node.
        { test: { name: "unit", include: ["tests/unit/**/*.test.ts"] } },
        // Worker routes inside workerd, with a local D1 migrated before each file.
        {
          plugins: [
            cloudflareTest({
              wrangler: { configPath: "./wrangler.jsonc" },
              miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
            }),
          ],
          test: {
            name: "worker",
            include: ["tests/worker/**/*.test.ts"],
            setupFiles: ["tests/worker/apply-migrations.ts"],
          },
        },
      ],
    },
  };
});
