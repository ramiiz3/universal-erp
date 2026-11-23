import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../app.mjs";

async function withServer(options, run) {
  const server = createApp(options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await run("http://127.0.0.1:" + address.port);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("live health endpoint is public and does not expose configuration", async () => {
  await withServer({ pool: { query: async () => ({ rows: [] }) }, authenticate: async () => null }, async (base) => {
    const response = await fetch(base + "/health/live");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok", service: "universal-erp-api" });
  });
});

test("private API routes require an authenticated Supabase user", async () => {
  await withServer({ pool: { query: async () => ({ rows: [] }) }, authenticate: async () => null }, async (base) => {
    const response = await fetch(base + "/api/v1/me", { headers: { Authorization: "Bearer invalid" } });
    assert.equal(response.status, 401);
  });
});

test("unconfigured origins are not granted CORS access", async () => {
  await withServer({
    pool: { query: async () => ({ rows: [] }) },
    authenticate: async () => null,
    frontendOrigin: "https://erp.example.com",
  }, async (base) => {
    const response = await fetch(base + "/health/live", { headers: { Origin: "https://attacker.example" } });
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  });
});
