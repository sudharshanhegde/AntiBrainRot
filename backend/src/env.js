import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Loads .env from the backend directory regardless of the current
// working directory. Import this first in any backend script.
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env") });
// Fall back to the pipeline .env for DEEPSEEK_API_KEY, so the automated
// generation job can reuse the key the pipeline already holds.
config({ path: join(__dirname, "..", "..", "pipeline", ".env") });
