import { pool } from "./index";
import { seedDatabase } from "./seed";

try {
  await seedDatabase();
} finally {
  await pool.end();
}
