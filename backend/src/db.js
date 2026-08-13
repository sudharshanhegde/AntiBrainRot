import "./env.js";
import { setDefaultResultOrder } from "node:dns";
import pg from "pg";

// Prefer IPv4 when resolving the Postgres host. Some environments have
// no IPv6 route and would otherwise fail with ENETUNREACH even though
// IPv4 connectivity is fine.
setDefaultResultOrder("ipv4first");

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn(
    "DATABASE_URL is not set. Copy backend/.env.example to backend/.env and configure Postgres."
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  family: 4,
});

// Small wrapper so callers do not need to deal with pg result objects.
export async function query(text, params) {
  const result = await pool.query(text, params);
  return result;
}
