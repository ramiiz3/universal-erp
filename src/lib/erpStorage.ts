import type { StorageLike } from "./erpBackup"

export type StoredDataLoadResult<T> = {
  data: T
  raw: string | null
  error: string | null
}

const REQUIRED_STORE_ARRAYS = [
  "products",
  "inventoryLots",
  "inventoryMovements",
  "customers",
  "sales",
  "purchases",
] as const

export function readStoredData<T extends Record<string, unknown>>(
  storage: StorageLike,
  storageKey: string,
  createDemoData: () => T,
): StoredDataLoadResult<T> {
  let raw: string | null

  try {
    raw = storage.getItem(storageKey)
  } catch (error) {
    return {
      data: createDemoData(),
      raw: null,
      error: `The saved ERP store could not be read. ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  if (raw === null) {
    return { data: createDemoData(), raw: null, error: null }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return {
      data: createDemoData(),
      raw,
      error: `The saved ERP store contains malformed JSON and was left untouched. ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      data: createDemoData(),
      raw,
      error: "The saved ERP store is not a valid data object and was left untouched.",
    }
  }

  const saved = parsed as Record<string, unknown>
  const invalidArray = REQUIRED_STORE_ARRAYS.find(
    (field) => !Array.isArray(saved[field]),
  )
  if (invalidArray) {
    return {
      data: createDemoData(),
      raw,
      error: `The saved ERP store is missing a valid "${invalidArray}" list and was left untouched.`,
    }
  }

  return {
    data: saved as T,
    raw,
    error: null,
  }
}
