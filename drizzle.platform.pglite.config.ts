import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });
config();

export default defineConfig({
  schema: "./src/db/platform-schema.ts",
  out: "./drizzle/platform-pglite",
  dialect: "postgresql",
  driver: "pglite",
  dbCredentials: { url: process.env.PLATFORM_PGLITE_DIR || ".local-db/platform-core" },
  verbose: true,
  strict: true,
});
