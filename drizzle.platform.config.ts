import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });
config();

export default defineConfig({
  schema: "./src/db/platform-schema.ts",
  out: "./drizzle/platform",
  dialect: "postgresql",
  dbCredentials: { url: process.env.PLATFORM_DATABASE_URL! },
  verbose: true,
  strict: true,
});
