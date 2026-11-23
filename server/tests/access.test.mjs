import test from "node:test";
import assert from "node:assert/strict";
import {
  canDeleteRecords, canReadCompany, canWriteRecords, normalizeEmail,
  validateEntityType, validateJsonValue, validateRecordId,
} from "../access.mjs";

test("company roles have deliberately limited permissions", () => {
  for (const role of ["owner", "admin", "manager", "staff"]) assert.equal(canReadCompany(role), true);
  assert.equal(canReadCompany("unknown"), false);
  assert.equal(canWriteRecords("owner"), true);
  assert.equal(canWriteRecords("admin"), true);
  assert.equal(canWriteRecords("manager"), true);
  assert.equal(canWriteRecords("staff"), false);
  assert.equal(canDeleteRecords("owner"), true);
  assert.equal(canDeleteRecords("admin"), true);
  assert.equal(canDeleteRecords("manager"), false);
  assert.equal(canDeleteRecords("staff"), false);
});

test("record type and record id validation rejects unsafe values", () => {
  assert.equal(validateEntityType("products"), true);
  assert.equal(validateEntityType("stock_movements"), true);
  assert.equal(validateEntityType("Products"), false);
  assert.equal(validateEntityType("products;drop_table"), false);
  assert.equal(validateRecordId("SKU-1001"), true);
  assert.equal(validateRecordId("bad\nid"), false);
  assert.equal(validateRecordId(""), false);
});

test("record payloads are JSON serializable and size bounded", () => {
  assert.equal(validateJsonValue({ name: "Product" }), true);
  assert.equal(validateJsonValue(undefined), false);
  assert.equal(validateJsonValue({ huge: "x".repeat(200) }, 100), false);
  const circular = {};
  circular.self = circular;
  assert.equal(validateJsonValue(circular), false);
});

test("email normalisation checks shape and length", () => {
  assert.equal(normalizeEmail("  USER@Example.COM "), "user@example.com");
  assert.equal(normalizeEmail("invalid"), null);
  assert.equal(normalizeEmail("x".repeat(250)), null);
});
