import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });
config();

export default defineConfig({
  schema: "./src/db/photo-schema.ts",
  out: "./drizzle/photo-pglite",
  dialect: "postgresql",
  driver: "pglite",
  dbCredentials: { url: process.env.PHOTO_PGLITE_DIR || ".local-db/photo-delivery" },
  verbose: true,
  strict: true,
});
