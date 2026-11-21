export type CloudCatalogImportRow = {
  rowNumber: number
  productKey: string
  name: string
  sku: string
  barcode: string
  category: string
  manufacturer: string
  description: string
  unit: string
  purchasePrice: number
  sellingPrice: number
  minimumStock: number
  vatRate: number
  batch: string
  expiry: string | null
  stockQuantity: number
  lotPurchasePrice: number
  lotSellingPrice: number | null
}

export type CloudCatalogImportIssue = {
  rowNumber: number
  message: string
}

export type CloudCatalogImportPreview = {
  rows: CloudCatalogImportRow[]
  issues: CloudCatalogImportIssue[]
  duplicateRows: CloudCatalogImportIssue[]
  productCount: number
  stockRows: number
  totalStock: number
}

type ColumnKey =
  | "name" | "sku" | "barcode" | "category" | "manufacturer" | "description"
  | "unit" | "purchasePrice" | "sellingPrice" | "minimumStock" | "vatRate"
  | "batch" | "expiry" | "stockQuantity" | "lotPurchasePrice" | "lotSellingPrice"

const ALIASES: Record<ColumnKey, string[]> = {
  name: ["product name", "product", "item name", "item", "medicine", "name", "description of goods"],
  sku: ["sku", "item code", "product code", "stock code", "code"],
  barcode: ["barcode", "bar code", "ean", "upc"],
  category: ["category", "product category", "group"],
  manufacturer: ["manufacturer", "brand", "maker"],
  description: ["description", "product description", "details"],
  unit: ["unit", "uom", "unit of measure", "base unit"],
  purchasePrice: ["purchase price", "purchase cost", "cost price", "buy price"],
  sellingPrice: ["selling price", "sale price", "retail price", "sales price", "mrp"],
  minimumStock: ["minimum stock", "min stock", "reorder level", "reorder point"],
  vatRate: ["vat", "vat rate", "tax", "tax rate", "vat percent"],
  batch: ["batch", "batch number", "lot", "lot number", "batch no"],
  expiry: ["expiry", "expiry date", "expiration", "expiration date", "exp date"],
  stockQuantity: ["stock quantity", "quantity", "qty", "on hand", "on-hand", "opening stock", "opening quantity", "available quantity"],
  lotPurchasePrice: ["lot purchase price", "lot cost", "batch cost", "unit batch cost", "batch purchase price"],
  lotSellingPrice: ["lot selling price", "batch selling price", "lot sale price"],
}

function normalizeHeader(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase()
    .replace(/[\s_-]+/g, " ")
    .replace(/[^\p{L}\p{N} ]/gu, "")
}

function mappedColumns(header: unknown[]) {
  const normalized = header.map(normalizeHeader)
  const mapping = {} as Partial<Record<ColumnKey, number>>
  for (const [key, aliases] of Object.entries(ALIASES) as [ColumnKey, string[]][]) {
    const match = normalized.findIndex((value) => aliases.includes(value))
    if (match >= 0) mapping[key] = match
  }
  return mapping
}

function numberValue(value: unknown, label: string, rowNumber: number): number {
  const text = String(value ?? "").trim()
  if (!text) return 0
  const parsed = Number(text.replace(/AED|د\.إ|%/gi, "").replace(/,/g, "").trim())
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative number.`)
  }
  return parsed
}

function expiryValue(value: unknown): string | null {
  if (value === null || value === undefined || String(value).trim() === "") return null
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000)
    if (Number.isFinite(date.getTime())) return date.toISOString().slice(0, 10)
  }
  const text = String(value).trim()
  if (/^\d{4}-\d{2}$/.test(text)) return `${text}-01`
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const date = new Date(`${text}T00:00:00Z`)
    if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text) return text
  }
  const dmy = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (dmy) {
    const day = Number(dmy[1])
    const month = Number(dmy[2])
    const year = Number(dmy[3])
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return date.toISOString().slice(0, 10)
    }
  }
  const parsed = new Date(text)
  if (!Number.isFinite(parsed.getTime())) throw new Error("Expiry date is not valid.")
  return parsed.toISOString().slice(0, 10)
}

function keyFor(row: Omit<CloudCatalogImportRow, "rowNumber" | "productKey">) {
  if (row.barcode) return `barcode:${row.barcode.toLocaleLowerCase()}`
  if (row.sku) return `sku:${row.sku.toLocaleLowerCase()}`
  return `name:${row.name.toLocaleLowerCase()}|${row.category.toLocaleLowerCase()}`
}

export function previewCloudCatalogImport(sheetRows: unknown[][]): CloudCatalogImportPreview {
  const headerIndex = sheetRows.findIndex((row) =>
    mappedColumns(row).name !== undefined,
  )
  if (headerIndex < 0) {
    return {
      rows: [],
      issues: [{ rowNumber: 1, message: "Could not find a Product Name column." }],
      duplicateRows: [],
      productCount: 0,
      stockRows: 0,
      totalStock: 0,
    }
  }

  const mapping = mappedColumns(sheetRows[headerIndex] ?? [])
  const records: CloudCatalogImportRow[] = []
  const issues: CloudCatalogImportIssue[] = []
  const duplicateRows: CloudCatalogImportIssue[] = []
  const productProfiles = new Map<string, string>()
  const seenLots = new Set<string>()
  const value = (row: unknown[], key: ColumnKey) => {
    const index = mapping[key]
    return index === undefined ? "" : row[index]
  }

  sheetRows.slice(headerIndex + 1).forEach((row, index) => {
    const rowNumber = headerIndex + index + 2
    if (!row.some((cell) => String(cell ?? "").trim() !== "")) return
    try {
      const name = String(value(row, "name") ?? "").trim()
      if (!name) throw new Error("Product Name is required.")
      const sku = String(value(row, "sku") ?? "").trim()
      const barcode = String(value(row, "barcode") ?? "").trim()
      const category = String(value(row, "category") ?? "").trim()
      const manufacturer = String(value(row, "manufacturer") ?? "").trim()
      const description = String(value(row, "description") ?? "").trim()
      const unit = String(value(row, "unit") ?? "").trim() || "each"
      const purchasePrice = numberValue(value(row, "purchasePrice"), "Purchase price", rowNumber)
      const sellingPrice = numberValue(value(row, "sellingPrice"), "Selling price", rowNumber)
      const minimumStock = numberValue(value(row, "minimumStock"), "Minimum stock", rowNumber)
      const vatRate = numberValue(value(row, "vatRate"), "VAT rate", rowNumber)
      if (minimumStock > 0 && !Number.isInteger(minimumStock)) throw new Error("Minimum stock must be a whole number.")
      if (vatRate > 100) throw new Error("VAT rate cannot exceed 100%.")
      const batch = String(value(row, "batch") ?? "").trim()
      const expiry = expiryValue(value(row, "expiry"))
      const stockQuantity = numberValue(value(row, "stockQuantity"), "Opening stock quantity", rowNumber)
      const lotPurchasePrice = numberValue(value(row, "lotPurchasePrice"), "Lot purchase price", rowNumber) || purchasePrice
      const rawLotSellingPrice = String(value(row, "lotSellingPrice") ?? "").trim()
      const lotSellingPrice = rawLotSellingPrice
        ? numberValue(rawLotSellingPrice, "Lot selling price", rowNumber)
        : null

      const productFields = {
        name, sku, barcode, category, manufacturer, description, unit,
        purchasePrice, sellingPrice, minimumStock, vatRate,
      }
      const productKey = keyFor({
        ...productFields,
        batch, expiry, stockQuantity, lotPurchasePrice, lotSellingPrice,
      })
      const profile = JSON.stringify(productFields)
      const previousProfile = productProfiles.get(productKey)
      if (previousProfile && previousProfile !== profile) {
        throw new Error("Product details differ between rows with the same SKU, barcode or product name.")
      }
      const lotKey = `${productKey}|${batch.toLocaleLowerCase()}|${expiry ?? ""}|${lotPurchasePrice}`
      if (stockQuantity > 0 && seenLots.has(lotKey)) {
        duplicateRows.push({ rowNumber, message: "Duplicate product batch / expiry / cost row. This row is skipped." })
        return
      }
      if (stockQuantity > 0) seenLots.add(lotKey)
      productProfiles.set(productKey, profile)
      records.push({
        rowNumber,
        productKey,
        ...productFields,
        batch,
        expiry,
        stockQuantity,
        lotPurchasePrice,
        lotSellingPrice,
      })
    } catch (error) {
      issues.push({
        rowNumber,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  })

  return {
    rows: records,
    issues,
    duplicateRows,
    productCount: new Set(records.map((row) => row.productKey)).size,
    stockRows: records.filter((row) => row.stockQuantity > 0).length,
    totalStock: records.reduce((sum, row) => sum + row.stockQuantity, 0),
  }
}
