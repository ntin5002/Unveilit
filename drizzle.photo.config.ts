import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });
config();

export default defineConfig({
  schema: "./src/db/photo-schema.ts",
  out: "./drizzle/photo",
  dialect: "postgresql",
  dbCredentials: { url: process.env.PHOTO_DATABASE_URL! },
  verbose: true,
  strict: true,
});
