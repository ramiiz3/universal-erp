import { randomBytes, randomUUID } from "node:crypto"
import { Client } from "pg"
import {
  getLocalSupabaseEnvironment,
  requireLoopbackUrl,
} from "./local-supabase.mjs"

const bucketName = "company-files"
const suffix = randomUUID()
const users = []
const companies = []
const paths = []
let database
let apiUrl
let anonymousKey
let serviceRoleKey

function pass(message) {
  console.log(`PASS ${message}`)
}

function check(condition, message) {
  if (!condition) throw new Error(`FAIL ${message}`)
  pass(message)
}

async function createAuthUser(email) {
  const password = randomBytes(32).toString("base64url")
  const created = await apiRequest(
    "POST",
    "/auth/v1/admin/users",
    serviceRoleKey,
    serviceRoleKey,
    JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Temporary Storage API Security Test" },
    }),
  )
  if (created.status < 200 || created.status >= 300 || !created.body?.id) {
    throw new Error(`Auth user creation failed with HTTP ${created.status}.`)
  }
  users.push(created.body.id)

  const signedIn = await apiRequest(
    "POST",
    "/auth/v1/token?grant_type=password",
    anonymousKey,
    anonymousKey,
    JSON.stringify({ email, password }),
  )
  if (signedIn.status < 200 || signedIn.status >= 300 || !signedIn.body?.access_token) {
    throw new Error(`Password sign-in failed with HTTP ${signedIn.status}.`)
  }
  pass(`Temporary Company ${email.includes("storage-a-") ? "A" : "B"} authenticated; access token retained in memory only`)
  return { id: created.body.id, accessToken: signedIn.body.access_token }
}

async function createCompanyForUser(userId, label) {
  const { rows } = await database.query(
    `insert into public.companies (name, legal_name, country, currency, created_by)
     values ($1, $2, 'AE', 'AED', $3)
     returning id`,
    [`Temporary Storage Test ${label} ${suffix}`, `Temporary Storage Test ${label} LLC ${suffix}`, userId],
  )
  const companyId = rows[0].id
  companies.push(companyId)
  await database.query(
    `insert into public.branches (company_id, name, is_default, created_by)
     values ($1, 'Temporary Test Branch', true, $2)`,
    [companyId, userId],
  )
  await database.query(
    `insert into public.company_memberships
       (company_id, user_id, role_id, branch_id, status, joined_at)
     select $1, $2, roles.id, null, 'active', now()
     from public.roles as roles
     where roles.role_key = 'owner'`,
    [companyId, userId],
  )
  return companyId
}

async function adminObjectExists(path) {
  const [companyId, ...filenameParts] = path.split("/")
  const filename = filenameParts.join("/")
  const result = await apiRequest(
    "POST",
    `/storage/v1/object/list/${encodeURIComponent(bucketName)}`,
    serviceRoleKey,
    serviceRoleKey,
    JSON.stringify({ prefix: companyId, limit: 100, search: filename }),
  )
  if (result.status < 200 || result.status >= 300 || !Array.isArray(result.body)) {
    throw new Error(`Could not verify Storage object existence (HTTP ${result.status}).`)
  }
  return result.body.some((object) => object.name === filename)
}

function assertHttp(condition, operation, status, expected) {
  check(condition, `${operation}: expected ${expected}; actual HTTP ${status}`)
}

async function apiRequest(method, path, key, token, body, contentType = "application/json") {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      apikey: key,
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": contentType }),
    },
    ...(body === undefined ? {} : { body }),
  })
  const responseText = await response.text()
  let responseBody
  try {
    responseBody = responseText ? JSON.parse(responseText) : null
  } catch {
    responseBody = responseText
  }
  console.log(`HTTP ${method} ${path} -> ${response.status}`)
  return { status: response.status, body: responseBody }
}

async function uploadPrivateFile(user, path, contents, companyLabel) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/")
  const response = await apiRequest(
    "POST",
    `/storage/v1/object/${encodeURIComponent(bucketName)}/${encodedPath}`,
    anonymousKey,
    user.accessToken,
    contents,
    "text/plain",
  )
  assertHttp(
    response.status >= 200 && response.status < 300,
    `${companyLabel} private upload`,
    response.status,
    "2xx",
  )
}

async function downloadPrivateFile(user, path, expectedContents, shouldExist, label) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/")
  const response = await apiRequest(
    "GET",
    `/storage/v1/object/${encodeURIComponent(bucketName)}/${encodedPath}`,
    anonymousKey,
    user.accessToken,
  )
  const actualContents = typeof response.body === "string" ? response.body : ""
  assertHttp(
    shouldExist
      ? response.status === 200 && actualContents === expectedContents
      : response.status >= 400,
    label,
    response.status,
    shouldExist ? "HTTP 200 with expected contents" : "HTTP error because the object is unavailable",
  )
  return response
}

async function cleanup() {
  const cleanupErrors = []
  if (apiUrl && serviceRoleKey && paths.length) {
    const cleanupResult = await apiRequest(
      "DELETE",
      `/storage/v1/object/${encodeURIComponent(bucketName)}`,
      serviceRoleKey,
      serviceRoleKey,
      JSON.stringify({ prefixes: paths }),
    )
    if (cleanupResult.status < 200 || cleanupResult.status >= 300) {
      cleanupErrors.push(`Storage cleanup failed with HTTP ${cleanupResult.status}.`)
    }
    for (const path of paths) {
      try {
        if (await adminObjectExists(path)) {
          cleanupErrors.push(`Storage cleanup left an object behind: ${path}`)
        }
      } catch (verificationError) {
        cleanupErrors.push(`Storage cleanup verification: ${verificationError.message}`)
      }
    }
  }
  if (database && companies.length) {
    try {
      await database.query("delete from public.companies where id = any($1::uuid[])", [companies])
      const { rows } = await database.query(
        "select count(*)::integer as count from public.companies where id = any($1::uuid[])",
        [companies],
      )
      if (rows[0].count !== 0) cleanupErrors.push("Temporary company rows remain after cleanup.")
      const { rows: memberships } = await database.query(
        "select count(*)::integer as count from public.company_memberships where company_id = any($1::uuid[])",
        [companies],
      )
      if (memberships[0].count !== 0) cleanupErrors.push("Temporary company memberships remain after cleanup.")
    } catch (error) {
      cleanupErrors.push(`Company cleanup: ${error.message}`)
    }
  }
  if (apiUrl && serviceRoleKey) {
    for (const userId of users) {
      const deleted = await apiRequest(
        "DELETE",
        `/auth/v1/admin/users/${encodeURIComponent(userId)}`,
        serviceRoleKey,
        serviceRoleKey,
      )
      if (deleted.status < 200 || deleted.status >= 300) {
        cleanupErrors.push(`Auth user cleanup failed with HTTP ${deleted.status}.`)
      }
    }
  }
  if (database && users.length) {
    try {
      const { rows } = await database.query(
        "select count(*)::integer as count from auth.users where id = any($1::uuid[])",
        [users],
      )
      if (rows[0].count !== 0) cleanupErrors.push("Temporary auth.users rows remain after cleanup.")
    } catch (error) {
      cleanupErrors.push(`Auth database cleanup verification: ${error.message}`)
    }
  }
  if (database) {
    try {
      await database.end()
    } catch (error) {
      cleanupErrors.push(`Database connection cleanup: ${error.message}`)
    }
  }
  return cleanupErrors
}

async function main() {
  const env = getLocalSupabaseEnvironment()
  apiUrl = requireLoopbackUrl(env.get("API_URL"), "API_URL").origin
  const databaseUrl = requireLoopbackUrl(env.get("DB_URL"), "DB_URL")
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
    throw new Error("Local DB_URL must use PostgreSQL.")
  }
  anonymousKey = env.get("ANON_KEY") || env.get("PUBLISHABLE_KEY")
  serviceRoleKey = env.get("SERVICE_ROLE_KEY")
  if (!anonymousKey || !serviceRoleKey) {
    throw new Error("Local Supabase status did not provide the required local API keys.")
  }

  console.log(`Using local Native Runtime only: ${apiUrl} and ${databaseUrl.hostname}:${databaseUrl.port}`)
  database = new Client({ connectionString: databaseUrl.toString(), application_name: "local-storage-api-security-test" })
  await database.connect()

  const { rows: bucketRows } = await database.query(
    "select public from storage.buckets where id = $1",
    [bucketName],
  )
  check(bucketRows.length === 1 && bucketRows[0].public === false, "company-files bucket exists and is private")

  const userA = await createAuthUser(`storage-a-${suffix}@example.test`)
  const userB = await createAuthUser(`storage-b-${suffix}@example.test`)
  const companyA = await createCompanyForUser(userA.id, "A")
  const companyB = await createCompanyForUser(userB.id, "B")
  const pathA = `${companyA}/${suffix}-company-a.txt`
  const pathB = `${companyB}/${suffix}-company-b.txt`
  paths.push(pathA, pathB)
  const contentA = `private storage test company A ${suffix}`
  const contentB = `private storage test company B ${suffix}`

  for (const [user, path, content, label] of [
    [userA, pathA, contentA, "Company A"],
    [userB, pathB, contentB, "Company B"],
  ]) {
    await uploadPrivateFile(user, path, content, label)
    await downloadPrivateFile(user, path, content, true, `${label} can verify its uploaded object exists`)
  }

  const ownDelete = await apiRequest(
    "DELETE",
    `/storage/v1/object/${encodeURIComponent(bucketName)}`,
    anonymousKey,
    userA.accessToken,
    JSON.stringify({ prefixes: [pathA] }),
  )
  assertHttp(
    ownDelete.status >= 200 && ownDelete.status < 300,
    "Company A own-file DELETE",
    ownDelete.status,
    "2xx",
  )
  await downloadPrivateFile(userA, pathA, contentA, false, "Company A's own file is absent after DELETE")

  const crossDelete = await apiRequest(
    "DELETE",
    `/storage/v1/object/${encodeURIComponent(bucketName)}`,
    anonymousKey,
    userA.accessToken,
    JSON.stringify({ prefixes: [pathB] }),
  )
  const crossDeleteCount = Array.isArray(crossDelete.body) ? crossDelete.body.length : null
  assertHttp(
    crossDelete.status >= 400 ||
      (crossDelete.status >= 200 && crossDelete.status < 300 && crossDeleteCount === 0),
    "Company A cross-company DELETE",
    crossDelete.status,
    "HTTP denial or 2xx with zero deleted objects",
  )
  if (crossDelete.status >= 200 && crossDelete.status < 300) {
    console.log(`INFO cross-company DELETE was filtered by RLS: HTTP ${crossDelete.status}, response ${JSON.stringify(crossDelete.body)}.`)
  }
  await downloadPrivateFile(userB, pathB, contentB, true, "Company B still sees its file after Company A's DELETE attempt")
  await downloadPrivateFile(userA, pathB, contentB, false, "Company A cannot access Company B's file")

  const companyBDelete = await apiRequest(
    "DELETE",
    `/storage/v1/object/${encodeURIComponent(bucketName)}`,
    anonymousKey,
    userB.accessToken,
    JSON.stringify({ prefixes: [pathB] }),
  )
  assertHttp(
    companyBDelete.status >= 200 && companyBDelete.status < 300,
    "Company B own-file DELETE",
    companyBDelete.status,
    "2xx",
  )
  await downloadPrivateFile(userB, pathB, contentB, false, "Company B's own file is absent after DELETE")
}

let failure
try {
  await main()
} catch (error) {
  failure = error
  console.error(error instanceof Error ? error.message : String(error))
} finally {
  const cleanupErrors = await cleanup()
  for (const error of cleanupErrors) console.error(`CLEANUP ERROR: ${error}`)
  if (cleanupErrors.length && !failure) failure = new Error("Temporary test resources were not fully cleaned up.")
}

if (failure) process.exitCode = 1
else console.log("PASS temporary users, companies, memberships, and Storage objects were cleaned up")
