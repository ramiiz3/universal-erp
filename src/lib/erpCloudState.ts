import {
  ERP_BACKUP_STORAGE_KEYS,
  ERP_STORAGE_KEY,
  type StorageLike,
} from "./erpBackup"

export const ERP_CLOUD_STATE_FORMAT = "zaky-pharmacy-erp-cloud-state"
export const ERP_CLOUD_STATE_SCHEMA_VERSION = 1
export const ERP_CLOUD_SYNC_EVENT = "zaky-pharmacy-erp-cloud-sync"

export type ERPCloudState = {
  format: typeof ERP_CLOUD_STATE_FORMAT
  schemaVersion: typeof ERP_CLOUD_STATE_SCHEMA_VERSION
  entries: { key: string; value: string | null }[]
}

const allowedKeys = new Set<string>(ERP_BACKUP_STORAGE_KEYS)

/**
 * Captures only the explicit ERP backup allowlist. Auth tokens, Supabase
 * sessions, theme settings, and unrelated browser storage are never copied.
 */
export function createERPCloudState(
  storage: StorageLike,
  overrides: Record<string, string | null> = {},
): ERPCloudState {
  return {
    format: ERP_CLOUD_STATE_FORMAT,
    schemaVersion: ERP_CLOUD_STATE_SCHEMA_VERSION,
    entries: ERP_BACKUP_STORAGE_KEYS.map((key) => ({
      key,
      value: Object.prototype.hasOwnProperty.call(overrides, key)
        ? overrides[key]
        : storage.getItem(key),
    })),
  }
}

export function validateERPCloudState(value: unknown): ERPCloudState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The saved pharmacy data is not a valid object.")
  }

  const state = value as Record<string, unknown>
  if (
    state.format !== ERP_CLOUD_STATE_FORMAT ||
    state.schemaVersion !== ERP_CLOUD_STATE_SCHEMA_VERSION ||
    !Array.isArray(state.entries) ||
    state.entries.length !== ERP_BACKUP_STORAGE_KEYS.length
  ) {
    throw new Error("The saved pharmacy data has an unsupported format.")
  }

  const seen = new Set<string>()
  const entries = state.entries.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("The saved pharmacy data contains an invalid entry.")
    }
    const item = entry as Record<string, unknown>
    if (
      typeof item.key !== "string" ||
      !allowedKeys.has(item.key) ||
      seen.has(item.key) ||
      (item.value !== null && typeof item.value !== "string")
    ) {
      throw new Error("The saved pharmacy data contains an unexpected or duplicate storage key.")
    }
    seen.add(item.key)
    return { key: item.key, value: item.value as string | null }
  })

  if (seen.size !== allowedKeys.size) {
    throw new Error("The saved pharmacy data is missing an ERP storage key.")
  }

  return {
    format: ERP_CLOUD_STATE_FORMAT,
    schemaVersion: ERP_CLOUD_STATE_SCHEMA_VERSION,
    entries,
  }
}

/**
 * Applies a validated cloud snapshot atomically from the browser's point of
 * view. If a local write fails, previously stored keys are restored.
 */
export function areERPCloudStatesEqual(leftValue: unknown, rightValue: unknown): boolean {
  try {
    const left = validateERPCloudState(leftValue)
    const right = validateERPCloudState(rightValue)
    const rightByKey = new Map(right.entries.map((entry) => [entry.key, entry.value]))
    return left.entries.every((entry) => rightByKey.get(entry.key) === entry.value)
  } catch {
    return false
  }
}


export type ERPCloudStateMergeResult = {
  state: ERPCloudState | null
  conflicts: string[]
}

const MISSING = Symbol("missing-erp-cloud-value")
type MergeValue = unknown | typeof MISSING

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>).sort().map((key) => [
      key,
      canonicalize((value as Record<string, unknown>)[key]),
    ]),
  )
}

function mergeValuesEqual(left: MergeValue, right: MergeValue): boolean {
  if (left === MISSING || right === MISSING) return left === right
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))
}

function isRecord(value: MergeValue): value is Record<string, unknown> {
  return value !== MISSING && Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function identifiedArray(value: MergeValue): value is Record<string, unknown>[] {
  if (!Array.isArray(value)) return false
  const ids = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false
    const id = (item as Record<string, unknown>).id
    if ((typeof id !== "string" && typeof id !== "number") || !String(id)) return false
    if (ids.has(String(id))) return false
    ids.add(String(id))
  }
  return true
}

function mergeStructuredValue(
  base: MergeValue,
  local: MergeValue,
  remote: MergeValue,
  path: string,
): { ok: true; value: MergeValue } | { ok: false; conflict: string } {
  if (mergeValuesEqual(local, base)) return { ok: true, value: remote }
  if (mergeValuesEqual(remote, base) || mergeValuesEqual(local, remote)) {
    return { ok: true, value: local }
  }

  if (isRecord(base) && isRecord(local) && isRecord(remote)) {
    const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])
    const merged: Record<string, unknown> = {}
    for (const key of keys) {
      const result = mergeStructuredValue(
        Object.prototype.hasOwnProperty.call(base, key) ? base[key] : MISSING,
        Object.prototype.hasOwnProperty.call(local, key) ? local[key] : MISSING,
        Object.prototype.hasOwnProperty.call(remote, key) ? remote[key] : MISSING,
        `${path}.${key}`,
      )
      if (!result.ok) return result
      if (result.value !== MISSING) merged[key] = result.value
    }
    return { ok: true, value: merged }
  }

  if (identifiedArray(base) && identifiedArray(local) && identifiedArray(remote)) {
    const byId = (items: Record<string, unknown>[]) =>
      new Map(items.map((item) => [String(item.id), item]))
    const baseById = byId(base)
    const localById = byId(local)
    const remoteById = byId(remote)
    const orderedIds = [
      ...base.map((item) => String(item.id)),
      ...local.map((item) => String(item.id)).filter((id) => !baseById.has(id)),
      ...remote.map((item) => String(item.id)).filter((id) => !baseById.has(id) && !localById.has(id)),
    ]
    const merged: Record<string, unknown>[] = []
    for (const id of orderedIds) {
      const result = mergeStructuredValue(
        baseById.has(id) ? baseById.get(id)! : MISSING,
        localById.has(id) ? localById.get(id)! : MISSING,
        remoteById.has(id) ? remoteById.get(id)! : MISSING,
        `${path}[id=${id}]`,
      )
      if (!result.ok) return result
      if (result.value !== MISSING) merged.push(result.value as Record<string, unknown>)
    }
    return { ok: true, value: merged }
  }

  return { ok: false, conflict: path }
}

function parseJsonEntry(value: string | null): MergeValue {
  if (value === null) return MISSING
  try {
    return JSON.parse(value) as unknown
  } catch {
    return MISSING
  }
}

/**
 * Reconciles changes made on two workstations against their last acknowledged
 * common snapshot. Objects and ID-addressed arrays are merged field by field.
 * Concurrent edits to the same field, or to arrays without stable IDs, are
 * reported as conflicts rather than silently choosing one workstation.
 */
export function mergeERPCloudStates(
  baseValue: unknown,
  localValue: unknown,
  remoteValue: unknown,
): ERPCloudStateMergeResult {
  const base = validateERPCloudState(baseValue)
  const local = validateERPCloudState(localValue)
  const remote = validateERPCloudState(remoteValue)
  const baseEntries = new Map(base.entries.map((entry) => [entry.key, entry.value]))
  const localEntries = new Map(local.entries.map((entry) => [entry.key, entry.value]))
  const remoteEntries = new Map(remote.entries.map((entry) => [entry.key, entry.value]))
  const conflicts: string[] = []
  const entries = ERP_BACKUP_STORAGE_KEYS.map((key) => {
    const baseText = baseEntries.get(key) ?? null
    const localText = localEntries.get(key) ?? null
    const remoteText = remoteEntries.get(key) ?? null

    if (localText === baseText) return { key, value: remoteText }
    if (remoteText === baseText || localText === remoteText) return { key, value: localText }

    const baseJson = parseJsonEntry(baseText)
    const localJson = parseJsonEntry(localText)
    const remoteJson = parseJsonEntry(remoteText)
    if (baseJson === MISSING || localJson === MISSING || remoteJson === MISSING) {
      conflicts.push(key)
      return { key, value: localText }
    }

    const result = mergeStructuredValue(baseJson, localJson, remoteJson, key)
    if (!result.ok) {
      conflicts.push(result.conflict)
      return { key, value: localText }
    }
    return {
      key,
      value: result.value === MISSING ? null : JSON.stringify(result.value),
    }
  })

  return {
    state: conflicts.length ? null : {
      format: ERP_CLOUD_STATE_FORMAT,
      schemaVersion: ERP_CLOUD_STATE_SCHEMA_VERSION,
      entries,
    },
    conflicts,
  }
}

export function restoreERPCloudState(
  storage: StorageLike,
  value: unknown,
): ERPCloudState {
  const state = validateERPCloudState(value)
  const previous = state.entries.map(({ key }) => ({
    key,
    value: storage.getItem(key),
  }))

  try {
    for (const entry of state.entries) {
      if (entry.value === null) storage.removeItem(entry.key)
      else storage.setItem(entry.key, entry.value)
    }
  } catch (error) {
    for (const entry of previous) {
      try {
        if (entry.value === null) storage.removeItem(entry.key)
        else storage.setItem(entry.key, entry.value)
      } catch {
        // Best effort rollback; the original error remains the useful one.
      }
    }
    throw new Error(
      `The cloud data could not be loaded into this browser. Existing browser data was left intact where possible. ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  dispatchERPCloudSync()
  return state
}

export function dispatchERPCloudSync() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ERP_CLOUD_SYNC_EVENT))
  }
}

// Keep this import used as an explicit guard against accidentally changing
// the main data key without updating the cloud-state format.
export const ERP_CLOUD_MAIN_STORAGE_KEY = ERP_STORAGE_KEY
