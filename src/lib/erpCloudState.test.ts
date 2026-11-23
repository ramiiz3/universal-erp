import { beforeEach, describe, expect, it } from "vitest"
import type { StorageLike } from "./erpBackup"
import {
  areERPCloudStatesEqual,
  createERPCloudState,
  restoreERPCloudState,
  validateERPCloudState,
} from "./erpCloudState"
import { ERP_BACKUP_STORAGE_KEYS } from "./erpStorageKeys"

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>()
  failNextSetFor: string | null = null

  get length() {
    return this.values.size
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    if (this.failNextSetFor === key) {
      this.failNextSetFor = null
      throw new Error("simulated quota failure")
    }
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  seed(key: string, value: string) {
    this.values.set(key, value)
  }
}

describe("pharmacy ERP cloud-state snapshots", () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
  })

  it("captures exactly the ERP backup allowlist and excludes unrelated browser data", () => {
    for (const key of ERP_BACKUP_STORAGE_KEYS) storage.seed(key, "value:" + key)
    storage.seed("supabase.auth.token", "must-not-leave-the-browser")
    storage.seed("universal-erp-theme", "dark")

    const snapshot = createERPCloudState(storage)
    expect(snapshot.entries.map((entry) => entry.key)).toEqual([...ERP_BACKUP_STORAGE_KEYS])
    expect(snapshot.entries.every((entry) => entry.value === "value:" + entry.key)).toBe(true)
    expect(JSON.stringify(snapshot)).not.toContain("must-not-leave-the-browser")
    expect(JSON.stringify(snapshot)).not.toContain("supabase.auth.token")
  })

  it("validates a complete snapshot and rejects missing, duplicate or unknown keys", () => {
    const snapshot = createERPCloudState(storage)
    expect(validateERPCloudState(snapshot)).toEqual(snapshot)

    expect(() => validateERPCloudState({ ...snapshot, entries: snapshot.entries.slice(1) }))
      .toThrow(/unsupported format/)

    expect(() => validateERPCloudState({
      ...snapshot,
      entries: [...snapshot.entries.slice(1), snapshot.entries[0]],
    })).toThrow(/duplicate/)

    expect(() => validateERPCloudState({
      ...snapshot,
      entries: snapshot.entries.map((entry, index) =>
        index === 0 ? { ...entry, key: "admin.secrets" } : entry,
      ),
    })).toThrow(/unexpected/)
  })

  it("restores only allowlisted ERP keys", () => {
    const original = createERPCloudState(storage)
    for (const key of ERP_BACKUP_STORAGE_KEYS) storage.seed(key, "current:" + key)
    storage.seed("supabase.auth.token", "keep-this-session")

    restoreERPCloudState(storage, original)

    for (const key of ERP_BACKUP_STORAGE_KEYS) {
      expect(storage.getItem(key)).toBeNull()
    }
    expect(storage.getItem("supabase.auth.token")).toBe("keep-this-session")
  })

  it("compares snapshots by storage key rather than JSON object property order", () => {
    const left = createERPCloudState(storage)
    const right = {
      entries: left.entries.map((entry) => ({ value: entry.value, key: entry.key })),
      schemaVersion: left.schemaVersion,
      format: left.format,
    }
    expect(areERPCloudStatesEqual(left, right)).toBe(true)
  })

  it("rejects a restore if local writes fail and rolls back already-written keys", () => {
    const original = createERPCloudState(storage)
    const target = {
      ...original,
      entries: original.entries.map((entry) => ({
        ...entry,
        value: "restored:" + entry.key,
      })),
    }
    storage.seed(ERP_BACKUP_STORAGE_KEYS[0], "original-one")
    storage.seed(ERP_BACKUP_STORAGE_KEYS[1], "original-two")
    storage.failNextSetFor = ERP_BACKUP_STORAGE_KEYS[1]

    expect(() => restoreERPCloudState(storage, target)).toThrow(/could not be loaded/)
    expect(storage.getItem(ERP_BACKUP_STORAGE_KEYS[0])).toBe("original-one")
    expect(storage.getItem(ERP_BACKUP_STORAGE_KEYS[1])).toBe("original-two")
  })
})
