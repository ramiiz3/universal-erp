import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { Client } from "pg"
import {
  getLocalSupabaseEnvironment,
  repositoryRoot,
  requireLoopbackUrl,
} from "./local-supabase.mjs"

const suites = [
  { file: "supabase/tests/rls.test.sql", assertions: 39 },
  { file: "supabase/tests/inventory_tenant_rls.test.sql", assertions: 26 },
  { file: "supabase/tests/inventory_workflows.test.sql", assertions: 36 },
  { file: "supabase/tests/cloud_transactions.test.sql", assertions: 68 },
]

function tapValues(results) {
  const resultSets = Array.isArray(results) ? results : [results]
  return resultSets.flatMap((result) =>
    (result.rows ?? []).flatMap((row) =>
      Object.values(row).filter((value) => typeof value === "string"),
    ),
  )
}

function validateTapOutput(values, expectedAssertions, filename) {
  const plans = values
    .map((value) => value.trim())
    .filter((value) => /^\d+\.\.\d+$/.test(value))
  const assertions = values
    .map((value) => value.trim())
    .filter((value) => /^(?:ok|not ok)\s+\d+(?:\s+-|$)/.test(value))
  const failures = assertions.filter((value) => value.startsWith("not ok "))
  const indices = assertions.map((value) =>
    Number(value.match(/^(?:ok|not ok)\s+(\d+)/)?.[1]),
  )
  const expectedIndices = Array.from(
    { length: expectedAssertions },
    (_, index) => index + 1,
  )

  if (
    plans.length !== 1 ||
    plans[0] !== `1..${expectedAssertions}` ||
    assertions.length !== expectedAssertions ||
    failures.length > 0 ||
    indices.some((value, index) => value !== expectedIndices[index])
  ) {
    const details = [
      `expected plan 1..${expectedAssertions}, received ${plans.join(", ") || "none"}`,
      `executed ${assertions.length}/${expectedAssertions} assertions`,
      ...(failures.length ? [`failed: ${failures.join(" | ")}`] : []),
    ]
    throw new Error(`${filename}: ${details.join("; ")}`)
  }
}

async function runSuite(databaseUrl, suite) {
  const filename = suite.file
  const sql = await readFile(join(repositoryRoot, filename), "utf8")
  if (!/^\s*begin\s*;/i.test(sql) || !/rollback\s*;\s*$/i.test(sql)) {
    throw new Error(`${filename} must begin a transaction and end with ROLLBACK.`)
  }

  const client = new Client({
    connectionString: databaseUrl.toString(),
    application_name: "universalerp-local-database-security-tests",
  })
  let connected = false

  try {
    await client.connect()
    connected = true
    const results = await client.query(sql)
    validateTapOutput(tapValues(results), suite.assertions, filename)
    if (client.getTransactionStatus() !== "I") {
      throw new Error(`${filename}: PostgreSQL connection is not idle after the test transaction.`)
    }
    console.log(
      `PASS ${filename}: plan 1..${suite.assertions}; ${suite.assertions}/${suite.assertions} assertions; transaction rolled back`,
    )
  } catch (error) {
    const details = [
      error instanceof Error ? error.message : String(error),
      error && typeof error === "object" && "code" in error
        ? `SQLSTATE ${(error).code}`
        : "",
      error && typeof error === "object" && "position" in error
        ? `position ${(error).position}`
        : "",
    ].filter(Boolean)
    throw new Error(`${filename} failed: ${details.join("; ")}`)
  } finally {
    if (connected) await client.end()
  }
}

try {
  const environment = getLocalSupabaseEnvironment()
  const databaseUrl = requireLoopbackUrl(environment.get("DB_URL"), "DB_URL")
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
    throw new Error("Local DB_URL must use PostgreSQL.")
  }
  console.log(
    `Running against local Supabase only (${databaseUrl.hostname}:${databaseUrl.port}).`,
  )
  for (const suite of suites) {
    await runSuite(databaseUrl, suite)
  }
  const totalAssertions = suites.reduce((sum, suite) => sum + suite.assertions, 0)
  console.log(`PASS local database security suites: ${totalAssertions}/${totalAssertions} assertions`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
