import packageJson from "../../package.json"
import {
  ERP_BACKUP_STORAGE_KEYS,
  ERP_OWNER_PROFILE_STORAGE_KEY,
  ERP_READ_NOTIFICATIONS_STORAGE_KEY,
  ERP_SETTINGS_STORAGE_KEY,
  ERP_STORAGE_KEY,
  ERP_SUPPLIERS_STORAGE_KEY,
} from "./erpStorageKeys"

export const ERP_BACKUP_FORMAT = "universal-erp-full-backup"
export const ERP_BACKUP_SCHEMA_VERSION = 2
export {
  ERP_BACKUP_STORAGE_KEYS,
  ERP_OWNER_PROFILE_STORAGE_KEY,
  ERP_READ_NOTIFICATIONS_STORAGE_KEY,
  ERP_SETTINGS_STORAGE_KEY,
  ERP_STORAGE_KEY,
  ERP_SUPPLIERS_STORAGE_KEY,
} from "./erpStorageKeys"

const ERP_BACKUP_STORAGE_KEY_SET = new Set<string>(ERP_BACKUP_STORAGE_KEYS)
const LEGACY_BACKUP_STORAGE_KEY_SET = new Set<string>([
  ERP_STORAGE_KEY,
  ERP_SETTINGS_STORAGE_KEY,
  ERP_SUPPLIERS_STORAGE_KEY,
  ERP_OWNER_PROFILE_STORAGE_KEY,
])

export interface StorageLike {
  readonly length: number
  key(index: number): string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type BackupCounts = {
  storageKeys: number
  products: number
  inventoryLots: number
  stockMovements: number
  customers: number
  sales: number
  invoices: number
  purchases: number
  suppliers: number
  settingsRecords: number
  ownerProfileRecords: number
  readNotificationRecords: number
  otherStorageKeys: number
}

export type ERPBackup = {
  format: typeof ERP_BACKUP_FORMAT
  schemaVersion: typeof ERP_BACKUP_SCHEMA_VERSION
  createdAt: string
  appVersion: string
  counts: BackupCounts
  entries: { key: string; value: string }[]
  legacyExcludedKeys?: string[]
}

export type RestorePreview = {
  currentKeyCount: number
  backupKeyCount: number
  overwrittenKeys: string[]
  removedKeys: string[]
  addedKeys: string[]
}

export type MigrationIssue = {
  record: string
  field: string
  reference: string
  message: string
}

export type MigrationInventoryReport = {
  generatedAt: string
  counts: BackupCounts
  ids: {
    products: string[]
    inventoryLots: string[]
    stockMovements: string[]
    customers: string[]
    sales: string[]
    invoices: string[]
    purchases: string[]
    suppliers: string[]
  }
  invoiceNumbers: string[]
  missingRelationships: MigrationIssue[]
  dataWarnings: string[]
  otherStorageKeys: string[]
  limitations: string[]
}

const APP_VERSION = packageJson.version

function readEntries(storage: StorageLike): { key: string; value: string }[] {
  const entries: { key: string; value: string }[] = []

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key === null) continue
    const value = storage.getItem(key)
    if (value !== null) entries.push({ key, value })
  }

  return entries.sort((left, right) => left.key.localeCompare(right.key))
}

function readERPEntries(storage: StorageLike) {
  return readEntries(storage).filter((entry) =>
    ERP_BACKUP_STORAGE_KEY_SET.has(entry.key),
  )
}

function selectERPEntries(entries: { key: string; value: string }[]) {
  return entries.filter((entry) => ERP_BACKUP_STORAGE_KEY_SET.has(entry.key))
}

function parseEntry(entry: { key: string; value: string }): unknown {
  try {
    return JSON.parse(entry.value)
  } catch {
    return undefined
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function entryFor(
  entries: { key: string; value: string }[],
  key: string,
) {
  return entries.find((entry) => entry.key === key)
}

function arrayCount(value: unknown, key: string) {
  const record = asRecord(value)
  return record ? asArray(record[key]).length : 0
}

function objectRecordCount(value: unknown) {
  return asRecord(value) ? 1 : 0
}

function calculateCounts(
  entries: { key: string; value: string }[],
): BackupCounts {
  const erpEntries = selectERPEntries(entries)
  const mainStore = parseEntry(
    entryFor(erpEntries, ERP_STORAGE_KEY) ?? { key: ERP_STORAGE_KEY, value: "" },
  )
  const suppliers = parseEntry(
    entryFor(erpEntries, ERP_SUPPLIERS_STORAGE_KEY) ?? {
      key: ERP_SUPPLIERS_STORAGE_KEY,
      value: "",
    },
  )
  const settings = parseEntry(
    entryFor(erpEntries, ERP_SETTINGS_STORAGE_KEY) ?? {
      key: ERP_SETTINGS_STORAGE_KEY,
      value: "",
    },
  )
  const ownerProfile = parseEntry(
    entryFor(erpEntries, ERP_OWNER_PROFILE_STORAGE_KEY) ?? {
      key: ERP_OWNER_PROFILE_STORAGE_KEY,
      value: "",
    },
  )
  const readNotifications = parseEntry(
    entryFor(erpEntries, ERP_READ_NOTIFICATIONS_STORAGE_KEY) ?? {
      key: ERP_READ_NOTIFICATIONS_STORAGE_KEY,
      value: "",
    },
  )
  return {
    storageKeys: erpEntries.length,
    products: arrayCount(mainStore, "products"),
    inventoryLots: arrayCount(mainStore, "inventoryLots"),
    stockMovements: arrayCount(mainStore, "inventoryMovements"),
    customers: arrayCount(mainStore, "customers"),
    sales: arrayCount(mainStore, "sales"),
    invoices: arrayCount(mainStore, "sales"),
    purchases: arrayCount(mainStore, "purchases"),
    suppliers: Array.isArray(suppliers) ? suppliers.length : 0,
    settingsRecords: objectRecordCount(settings),
    ownerProfileRecords: objectRecordCount(ownerProfile),
    readNotificationRecords: Array.isArray(readNotifications)
      ? readNotifications.length
      : 0,
    otherStorageKeys: 0,
  }
}

function calculateLegacyCounts(
  entries: { key: string; value: string }[],
): Omit<BackupCounts, "readNotificationRecords"> {
  const counts = calculateCounts(entries)
  return {
    storageKeys: entries.length,
    products: counts.products,
    inventoryLots: counts.inventoryLots,
    stockMovements: counts.stockMovements,
    customers: counts.customers,
    sales: counts.sales,
    invoices: counts.invoices,
    purchases: counts.purchases,
    suppliers: counts.suppliers,
    settingsRecords: counts.settingsRecords,
    ownerProfileRecords: counts.ownerProfileRecords,
    otherStorageKeys: entries.filter((entry) =>
      !LEGACY_BACKUP_STORAGE_KEY_SET.has(entry.key),
    ).length,
  }
}

function validateProvidedCounts(
  providedCounts: Record<string, unknown> | null,
  expectedCounts: Record<string, number>,
) {
  if (
    !providedCounts ||
    Object.entries(expectedCounts).some(
      ([key, count]) => providedCounts[key] !== count,
    )
  ) {
    throw new Error("The backup record counts do not match its stored data.")
  }
}

export function createERPBackup(
  storage: StorageLike,
  createdAt = new Date(),
  appVersion = APP_VERSION,
): ERPBackup {
  const entries = readERPEntries(storage)
  return {
    format: ERP_BACKUP_FORMAT,
    schemaVersion: ERP_BACKUP_SCHEMA_VERSION,
    createdAt: createdAt.toISOString(),
    appVersion,
    counts: calculateCounts(entries),
    entries,
  }
}

export function validateERPBackup(value: unknown): ERPBackup {
  const backup = asRecord(value)
  if (
    !backup ||
    backup.format !== ERP_BACKUP_FORMAT ||
    (backup.schemaVersion !== 1 &&
      backup.schemaVersion !== ERP_BACKUP_SCHEMA_VERSION)
  ) {
    throw new Error("This file is not a supported UniversalERP backup.")
  }
  if (
    typeof backup.createdAt !== "string" ||
    !Number.isFinite(Date.parse(backup.createdAt)) ||
    typeof backup.appVersion !== "string" ||
    !backup.appVersion.trim()
  ) {
    throw new Error("The backup metadata is missing or invalid.")
  }
  if (!Array.isArray(backup.entries)) {
    throw new Error("The backup does not contain a storage snapshot.")
  }

  const seenKeys = new Set<string>()
  const entries = backup.entries.map((entry) => {
    const record = asRecord(entry)
    if (
      !record ||
      typeof record.key !== "string" ||
      !record.key ||
      typeof record.value !== "string"
    ) {
      throw new Error("The backup contains an invalid storage entry.")
    }
    if (seenKeys.has(record.key)) {
      throw new Error(`The backup contains duplicate storage key "${record.key}".`)
    }
    seenKeys.add(record.key)
    return { key: record.key, value: record.value }
  })

  const providedCounts = asRecord(backup.counts)
  if (backup.schemaVersion === 1) {
    validateProvidedCounts(providedCounts, calculateLegacyCounts(entries))
  } else {
    const unexpectedKey = entries.find(
      (entry) => !ERP_BACKUP_STORAGE_KEY_SET.has(entry.key),
    )
    if (unexpectedKey) {
      throw new Error(
        `This backup contains non-ERP storage key "${unexpectedKey.key}" and cannot be restored.`,
      )
    }
    validateProvidedCounts(providedCounts, calculateCounts(entries))
  }

  const legacyExcludedKeys =
    backup.schemaVersion === 1
      ? entries
          .filter((entry) => !ERP_BACKUP_STORAGE_KEY_SET.has(entry.key))
          .map((entry) => entry.key)
      : []
  const erpEntries = selectERPEntries(entries)
  return {
    format: ERP_BACKUP_FORMAT,
    schemaVersion: ERP_BACKUP_SCHEMA_VERSION,
    createdAt: backup.createdAt,
    appVersion: backup.appVersion,
    counts: calculateCounts(erpEntries),
    entries: erpEntries,
    ...(legacyExcludedKeys.length ? { legacyExcludedKeys } : {}),
  }
}

export function parseERPBackup(contents: string): ERPBackup {
  let parsed: unknown
  try {
    parsed = JSON.parse(contents)
  } catch {
    throw new Error("The selected file is not valid JSON.")
  }
  return validateERPBackup(parsed)
}

export function getBackupDataWarnings(backup: ERPBackup): string[] {
  const warnings: string[] = []

  if (backup.legacyExcludedKeys?.length) {
    warnings.push(
      `This legacy backup contains non-ERP browser keys that were not imported: ${backup.legacyExcludedKeys.join(", ")}. Keep the original backup if you need those values; any corresponding values in this browser remain unchanged.`,
    )
  }

  for (const entry of backup.entries) {
    const containsJsonData =
      entry.key.startsWith("universal-erp-") &&
      entry.key !== "universal-erp-theme"
    if (!containsJsonData) continue
    try {
      JSON.parse(entry.value)
    } catch {
      warnings.push(`Storage key "${entry.key}" contains a value that is not valid JSON.`)
    }
  }

  const mainStoreEntry = entryFor(backup.entries, ERP_STORAGE_KEY)
  if (mainStoreEntry) {
    let parsed: unknown
    try {
      parsed = JSON.parse(mainStoreEntry.value)
    } catch {
      parsed = undefined
    }
    const mainStore = asRecord(parsed)
    const requiredArrays = [
      "products",
      "inventoryLots",
      "inventoryMovements",
      "customers",
      "sales",
      "purchases",
    ]
    for (const field of requiredArrays) {
      if (!mainStore || !Array.isArray(mainStore[field])) {
        warnings.push(`Main ERP store is missing a valid "${field}" array.`)
      }
    }
  }

  const expectedShapes = [
    { key: ERP_SUPPLIERS_STORAGE_KEY, label: "Supplier data", type: "array" },
    { key: ERP_SETTINGS_STORAGE_KEY, label: "ERP settings", type: "object" },
    { key: ERP_OWNER_PROFILE_STORAGE_KEY, label: "Owner profile", type: "object" },
  ] as const
  for (const expected of expectedShapes) {
    const entry = entryFor(backup.entries, expected.key)
    if (!entry) continue
    let value: unknown
    try {
      value = JSON.parse(entry.value)
    } catch {
      continue
    }
    if (
      (expected.type === "array" && !Array.isArray(value)) ||
      (expected.type === "object" && !asRecord(value))
    ) {
      warnings.push(`${expected.label} is not stored in the expected ${expected.type} format.`)
    }
  }

  return warnings
}

export function previewERPBackupRestore(
  storage: StorageLike,
  unvalidatedBackup: ERPBackup,
): RestorePreview {
  const backup = validateERPBackup(unvalidatedBackup)
  const currentEntries = readERPEntries(storage)
  const currentKeys = new Set(currentEntries.map((entry) => entry.key))
  const backupKeys = new Set(backup.entries.map((entry) => entry.key))

  return {
    currentKeyCount: currentEntries.length,
    backupKeyCount: backup.entries.length,
    overwrittenKeys: backup.entries
      .filter((entry) => currentKeys.has(entry.key))
      .map((entry) => entry.key),
    removedKeys: currentEntries
      .filter((entry) => !backupKeys.has(entry.key))
      .map((entry) => entry.key),
    addedKeys: backup.entries
      .filter((entry) => !currentKeys.has(entry.key))
      .map((entry) => entry.key),
  }
}

export function restoreERPBackup(
  storage: StorageLike,
  unvalidatedBackup: ERPBackup,
  explicitlyConfirmed: boolean,
) {
  if (!explicitlyConfirmed) {
    throw new Error("Confirm the full storage replacement before restoring.")
  }
  const backup = validateERPBackup(unvalidatedBackup)
  const previousEntries = readERPEntries(storage)

  try {
    for (const key of ERP_BACKUP_STORAGE_KEYS) storage.removeItem(key)
    for (const entry of backup.entries) storage.setItem(entry.key, entry.value)
  } catch (error) {
    const rollbackErrors: string[] = []
    try {
      for (const key of ERP_BACKUP_STORAGE_KEYS) storage.removeItem(key)
      for (const entry of previousEntries) storage.setItem(entry.key, entry.value)
    } catch (rollbackError) {
      rollbackErrors.push(
        rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
      )
    }

    const cause = error instanceof Error ? error.message : String(error)
    if (rollbackErrors.length) {
      throw new Error(
        `Restore failed (${cause}) and automatic rollback also failed (${rollbackErrors.join("; ")}). Keep this page open and recover from your downloaded backup.`,
      )
    }
    throw new Error(`Restore failed; the previous browser data was rolled back. ${cause}`)
  }

  return previewERPBackupRestore(storage, backup)
}

function storageJson(
  entries: { key: string; value: string }[],
  key: string,
  warnings: string[],
): unknown {
  const entry = entryFor(entries, key)
  if (!entry) return undefined
  try {
    return JSON.parse(entry.value)
  } catch {
    warnings.push(`Storage key "${key}" is not valid JSON.`)
    return undefined
  }
}

function recordList(value: unknown, label: string, warnings: string[]) {
  if (value === undefined) {
    warnings.push(`${label} is missing.`)
    return []
  }
  if (!Array.isArray(value)) {
    warnings.push(`${label} is not stored as an array.`)
    return []
  }
  const records: Record<string, unknown>[] = []
  value.forEach((item, index) => {
    const record = asRecord(item)
    if (record) {
      records.push(record)
    } else {
      warnings.push(`${label} row ${index + 1} is not a record.`)
    }
  })
  return records
}

function recordId(record: Record<string, unknown>, label: string, warnings: string[]) {
  if (typeof record.id === "string" && record.id) return record.id
  warnings.push(`${label} has no string ID.`)
  return ""
}

function reportDuplicateIds(
  records: Record<string, unknown>[],
  label: string,
  warnings: string[],
) {
  const seen = new Set<string>()
  for (const record of records) {
    if (typeof record.id !== "string" || !record.id) continue
    if (seen.has(record.id)) warnings.push(`${label} contains duplicate ID "${record.id}".`)
    seen.add(record.id)
  }
}

export function createMigrationInventoryReport(
  storage: StorageLike,
  generatedAt = new Date(),
): MigrationInventoryReport {
  const entries = readEntries(storage)
  const erpEntries = selectERPEntries(entries)
  const dataWarnings: string[] = []
  const mainStore = asRecord(storageJson(erpEntries, ERP_STORAGE_KEY, dataWarnings))
  const products = recordList(mainStore?.products, "Products", dataWarnings)
  const lots = recordList(mainStore?.inventoryLots, "Inventory lots", dataWarnings)
  const movements = recordList(mainStore?.inventoryMovements, "Stock movements", dataWarnings)
  const customers = recordList(mainStore?.customers, "Customers", dataWarnings)
  const sales = recordList(mainStore?.sales, "Sales", dataWarnings)
  const purchases = recordList(mainStore?.purchases, "Purchases", dataWarnings)
  const suppliers = recordList(
    storageJson(erpEntries, ERP_SUPPLIERS_STORAGE_KEY, dataWarnings),
    "Suppliers",
    dataWarnings,
  )
  if (entryFor(erpEntries, ERP_SETTINGS_STORAGE_KEY)) {
    storageJson(erpEntries, ERP_SETTINGS_STORAGE_KEY, dataWarnings)
  }
  if (entryFor(erpEntries, ERP_OWNER_PROFILE_STORAGE_KEY)) {
    storageJson(erpEntries, ERP_OWNER_PROFILE_STORAGE_KEY, dataWarnings)
  }
  const ids = {
    products: products.map((record) => recordId(record, "Product", dataWarnings)).filter(Boolean),
    inventoryLots: lots.map((record) => recordId(record, "Inventory lot", dataWarnings)).filter(Boolean),
    stockMovements: movements.map((record) => recordId(record, "Stock movement", dataWarnings)).filter(Boolean),
    customers: customers.map((record) => recordId(record, "Customer", dataWarnings)).filter(Boolean),
    sales: sales.map((record) => recordId(record, "Sale", dataWarnings)).filter(Boolean),
    invoices: sales.map((record) => recordId(record, "Invoice sale", dataWarnings)).filter(Boolean),
    purchases: purchases.map((record) => recordId(record, "Purchase", dataWarnings)).filter(Boolean),
    suppliers: suppliers.map((record) => recordId(record, "Supplier", dataWarnings)).filter(Boolean),
  }

  reportDuplicateIds(products, "Products", dataWarnings)
  reportDuplicateIds(lots, "Inventory lots", dataWarnings)
  reportDuplicateIds(movements, "Stock movements", dataWarnings)
  reportDuplicateIds(customers, "Customers", dataWarnings)
  reportDuplicateIds(sales, "Sales", dataWarnings)
  reportDuplicateIds(purchases, "Purchases", dataWarnings)
  reportDuplicateIds(suppliers, "Suppliers", dataWarnings)

  const productIds = new Set(ids.products)
  const lotIds = new Set(ids.inventoryLots)
  const customerIds = new Set(ids.customers)
  const missingRelationships: MigrationIssue[] = []
  const addIssue = (record: string, field: string, reference: unknown, message: string) => {
    missingRelationships.push({
      record,
      field,
      reference: reference == null ? "" : String(reference),
      message,
    })
  }

  lots.forEach((lot, index) => {
    if (!productIds.has(String(lot.productId ?? ""))) {
      addIssue(`Inventory lot ${ids.inventoryLots[index] || index + 1}`, "productId", lot.productId, "No matching product exists.")
    }
  })

  movements.forEach((movement, index) => {
    const label = `Stock movement ${ids.stockMovements[index] || index + 1}`
    if (!productIds.has(String(movement.productId ?? ""))) {
      addIssue(label, "productId", movement.productId, "No matching product exists.")
    }
    if (movement.lotId != null && movement.lotId !== "" && !lotIds.has(String(movement.lotId))) {
      addIssue(label, "lotId", movement.lotId, "No matching inventory lot exists.")
    }
  })

  sales.forEach((sale, saleIndex) => {
    const saleLabel = `Sale ${ids.sales[saleIndex] || saleIndex + 1}`
    if (sale.customerId != null && sale.customerId !== "" && !customerIds.has(String(sale.customerId))) {
      addIssue(saleLabel, "customerId", sale.customerId, "No matching customer exists.")
    }
    recordList(sale.items, `${saleLabel} items`, dataWarnings).forEach((item, itemIndex) => {
      const lineLabel = `${saleLabel} line ${itemIndex + 1}`
      if (!productIds.has(String(item.productId ?? ""))) {
        addIssue(lineLabel, "productId", item.productId, "No matching product exists.")
      }
      recordList(item.batchAllocations, `${lineLabel} batch allocations`, dataWarnings)
        .forEach((allocation, allocationIndex) => {
          if (!lotIds.has(String(allocation.lotId ?? ""))) {
            addIssue(
              `${lineLabel} allocation ${allocationIndex + 1}`,
              "lotId",
              allocation.lotId,
              "No matching inventory lot exists.",
            )
          }
        })
    })
  })

  purchases.forEach((purchase, purchaseIndex) => {
    const purchaseLabel = `Purchase ${ids.purchases[purchaseIndex] || purchaseIndex + 1}`
    const supplierName =
      typeof purchase.supplierName === "string" ? purchase.supplierName.trim() : ""
    if (
      supplierName &&
      !suppliers.some((supplier) =>
        typeof supplier.name === "string" &&
        supplier.name.trim().toLowerCase() === supplierName.toLowerCase(),
      )
    ) {
      addIssue(
        purchaseLabel,
        "supplierName",
        supplierName,
        "No supplier with this name exists; purchases do not store supplier IDs.",
      )
    }
    recordList(purchase.items, `${purchaseLabel} items`, dataWarnings)
      .forEach((item, itemIndex) => {
        if (!productIds.has(String(item.productId ?? ""))) {
          addIssue(
            `${purchaseLabel} line ${itemIndex + 1}`,
            "productId",
            item.productId,
            "No matching product exists.",
          )
        }
      })
  })

  const invoiceNumbers = sales
    .map((sale) => (typeof sale.invoiceNumber === "string" ? sale.invoiceNumber : ""))
    .filter(Boolean)
  const seenInvoiceNumbers = new Set<string>()
  for (const invoiceNumber of invoiceNumbers) {
    if (seenInvoiceNumbers.has(invoiceNumber)) {
      dataWarnings.push(`Sales contain duplicate invoice number "${invoiceNumber}".`)
    }
    seenInvoiceNumbers.add(invoiceNumber)
  }
  return {
    generatedAt: generatedAt.toISOString(),
    counts: {
      ...calculateCounts(erpEntries),
      otherStorageKeys: entries.length - erpEntries.length,
    },
    ids,
    invoiceNumbers,
    missingRelationships,
    dataWarnings,
    otherStorageKeys: entries
      .filter((entry) => !ERP_BACKUP_STORAGE_KEY_SET.has(entry.key))
      .map((entry) => entry.key),
    limitations: [
      "The current data has no historical staff attribution for transactions.",
      "The current sale model does not record payment splits, tendered cash, or change.",
      "A Refunded sale status does not contain return-line or refund-payment history.",
      "Some stock changes have no corresponding movement record; missing history cannot be reconstructed from current data.",
      "Purchases store supplier names rather than supplier IDs, so historical supplier relationships cannot be verified.",
    ],
  }
}

export function downloadJsonFile(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json;charset=utf-8",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
