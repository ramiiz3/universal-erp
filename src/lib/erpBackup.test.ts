import { describe, expect, it } from "vitest"
import {
  createERPBackup,
  createMigrationInventoryReport,
  ERP_BACKUP_FORMAT,
  ERP_BACKUP_STORAGE_KEYS,
  ERP_OWNER_PROFILE_STORAGE_KEY,
  ERP_READ_NOTIFICATIONS_STORAGE_KEY,
  ERP_SETTINGS_STORAGE_KEY,
  ERP_STORAGE_KEY,
  ERP_SUPPLIERS_STORAGE_KEY,
  getBackupDataWarnings,
  parseERPBackup,
  previewERPBackupRestore,
  restoreERPBackup,
  validateERPBackup,
} from "./erpBackup"
import { readStoredData } from "./erpStorage"

class MemoryStorage {
  private readonly values = new Map<string, string>()
  failNextSet = false

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
    if (this.failNextSet) {
      this.failNextSet = false
      throw new Error("storage write failed")
    }
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }
}

const demoData = () => ({
  products: [],
  inventoryLots: [],
  inventoryMovements: [],
  customers: [],
  sales: [],
  purchases: [],
})

function populatedStorage() {
  const storage = new MemoryStorage()
  storage.setItem(ERP_STORAGE_KEY, JSON.stringify({
    products: [{ id: "P-1" }],
    inventoryLots: [{ id: "L-1", productId: "P-1" }],
    inventoryMovements: [{ id: "M-1", productId: "P-1", lotId: "L-1" }],
    customers: [{ id: "C-1" }],
    sales: [{
      id: "S-1",
      invoiceNumber: "INV-2026-00001",
      customerId: "C-1",
      items: [{
        productId: "P-1",
        batchAllocations: [{ lotId: "L-1" }],
      }],
    }],
    purchases: [{ id: "PUR-1", supplierName: "Sample Supplier", items: [{ productId: "P-1" }] }],
  }))
  storage.setItem(ERP_SUPPLIERS_STORAGE_KEY, JSON.stringify([{ id: "SUP-1", name: "Sample Supplier" }]))
  storage.setItem(ERP_SETTINGS_STORAGE_KEY, JSON.stringify({ businessName: "Example" }))
  storage.setItem(ERP_OWNER_PROFILE_STORAGE_KEY, JSON.stringify({ name: "Owner" }))
  storage.setItem(ERP_READ_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(["low-stock-P-1"]))
  storage.setItem("universal-erp-theme", "dark")
  storage.setItem("custom-erp-extra", "opaque raw value")
  storage.setItem("sb-localhost-auth-token", JSON.stringify({
    access_token: "sample-access-token",
    refresh_token: "sample-refresh-token",
  }))
  storage.setItem("oauth-provider-credentials", "sample-oauth-credential")
  storage.setItem("universal-erp-demo-store-backup-2026-11-03", "local recovery snapshot")
  storage.setItem("unrelated-browser-setting", "keep me")
  return storage
}

describe("full ERP backup and restore", () => {
  it("backs up allowlisted ERP data and excludes auth, OAuth, theme, recovery, and unrelated keys", () => {
    const storage = populatedStorage()
    const backup = createERPBackup(storage, new Date("2026-11-03T10:00:00.000Z"), "1.2.3")

    expect(backup.format).toBe(ERP_BACKUP_FORMAT)
    expect(backup.schemaVersion).toBe(2)
    expect(backup.createdAt).toBe("2026-11-03T10:00:00.000Z")
    expect(backup.appVersion).toBe("1.2.3")
    expect(backup.entries.map((entry) => entry.key)).toEqual([...ERP_BACKUP_STORAGE_KEYS].sort())
    const serialized = JSON.stringify(backup)
    for (const excludedValue of [
      "sb-localhost-auth-token",
      "sample-access-token",
      "sample-refresh-token",
      "oauth-provider-credentials",
      "sample-oauth-credential",
      "universal-erp-theme",
      "custom-erp-extra",
      "local recovery snapshot",
      "unrelated-browser-setting",
    ]) {
      expect(serialized).not.toContain(excludedValue)
    }
    expect(backup.counts).toEqual({
      storageKeys: 5,
      products: 1,
      inventoryLots: 1,
      stockMovements: 1,
      customers: 1,
      sales: 1,
      invoices: 1,
      purchases: 1,
      suppliers: 1,
      settingsRecords: 1,
      ownerProfileRecords: 1,
      readNotificationRecords: 1,
      otherStorageKeys: 0,
    })
  })

  it("validates backup JSON, rejects malformed files and detects inconsistent counts", () => {
    expect(() => parseERPBackup("{")).toThrow("not valid JSON")
    expect(() => parseERPBackup(JSON.stringify({ format: "other" }))).toThrow(
      "not a supported UniversalERP backup",
    )

    const backup = createERPBackup(populatedStorage())
    expect(validateERPBackup(backup)).toEqual(backup)
    expect(() => validateERPBackup({ ...backup, counts: { ...backup.counts, products: 99 } }))
      .toThrow("counts do not match")
    expect(() => validateERPBackup({
      ...backup,
      entries: [...backup.entries, backup.entries[0]],
    })).toThrow("duplicate storage key")
  })

  it("previews replacement and requires confirmation before restoring", () => {
    const current = populatedStorage()
    current.setItem("current-only", "keep until confirmed")
    current.removeItem(ERP_READ_NOTIFICATIONS_STORAGE_KEY)
    const backupStorage = populatedStorage()
    backupStorage.removeItem(ERP_OWNER_PROFILE_STORAGE_KEY)
    const backup = createERPBackup(backupStorage)

    const preview = previewERPBackupRestore(current, backup)
    expect(preview.overwrittenKeys).toContain(ERP_STORAGE_KEY)
    expect(preview.removedKeys).toEqual([ERP_OWNER_PROFILE_STORAGE_KEY])
    expect(preview.addedKeys).toEqual([ERP_READ_NOTIFICATIONS_STORAGE_KEY])
    expect(() => restoreERPBackup(current, backup, false)).toThrow("Confirm")
    expect(current.getItem("current-only")).toBe("keep until confirmed")

    restoreERPBackup(current, backup, true)
    expect(current.getItem("current-only")).toBe("keep until confirmed")
    expect(current.getItem("custom-erp-extra")).toBe("opaque raw value")
    expect(current.getItem(ERP_OWNER_PROFILE_STORAGE_KEY)).toBeNull()
    expect(current.getItem(ERP_READ_NOTIFICATIONS_STORAGE_KEY)).toBe(
      backupStorage.getItem(ERP_READ_NOTIFICATIONS_STORAGE_KEY),
    )
    expect(current.getItem(ERP_STORAGE_KEY)).toBe(backupStorage.getItem(ERP_STORAGE_KEY))
    expect(current.getItem("sb-localhost-auth-token")).toBe(
      populatedStorage().getItem("sb-localhost-auth-token"),
    )
    expect(current.getItem("oauth-provider-credentials")).toBe("sample-oauth-credential")
    expect(current.getItem("universal-erp-theme")).toBe("dark")
    expect(current.getItem("universal-erp-demo-store-backup-2026-11-03")).toBe(
      "local recovery snapshot",
    )
    expect(current.getItem("unrelated-browser-setting")).toBe("keep me")
  })

  it("normalizes legacy v1 backups and reports excluded browser keys before restore", () => {
    const oldStorage = populatedStorage()
    const allOldEntries = Array.from({ length: oldStorage.length }, (_, index) => {
      const key = oldStorage.key(index)!
      return { key, value: oldStorage.getItem(key)! }
    }).sort((left, right) => left.key.localeCompare(right.key))
    const oldKnownKeys = new Set<string>([
      ERP_STORAGE_KEY,
      ERP_SETTINGS_STORAGE_KEY,
      ERP_SUPPLIERS_STORAGE_KEY,
      ERP_OWNER_PROFILE_STORAGE_KEY,
    ])
    const legacy = {
      ...createERPBackup(oldStorage),
      schemaVersion: 1,
      entries: allOldEntries,
      counts: {
        storageKeys: allOldEntries.length,
        products: 1,
        inventoryLots: 1,
        stockMovements: 1,
        customers: 1,
        sales: 1,
        invoices: 1,
        purchases: 1,
        suppliers: 1,
        settingsRecords: 1,
        ownerProfileRecords: 1,
        otherStorageKeys: allOldEntries.filter((entry) =>
          !oldKnownKeys.has(entry.key),
        ).length,
      },
    }

    const compatible = parseERPBackup(JSON.stringify(legacy))
    expect(compatible.schemaVersion).toBe(2)
    expect(compatible.entries.map((entry) => entry.key)).toEqual([...ERP_BACKUP_STORAGE_KEYS].sort())
    expect(compatible.legacyExcludedKeys).toContain("sb-localhost-auth-token")
    expect(getBackupDataWarnings(compatible).join(" ")).toContain(
      "non-ERP browser keys that were not imported",
    )

    const current = populatedStorage()
    const authSession = current.getItem("sb-localhost-auth-token")
    restoreERPBackup(current, compatible, true)
    expect(current.getItem("sb-localhost-auth-token")).toBe(authSession)
    expect(current.getItem("unrelated-browser-setting")).toBe("keep me")
  })

  it("rolls back the original storage snapshot when a restore write fails", () => {
    const storage = populatedStorage()
    const original = Array.from({ length: storage.length }, (_, index) => {
      const key = storage.key(index)!
      return [key, storage.getItem(key) ?? ""] as const
    }).sort(([left], [right]) => left.localeCompare(right))
    const backupStorage = populatedStorage()
    backupStorage.setItem(ERP_READ_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(["new"]))
    const backup = createERPBackup(backupStorage)
    storage.failNextSet = true

    expect(() => restoreERPBackup(storage, backup, true)).toThrow(
      "previous browser data was rolled back",
    )
    expect(Array.from({ length: storage.length }, (_, index) => {
      const key = storage.key(index)!
      return [key, storage.getItem(key) ?? ""] as const
    }).sort(([left], [right]) => left.localeCompare(right))).toEqual(original)
  })

  it("rejects a v2 backup that attempts to restore a non-ERP browser key", () => {
    const backup = createERPBackup(populatedStorage())
    expect(() => validateERPBackup({
      ...backup,
      entries: [...backup.entries, { key: "sb-session", value: "should-not-restore" }],
    })).toThrow("non-ERP storage key")
  })

  it("preserves malformed storage values for recovery and validates data warnings", () => {
    const storage = new MemoryStorage()
    storage.setItem(ERP_STORAGE_KEY, "{malformed business data")
    const backup = createERPBackup(storage)

    expect(backup.entries[0]?.value).toBe("{malformed business data")
    expect(getBackupDataWarnings(backup)).toContain(
      `Storage key "${ERP_STORAGE_KEY}" contains a value that is not valid JSON.`,
    )
    expect(() => parseERPBackup(JSON.stringify(backup))).not.toThrow()
  })

  it("restores a valid backup over a corrupted main-store value", () => {
    const originalBackup = createERPBackup(populatedStorage())
    const damagedStorage = new MemoryStorage()
    damagedStorage.setItem(ERP_STORAGE_KEY, "{corrupted")

    expect(readStoredData(damagedStorage, ERP_STORAGE_KEY, demoData).error).toContain(
      "malformed JSON",
    )
    restoreERPBackup(damagedStorage, originalBackup, true)
    expect(readStoredData(damagedStorage, ERP_STORAGE_KEY, demoData).error).toBeNull()
    expect(JSON.parse(damagedStorage.getItem(ERP_STORAGE_KEY)!).products).toEqual([{ id: "P-1" }])
  })
})

describe("stored ERP data recovery and migration inventory", () => {
  it("uses demo data only when the main store key is absent", () => {
    const storage = new MemoryStorage()
    const result = readStoredData(storage, ERP_STORAGE_KEY, demoData)

    expect(result).toEqual({ data: demoData(), raw: null, error: null })
  })

  it("returns malformed raw data for recovery instead of treating it as a valid empty store", () => {
    const storage = new MemoryStorage()
    const raw = "{not valid json"
    storage.setItem(ERP_STORAGE_KEY, raw)

    const result = readStoredData(storage, ERP_STORAGE_KEY, demoData)
    expect(result.raw).toBe(raw)
    expect(result.error).toContain("malformed JSON")
    expect(result.data).toEqual(demoData())
    expect(storage.getItem(ERP_STORAGE_KEY)).toBe(raw)
  })

  it("reports missing required arrays without replacing the stored value", () => {
    const storage = new MemoryStorage()
    const raw = JSON.stringify({ products: [{ id: "P-1" }] })
    storage.setItem(ERP_STORAGE_KEY, raw)

    const result = readStoredData(storage, ERP_STORAGE_KEY, demoData)
    expect(result.error).toContain('"inventoryLots"')
    expect(result.raw).toBe(raw)
    expect(storage.getItem(ERP_STORAGE_KEY)).toBe(raw)
  })

  it("loads a complete stored snapshot including unknown fields without demo replacement", () => {
    const storage = new MemoryStorage()
    const stored = { ...demoData(), products: [{ id: "P-1" }], futureField: { keep: true } }
    storage.setItem(ERP_STORAGE_KEY, JSON.stringify(stored))

    const result = readStoredData(storage, ERP_STORAGE_KEY, demoData)
    expect(result.error).toBeNull()
    expect(result.data).toEqual(stored)
  })

  it("reports category counts, identifiers, invoice numbers and broken references read-only", () => {
    const storage = populatedStorage()
    const invalidStore = JSON.parse(storage.getItem(ERP_STORAGE_KEY)!)
    invalidStore.inventoryLots[0].productId = "MISSING-PRODUCT"
    invalidStore.sales[0].customerId = "MISSING-CUSTOMER"
    invalidStore.sales[0].items[0].batchAllocations[0].lotId = "MISSING-LOT"
    storage.setItem(ERP_STORAGE_KEY, JSON.stringify(invalidStore))
    const before = storage.getItem(ERP_STORAGE_KEY)

    const report = createMigrationInventoryReport(
      storage,
      new Date("2026-11-03T10:00:00.000Z"),
    )
    expect(report.counts.products).toBe(1)
    expect(report.counts.suppliers).toBe(1)
    expect(report.ids.products).toEqual(["P-1"])
    expect(report.invoiceNumbers).toEqual(["INV-2026-00001"])
    expect(report.missingRelationships).toHaveLength(3)
    expect(storage.getItem(ERP_STORAGE_KEY)).toBe(before)
  })
})
