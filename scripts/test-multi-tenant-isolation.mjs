import assert from "node:assert/strict";
import { Pool } from "pg";

const connectionString = process.env.SECURITY_TEST_DATABASE_URL;
if (!connectionString) {
  console.error("Set SECURITY_TEST_DATABASE_URL to a PostgreSQL connection using the non-owner erp_app role.");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  max: 1,
  ...(process.env.PGSSLMODE === "require"
    ? { ssl: { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== "false" } }
    : {}),
});

const userA = "10000000-0000-4000-8000-000000000001";
const userB = "20000000-0000-4000-8000-000000000002";

async function createCompany(client, userId, name, email) {
  await client.query("select set_config('erp.user_id', $1, true)", [userId]);
  const result = await client.query(
    "select erp_private.create_company_with_owner($1,$2,'IN','INR',5,'','','', '', 'INV', '', 'Main') as id",
    [name, name + " Pvt Ltd"],
  );
  assert.ok(result.rows[0].id);
  return result.rows[0].id;
}

let client;
try {
  client = await pool.connect();
  await client.query("begin");

  const companyA = await createCompany(client, userA, "Isolation Test A", "a@example.test");
  const companyB = await createCompany(client, userB, "Isolation Test B", "b@example.test");

  await client.query("select set_config('erp.user_id', $1, true)", [userA]);
  await client.query("select set_config('erp.company_id', $1, true)", [companyA]);
  await client.query(
    "insert into public.erp_company_records(company_id,entity_type,record_id,data,created_by,updated_by) values($1,'products','PRODUCT-A',$2::jsonb,$3,$3)",
    [companyA, JSON.stringify({ name: "Tenant A product" }), userA],
  );

  await client.query("select set_config('erp.user_id', $1, true)", [userB]);
  await client.query("select set_config('erp.company_id', $1, true)", [companyB]);
  await client.query(
    "insert into public.erp_company_records(company_id,entity_type,record_id,data,created_by,updated_by) values($1,'products','PRODUCT-B',$2::jsonb,$3,$3)",
    [companyB, JSON.stringify({ name: "Tenant B product" }), userB],
  );

  await client.query("select set_config('erp.user_id', $1, true)", [userA]);
  await client.query("select set_config('erp.company_id', $1, true)", [companyB]);

  const membership = await client.query(
    "select erp_private.is_company_member($1,$2) as allowed",
    [companyB, userA],
  );
  assert.equal(membership.rows[0].allowed, false, "user A must not be a member of company B");

  const foreignRead = await client.query(
    "select record_id from public.erp_company_records where company_id=$1",
    [companyB],
  );
  assert.equal(foreignRead.rowCount, 0, "RLS must hide company B records from user A");

  await client.query("savepoint cross_tenant_insert");
  let insertDenied = false;
  try {
    await client.query(
      "insert into public.erp_company_records(company_id,entity_type,record_id,data,created_by,updated_by) values($1,'products','FORGED',$2::jsonb,$3,$3)",
      [companyB, JSON.stringify({ name: "forged" }), userA],
    );
  } catch (error) {
    insertDenied = error.code === "42501";
    await client.query("rollback to savepoint cross_tenant_insert");
  }
  assert.equal(insertDenied, true, "RLS must reject a cross-company insert");

  await client.query("select set_config('erp.company_id', $1, true)", [companyA]);
  const ownRead = await client.query(
    "select record_id from public.erp_company_records where company_id=$1 and record_id='PRODUCT-A'",
    [companyA],
  );
  assert.equal(ownRead.rowCount, 1, "a member should still read their own company records");

  const visibleCompanies = await client.query(
    "select id from public.erp_companies where id in ($1,$2)",
    [companyA, companyB],
  );
  assert.deepEqual(visibleCompanies.rows.map((row) => row.id), [companyA]);

  await client.query("rollback");
  console.log("PASS: separate companies are isolated by PostgreSQL row-level security.");
} catch (error) {
  if (client) {
    try { await client.query("rollback"); } catch {}
  }
  console.error("Multi-company database isolation test failed:", error);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
