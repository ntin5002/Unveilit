import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is not set; drizzle commands will require it before connecting.");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/photo_delivery",
  },
});
