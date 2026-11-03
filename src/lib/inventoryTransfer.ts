import type { InventoryLot, Product } from "../context/ERPContext"
import { parseExpiryDate } from "./expiry"

export const INVENTORY_COLUMNS = [
  { key: "serial", label: "SL (Serial Number — ignored)", aliases: ["sl", "serial", "serial number"] },
  { key: "productId", label: "Product ID", aliases: ["product id", "productid", "erp product id"] },
  { key: "lotId", label: "Inventory Lot ID", aliases: ["inventory lot id", "lot id", "lotid"] },
  { key: "name", label: "Product Name", aliases: ["product", "product name", "name", "medicine", "description", "item name"] },
  { key: "barcode", label: "Barcode", aliases: ["barcode", "bar code", "ean", "upc"] },
  { key: "sku", label: "SKU", aliases: ["sku", "item code", "product code", "stock code"] },
  { key: "category", label: "Category", aliases: ["category", "product category"] },
  { key: "manufacturer", label: "Manufacturer", aliases: ["manufacturer", "brand"] },
  { key: "unit", label: "Unit", aliases: ["unit", "uom", "unit of measure"] },
  { key: "purchasePrice", label: "Product Purchase Price", aliases: ["product purchase price", "purchase price", "cost price"] },
  { key: "sellingPrice", label: "Product Selling Price", aliases: ["product selling price", "selling price", "sale price", "retail price"] },
  { key: "minimumStock", label: "Minimum Stock", aliases: ["minimum stock", "min stock", "reorder level"] },
  { key: "vatRate", label: "VAT Rate", aliases: ["vat", "vat rate", "tax", "tax rate"] },
  { key: "batch", label: "Batch", aliases: ["batch", "batch number", "lot", "lot number"] },
  { key: "expiry", label: "Inventory Lot Expiry", aliases: ["inventory lot expiry", "expiry", "expiry date", "expiration", "expiration date", "exp date"] },
  { key: "quantity", label: "Inventory Lot Quantity", aliases: ["inventory lot quantity", "quantity", "qty", "stock", "stock quantity", "on hand", "on-hand"] },
  { key: "lotPurchasePrice", label: "Lot Purchase Cost per Unit", aliases: ["lot purchase cost per unit", "lot purchase price", "batch purchase price", "lot cost", "cost"] },
  { key: "lotSellingPrice", label: "Lot Selling Price per Unit", aliases: ["lot selling price per unit", "lot selling price", "selling price per unit", "s price"] },
  { key: "lotTotalPurchaseValue", label: "TOTAL (Purchase Value)", aliases: ["total purchase value", "total (purchase value)", "lot total purchase value"] },
  { key: "lotTotalSellingValue", label: "TOTAL (Selling Value)", aliases: ["total selling value", "total (selling value)", "lot total selling value"] },
] as const

export type InventoryColumnKey = (typeof INVENTORY_COLUMNS)[number]["key"]
export type InventoryColumnMapping = Partial<Record<InventoryColumnKey, number | null>>
export type InventoryProductFields = Partial<Omit<Product, "id">>

export type InventoryImportRecord = {
  rowNumber: number
  productKey: string
  sourceProductId: string
  sourceLotId: string
  product: InventoryProductFields
  batch: string
  expiry: string
  quantity: number
  lotPurchasePrice?: number
  lotSellingPrice?: number
  lotTotalPurchaseValue?: number
  lotTotalSellingValue?: number
  forceNewLot?: boolean
}

export type DetectedInventoryHeader = {
  rowIndex: number
  mapping: InventoryColumnMapping
  meaningfulColumnCount: number
  isZakiStockSummary: boolean
}

export type InventoryImportIssue = {
  rowNumber: number
  message: string
}

export type InventoryImportPreview = {
  records: InventoryImportRecord[]
  invalidRows: InventoryImportIssue[]
  duplicateRows: InventoryImportIssue[]
}

export type InventoryImportMode = "merge" | "replace"

export type InventoryImportResult = {
  products: Product[]
  inventoryLots: InventoryLot[]
  createdProducts: number
  updatedProducts: number
  createdLots: number
  updatedLots: number
  totalImportedQuantity: number
}

export const INVENTORY_EXPORT_HEADERS = [
  "Product ID",
  "Inventory Lot ID",
  "Product Name",
  "Barcode",
  "SKU",
  "Category",
  "Manufacturer",
  "Unit",
  "Product Purchase Price",
  "Selling Price",
  "Minimum Stock",
  "VAT Rate",
  "Batch",
  "Expiry Date",
  "Stock Quantity",
  "Lot Purchase Price",
  "Lot Selling Price",
  "TOTAL (Purchase Value)",
  "TOTAL (Selling Value)",
]

function normalizedText(value: unknown) {
  return String(value ?? "").trim()
}

function normalizeHeader(value: unknown) {
  return normalizedText(value)
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .replace(/[^\p{L}\p{N} ]/gu, "")
}

export function detectInventoryColumnMapping(headers: unknown[]): InventoryColumnMapping {
  const mapping: InventoryColumnMapping = {}
  const normalizedHeaders = headers.map(normalizeHeader)

  for (const column of INVENTORY_COLUMNS) {
    const aliases = column.aliases.map(normalizeHeader)
    const matchIndex = normalizedHeaders.findIndex((header) => aliases.includes(header))
    mapping[column.key] = matchIndex < 0 ? null : matchIndex
  }

  const totalIndexes = normalizedHeaders.flatMap((header, index) =>
    header === "total" ? [index] : [],
  )
  const costIndex = normalizedHeaders.findIndex((header) => header === "cost")
  const sellingPriceIndex = normalizedHeaders.findIndex((header) => header === "s price")
  if (totalIndexes.length >= 2 && costIndex >= 0 && sellingPriceIndex >= 0) {
    const purchaseTotalIndex = totalIndexes.find((index) => index > costIndex && index < sellingPriceIndex)
      ?? totalIndexes[0]
    const sellingTotalIndex = totalIndexes.find((index) => index > sellingPriceIndex)
      ?? totalIndexes.find((index) => index !== purchaseTotalIndex)
    if (purchaseTotalIndex !== undefined) mapping.lotTotalPurchaseValue = purchaseTotalIndex
    if (sellingTotalIndex !== undefined) mapping.lotTotalSellingValue = sellingTotalIndex
  } else {
    const purchaseTotalIndex = normalizedHeaders.findIndex((header) =>
      ["total purchase value", "total purchase", "purchase total"].includes(header),
    )
    const sellingTotalIndex = normalizedHeaders.findIndex((header) =>
      ["total selling value", "total selling", "selling total"].includes(header),
    )
    if (purchaseTotalIndex >= 0) mapping.lotTotalPurchaseValue = purchaseTotalIndex
    if (sellingTotalIndex >= 0) mapping.lotTotalSellingValue = sellingTotalIndex
  }

  return mapping
}

export function detectInventoryHeaderRow(rows: unknown[][]): DetectedInventoryHeader | null {
  let best: DetectedInventoryHeader | null = null

  rows.forEach((row, rowIndex) => {
    const mapping = detectInventoryColumnMapping(row)
    const detected = Object.values(mapping).filter((index) => index != null).length
    const hasProduct = mapping.name != null
    const hasQuantity = mapping.quantity != null
    if (!hasProduct || !hasQuantity) return

    const normalized = row.map(normalizeHeader)
    const hasSerial = mapping.serial != null || normalized.includes("sl")
    const hasExpiry = mapping.expiry != null
    const hasCost = mapping.lotPurchasePrice != null
    const isZakiStockSummary =
      hasSerial &&
      hasExpiry &&
      hasCost &&
      mapping.lotSellingPrice != null &&
      mapping.lotTotalPurchaseValue != null &&
      mapping.lotTotalSellingValue != null

    const candidate: DetectedInventoryHeader = {
      rowIndex,
      mapping,
      meaningfulColumnCount: detected,
      isZakiStockSummary,
    }

    if (
      !best ||
      Number(candidate.isZakiStockSummary) > Number(best.isZakiStockSummary) ||
      (candidate.isZakiStockSummary === best.isZakiStockSummary &&
        candidate.meaningfulColumnCount > best.meaningfulColumnCount)
    ) {
      best = candidate
    }

  })

  return best
}

function parseNumber(value: unknown, label: string) {
  const text = normalizedText(value)
  if (!text) return undefined

  const normalized = text
    .replace(/AED|د\.?إ|%/gi, "")
    .replace(/,/g, "")
    .trim()
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative number.`)
  }
  return parsed
}

function expiryText(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === "number") {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000)
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10)
  }
  return normalizedText(value)
}

function productKey(product: InventoryProductFields, sourceProductId: string) {
  if (product.barcode?.trim()) return `barcode:${product.barcode.trim().toLowerCase()}`
  if (product.sku?.trim()) return `sku:${product.sku.trim().toLowerCase()}`
  if (sourceProductId) return `id:${sourceProductId.toLowerCase()}`
  return `name:${(product.name ?? "").trim().toLowerCase()}|${(product.category ?? "").trim().toLowerCase()}`
}

export function previewInventoryImport(
  dataRows: unknown[][],
  mapping: InventoryColumnMapping,
  firstDataRowNumber = 2,
  forceNewLot = false,
): InventoryImportPreview {
  const records: InventoryImportRecord[] = []
  const invalidRows: InventoryImportIssue[] = []
  const duplicateRows: InventoryImportIssue[] = []
  const seenLots = new Set<string>()
  const productProfiles = new Map<string, string>()

  const mappedValue = (row: unknown[], key: InventoryColumnKey) => {
    const columnIndex = mapping[key]
    return columnIndex == null ? "" : row[columnIndex]
  }

  dataRows.forEach((row, rowIndex) => {
    const rowNumber = firstDataRowNumber + rowIndex
    if (row.every((value) => normalizedText(value) === "")) return

    try {
      const product: InventoryProductFields = {}
      const sourceProductId = forceNewLot
        ? ""
        : normalizedText(mappedValue(row, "productId"))
      const sourceLotId = normalizedText(mappedValue(row, "lotId"))

      for (const key of ["name", "barcode", "sku", "category", "manufacturer", "unit"] as const) {
        const value = normalizedText(mappedValue(row, key))
        if (value) product[key] = value
      }

      if (
        forceNewLot &&
        !product.name &&
        normalizedText(mappedValue(row, "quantity")) === ""
      ) {
        return
      }

      if (!product.name) {
        throw new Error("Product Name is required.")
      }

      const quantity = parseNumber(mappedValue(row, "quantity"), "Inventory Lot Quantity")
      if (quantity === undefined) {
        throw new Error("Inventory Lot Quantity is required.")
      }

      for (const key of ["purchasePrice", "sellingPrice", "minimumStock", "vatRate"] as const) {
        const label = INVENTORY_COLUMNS.find((column) => column.key === key)?.label ?? key
        const parsed = parseNumber(mappedValue(row, key), label)
        if (parsed !== undefined) {
          if (key === "minimumStock" && !Number.isInteger(parsed)) {
            throw new Error(`${label} must be a whole number.`)
          }
          product[key] = parsed
        }
      }

      const lotPurchasePrice = parseNumber(
        mappedValue(row, "lotPurchasePrice"),
        "Lot Purchase Price",
      )
      const lotSellingPrice = parseNumber(
        mappedValue(row, "lotSellingPrice"),
        "Lot Selling Price per Unit",
      ) ?? product.sellingPrice
      const lotTotalPurchaseValue = parseNumber(
        mappedValue(row, "lotTotalPurchaseValue"),
        "TOTAL (Purchase Value)",
      )
      const lotTotalSellingValue = parseNumber(
        mappedValue(row, "lotTotalSellingValue"),
        "TOTAL (Selling Value)",
      )
      const batch = normalizedText(mappedValue(row, "batch"))
      const expiry = expiryText(mappedValue(row, "expiry"))
      if (expiry && !parseExpiryDate(expiry)) {
        throw new Error("Expiry Date is not a recognizable date.")
      }

      const key = productKey(product, sourceProductId)
      const profile = JSON.stringify(product)
      const previousProfile = productProfiles.get(key)
      if (previousProfile && previousProfile !== profile) {
        throw new Error("Product details conflict with another row for the same product.")
      }

      const importedLotPrice = lotPurchasePrice ?? product.purchasePrice
      const lotIdentity = forceNewLot
        ? `source-row:${rowNumber}`
        : sourceLotId
          ? `id:${sourceLotId.toLowerCase()}`
          : `${batch.trim().toLowerCase()}|${expiry.trim().toLowerCase()}|${importedLotPrice ?? ""}`
      const duplicateKey = `${key}|${lotIdentity}`
      if (seenLots.has(duplicateKey)) {
        duplicateRows.push({
          rowNumber,
          message: "Duplicate product and batch/expiry row; this repeated row will be skipped.",
        })
        return
      }

      seenLots.add(duplicateKey)
      productProfiles.set(key, profile)
      records.push({
        rowNumber,
        productKey: key,
        sourceProductId,
        sourceLotId,
        product,
        batch,
        expiry,
        quantity,
        ...(lotPurchasePrice === undefined ? {} : { lotPurchasePrice }),
        ...(lotSellingPrice === undefined ? {} : { lotSellingPrice }),
        ...(lotTotalPurchaseValue === undefined ? {} : { lotTotalPurchaseValue }),
        ...(lotTotalSellingValue === undefined ? {} : { lotTotalSellingValue }),
        ...(forceNewLot ? { forceNewLot: true } : {}),
      })
    } catch (error) {
      invalidRows.push({
        rowNumber,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  })

  return { records, invalidRows, duplicateRows }
}

function uniqueId(prefix: string, usedIds: Set<string>) {
  let suffix = 1
  let candidate = `${prefix}-${Date.now()}`
  while (usedIds.has(candidate)) {
    suffix += 1
    candidate = `${prefix}-${Date.now()}-${suffix}`
  }
  usedIds.add(candidate)
  return candidate
}

function findUniqueProduct(
  products: Product[],
  matches: (product: Product) => boolean,
  identity: string,
) {
  const found = products.filter(matches)
  if (found.length > 1) {
    throw new Error(`Import identity "${identity}" matches multiple existing products. Resolve the duplicate products before importing.`)
  }
  return found[0]
}

export function applyInventoryImport(
  existingProducts: Product[],
  existingLots: InventoryLot[],
  records: InventoryImportRecord[],
  mode: InventoryImportMode,
): InventoryImportResult {
  const products = existingProducts.map((product) => ({ ...product }))
  const lots = existingLots.map((lot) => ({
    ...lot,
    quantity: mode === "replace" ? 0 : lot.quantity,
  }))
  const usedProductIds = new Set(products.map((product) => product.id))
  const usedLotIds = new Set(lots.map((lot) => lot.id))
  const importedProducts = new Map<string, Product>()
  let createdProducts = 0
  let updatedProducts = 0
  let createdLots = 0
  let updatedLots = 0
  let totalImportedQuantity = 0

  for (const record of records) {
    let product = importedProducts.get(record.productKey)

    if (!product) {
      const fields = record.product
      const identity = fields.barcode || fields.sku || record.sourceProductId || fields.name || record.productKey
      const byBarcode = fields.barcode
        ? findUniqueProduct(products, (item) => item.barcode.trim().toLowerCase() === fields.barcode?.trim().toLowerCase(), identity)
        : undefined
      const bySku = fields.sku
        ? findUniqueProduct(products, (item) => item.sku.trim().toLowerCase() === fields.sku?.trim().toLowerCase(), identity)
        : undefined
      if (byBarcode && bySku && byBarcode.id !== bySku.id) {
        throw new Error(`Import identity "${identity}" matches different existing products by barcode and SKU.`)
      }
      product =
        byBarcode ??
        bySku ??
        (record.sourceProductId
          ? products.find((item) => item.id === record.sourceProductId)
          : undefined) ??
        findUniqueProduct(
          products,
          (item) =>
            item.name.trim().toLowerCase() === (fields.name ?? "").trim().toLowerCase() &&
            (!fields.category || item.category.trim().toLowerCase() === fields.category.trim().toLowerCase()),
          identity,
        )

      if (product) {
        product = {
          ...product,
          ...(fields.name === undefined ? {} : { name: fields.name }),
          ...(fields.category === undefined ? {} : { category: fields.category }),
          ...(fields.sku === undefined ? {} : { sku: fields.sku }),
          ...(fields.barcode === undefined ? {} : { barcode: fields.barcode }),
          ...(fields.purchasePrice === undefined ? {} : { purchasePrice: fields.purchasePrice }),
          ...(fields.sellingPrice === undefined ? {} : { sellingPrice: fields.sellingPrice }),
          ...(fields.minimumStock === undefined ? {} : { minimumStock: fields.minimumStock }),
          ...(fields.vatRate === undefined ? {} : { vatRate: fields.vatRate }),
          ...(fields.unit === undefined ? {} : { unit: fields.unit }),
          ...(fields.manufacturer === undefined ? {} : { manufacturer: fields.manufacturer }),
        }
        products[products.findIndex((item) => item.id === product?.id)] = product
        updatedProducts += 1
      } else {
        const productId = record.sourceProductId && !usedProductIds.has(record.sourceProductId)
          ? record.sourceProductId
          : uniqueId("PROD-IMP", usedProductIds)
        usedProductIds.add(productId)
        product = {
          id: productId,
          name: fields.name ?? "",
          category: fields.category ?? "",
          sku: fields.sku ?? "",
          barcode: fields.barcode ?? "",
          manufacturer: fields.manufacturer,
          purchasePrice: fields.purchasePrice ?? record.lotPurchasePrice ?? 0,
          sellingPrice: fields.sellingPrice ?? record.lotSellingPrice ?? 0,
          minimumStock: fields.minimumStock ?? 0,
          vatRate: fields.vatRate ?? 0,
          unit: fields.unit ?? "",
        }
        products.push(product)
        createdProducts += 1
      }

      importedProducts.set(record.productKey, product)
    }

    const matchingById = record.sourceLotId
      ? lots.find(
          (lot) =>
            lot.id === record.sourceLotId &&
            lot.productId === product?.id &&
            lot.batch.trim().toLowerCase() === record.batch.trim().toLowerCase() &&
            lot.expiry.trim().toLowerCase() === record.expiry.trim().toLowerCase(),
        )
      : undefined

    const matchingLot = matchingById ?? (record.forceNewLot ? undefined : lots.find(
      (lot) =>
        lot.productId === product?.id &&
        lot.batch.trim().toLowerCase() === record.batch.trim().toLowerCase() &&
        lot.expiry.trim().toLowerCase() === record.expiry.trim().toLowerCase() &&
        ((record.lotPurchasePrice ?? record.product.purchasePrice) === undefined ||
          lot.purchasePrice === (record.lotPurchasePrice ?? record.product.purchasePrice)),
    ))

    if (matchingLot) {
      matchingLot.quantity = mode === "replace" || record.sourceLotId
        ? record.quantity
        : matchingLot.quantity + record.quantity
      if (record.lotPurchasePrice !== undefined) {
        matchingLot.purchasePrice = record.lotPurchasePrice
      } else if (record.product.purchasePrice !== undefined && !matchingById) {
        matchingLot.purchasePrice = record.product.purchasePrice
      }
      if (record.lotSellingPrice !== undefined) matchingLot.sellingPrice = record.lotSellingPrice
      if (record.lotTotalPurchaseValue !== undefined) matchingLot.totalPurchaseValue = record.lotTotalPurchaseValue
      if (record.lotTotalSellingValue !== undefined) matchingLot.totalSellingValue = record.lotTotalSellingValue
      updatedLots += 1
    } else if (record.quantity > 0 || record.batch || record.expiry || record.sourceLotId || record.forceNewLot) {
      const lotId = record.sourceLotId && !usedLotIds.has(record.sourceLotId)
        ? record.sourceLotId
        : uniqueId("LOT-IMP", usedLotIds)
      usedLotIds.add(lotId)
      lots.push({
        id: lotId,
        productId: product.id,
        batch: record.batch,
        expiry: record.expiry,
        quantity: record.quantity,
        purchasePrice: record.lotPurchasePrice ?? record.product.purchasePrice ?? product.purchasePrice,
        ...(record.lotSellingPrice === undefined ? {} : { sellingPrice: record.lotSellingPrice }),
        ...(record.lotTotalPurchaseValue === undefined ? {} : { totalPurchaseValue: record.lotTotalPurchaseValue }),
        ...(record.lotTotalSellingValue === undefined ? {} : { totalSellingValue: record.lotTotalSellingValue }),
      })
      createdLots += 1
    }
    totalImportedQuantity += record.quantity
  }

  return {
    products,
    inventoryLots: lots,
    createdProducts,
    updatedProducts,
    createdLots,
    updatedLots,
    totalImportedQuantity,
  }
}

export function buildInventoryExportRows(products: Product[], lots: InventoryLot[]) {
  const rows: (string | number)[][] = [INVENTORY_EXPORT_HEADERS]

  for (const product of products) {
    const productLots = lots.filter((lot) => lot.productId === product.id)
    const rowsForProduct = productLots.length > 0 ? productLots : [null]

    for (const lot of rowsForProduct) {
      rows.push([
        product.id,
        lot?.id ?? "",
        product.name,
        product.barcode,
        product.sku,
        product.category,
        product.manufacturer ?? "",
        product.unit,
        product.purchasePrice,
        product.sellingPrice,
        product.minimumStock,
        product.vatRate,
        lot?.batch ?? "",
        lot?.expiry ?? "",
        lot?.quantity ?? 0,
        lot?.purchasePrice ?? product.purchasePrice,
        lot?.sellingPrice ?? product.sellingPrice,
        lot?.totalPurchaseValue ?? "",
        lot?.totalSellingValue ?? "",
      ])
    }
  }

  return rows
}

export function inventoryRowsToCsv(rows: (string | number)[][]) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "")
          return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
        })
        .join(","),
    )
    .join("\r\n")
}
