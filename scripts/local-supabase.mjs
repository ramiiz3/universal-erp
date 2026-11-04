import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
export const repositoryRoot = dirname(scriptDirectory)
const supabaseBinary = join(repositoryRoot, "node_modules", ".bin", "supabase")

function parseStatusEnvironment(output) {
  const values = new Map()
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^(?:export\s+)?([A-Z0-9_]+)=(.*)$/)
    if (!match) continue
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    values.set(match[1], value)
  }
  return values
}

export function requireLoopbackUrl(value, label) {
  if (!value) {
    throw new Error(`Local Supabase status did not provide ${label}.`)
  }
  const url = new URL(value)
  const hostname = url.hostname.replace(/^\[|\]$/g, "")
  if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    throw new Error(`Refusing non-local ${label} host: ${hostname}`)
  }
  return url
}

export function getLocalSupabaseEnvironment() {
  let output
  try {
    output = execFileSync(
      supabaseBinary,
      ["status", "--env", "--output-format", "text"],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    )
  } catch (error) {
    const code = error && typeof error === "object" && "status" in error
      ? error.status
      : "unknown"
    throw new Error(
      `Could not read local Supabase status (CLI exit ${code}). Start the local Native Runtime and retry.`,
    )
  }

  const values = parseStatusEnvironment(output)
  requireLoopbackUrl(values.get("API_URL"), "API_URL")
  requireLoopbackUrl(values.get("DB_URL"), "DB_URL")
  return values
}
