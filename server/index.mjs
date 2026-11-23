import { Pool } from "pg";
import { createApp } from "./app.mjs";
import { verifySupabaseAccessToken } from "./auth.mjs";

const required = ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error("Missing required environment variables: " + missing.join(", "));
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PGPOOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 8_000,
  statement_timeout: 15_000,
  ...(process.env.PGSSLMODE === "require"
    ? { ssl: { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== "false" } }
    : {}),
});
pool.on("error", (error) => console.error("Unexpected PostgreSQL pool error:", error));

const authenticate = (token) => verifySupabaseAccessToken(token, {
  supabaseUrl: process.env.SUPABASE_URL,
  publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
});

const server = createApp({
  pool,
  authenticate,
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
});

const port = Number(process.env.PORT || 3001);
server.listen(port, "0.0.0.0", () => {
  console.log("Universal ERP API listening on port " + port);
});

async function shutdown(signal) {
  console.log("Received " + signal + "; shutting down Universal ERP API.");
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
