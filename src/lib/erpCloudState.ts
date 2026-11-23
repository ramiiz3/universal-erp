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
