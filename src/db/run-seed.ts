import { config } from "dotenv";

config({ path: ".env.local" });
config();

async function main() {
  // Keep async module loading inside main() instead of using top-level await.
  // This makes the seed runner work whether tsx/esbuild chooses an ESM or
  // CommonJS output path on Windows.
  const [{ closeDatabases }, { seedDatabase }] = await Promise.all([
    import("./index"),
    import("./seed"),
  ]);

  try {
    await seedDatabase();
  } finally {
    await closeDatabases();
  }
}

main().catch((error) => {
  console.error("Local database seed failed:");
  console.error(error);
  process.exitCode = 1;
});
