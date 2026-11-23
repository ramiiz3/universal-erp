import test from "node:test";
import assert from "node:assert/strict";
import { extractBearerToken, verifySupabaseAccessToken } from "../auth.mjs";

test("bearer token extraction is case insensitive and strict", () => {
  assert.equal(extractBearerToken({ headers: { authorization: "Bearer abc.def" } }), "abc.def");
  assert.equal(extractBearerToken({ headers: { authorization: "bearer token" } }), "token");
  assert.equal(extractBearerToken({ headers: { authorization: "Basic token" } }), null);
  assert.equal(extractBearerToken({ headers: {} }), null);
});

test("server verifies token against the Supabase Auth user endpoint", async () => {
  let call;
  const userId = "123e4567-e89b-42d3-a456-426614174000";
  const result = await verifySupabaseAccessToken("valid-token", {
    supabaseUrl: "https://example.supabase.co/",
    publishableKey: "sb_publishable_example",
    fetchImpl: async (url, options) => {
      call = { url, options };
      return { ok: true, json: async () => ({ id: userId, email: "User@example.com" }) };
    },
  });
  assert.equal(call.url, "https://example.supabase.co/auth/v1/user");
  assert.equal(call.options.headers.apikey, "sb_publishable_example");
  assert.equal(call.options.headers.Authorization, "Bearer valid-token");
  assert.equal(result.id, userId);
  assert.equal(result.email, "user@example.com");
});

test("invalid or expired Supabase tokens are rejected", async () => {
  const result = await verifySupabaseAccessToken("expired", {
    supabaseUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_example",
    fetchImpl: async () => ({ ok: false, json: async () => ({}) }),
  });
  assert.equal(result, null);
  assert.equal(await verifySupabaseAccessToken("", {
    supabaseUrl: "https://example.supabase.co", publishableKey: "key",
  }), null);
});
