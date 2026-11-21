import type { InventoryLot, Product, StorageLocation, Warehouse } from "../context/ERPContext"

export type ValuationProduct = Pick<Product, "id" | "name" | "sku" | "category" | "unit">
export type ValuationLot = Pick<InventoryLot, "id" | "productId" | "batch" | "expiry" | "quantity" | "purchasePrice" | "warehouseId" | "locationId">
export type ValuationWarehouse = Pick<Warehouse, "id" | "name">
export type ValuationLocation = Pick<StorageLocation, "id" | "name" | "code">

export type InventoryValuationRow = {
  lotId: string
  productId: string
  productName: string
  sku: string
  category: string
  batch: string
  expiry: string
  quantity: number
  unit: string
  unitCost: number
  value: number
  warehouseId: string
  warehouseName: string
  locationId: string
  locationName: string
}

export type InventoryValuationSummary = {
  id: string
  name: string
  secondary: string
  quantity: number
  batchCount: number
  value: number
}

export type InventoryValuation = {
  rows: InventoryValuationRow[]
  byProduct: InventoryValuationSummary[]
  byWarehouse: InventoryValuationSummary[]
  totalQuantity: number
  totalValue: number
  positiveBatchCount: number
  stockedProductCount: number
  stockedWarehouseCount: number
}

export function calculateInventoryValuation(
  products: readonly ValuationProduct[],
  lots: readonly ValuationLot[],
  warehouses: readonly ValuationWarehouse[],
  locations: readonly ValuationLocation[],
  warehouseFilter?: string,
): InventoryValuation {
  const productById = new Map(products.map((item) => [item.id, item]))
  const warehouseById = new Map(warehouses.map((item) => [item.id, item]))
  const locationById = new Map(locations.map((item) => [item.id, item]))

  const rows: InventoryValuationRow[] = lots
    .filter((lot) => !warehouseFilter || (lot.warehouseId ?? "") === warehouseFilter)
    .map((lot) => {
      const product = productById.get(lot.productId)
      const warehouse = warehouseById.get(lot.warehouseId ?? "")
      const location = locationById.get(lot.locationId ?? "")
      const quantity = Number.isFinite(lot.quantity) ? lot.quantity : 0
      const unitCost = Number.isFinite(lot.purchasePrice) ? lot.purchasePrice : 0

      return {
        lotId: lot.id,
        productId: lot.productId,
        productName: product?.name ?? "Unknown product",
        sku: product?.sku ?? "",
        category: product?.category ?? "",
        batch: lot.batch || "—",
        expiry: lot.expiry || "",
        quantity,
        unit: product?.unit ?? "Unit",
        unitCost,
        value: quantity * unitCost,
        warehouseId: lot.warehouseId ?? "",
        warehouseName: warehouse?.name ?? (lot.warehouseId ? "Unknown warehouse" : "Unassigned warehouse"),
        locationId: lot.locationId ?? "",
        locationName: location ? `${location.code} — ${location.name}` : (lot.locationId ? "Unknown location" : "Unassigned"),
      }
    })
    .sort((a, b) =>
      a.productName.localeCompare(b.productName) ||
      a.batch.localeCompare(b.batch) ||
      a.warehouseName.localeCompare(b.warehouseName),
    )

  const productSummaries = new Map<string, InventoryValuationSummary>()
  for (const product of products) {
    productSummaries.set(product.id, {
      id: product.id,
      name: product.name,
      secondary: `${product.sku || "No SKU"} · ${product.category || "Uncategorised"}`,
      quantity: 0,
      batchCount: 0,
      value: 0,
    })
  }

  const warehouseSummaries = new Map<string, InventoryValuationSummary>()
  for (const warehouse of warehouses) {
    if (!warehouseFilter || warehouse.id === warehouseFilter) {
      warehouseSummaries.set(warehouse.id, {
        id: warehouse.id,
        name: warehouse.name,
        secondary: "Warehouse",
        quantity: 0,
        batchCount: 0,
        value: 0,
      })
    }
  }

  for (const row of rows) {
    const productSummary = productSummaries.get(row.productId) ?? {
      id: row.productId,
      name: row.productName,
      secondary: `${row.sku || "No SKU"} · ${row.category || "Uncategorised"}`,
      quantity: 0,
      batchCount: 0,
      value: 0,
    }
    productSummary.quantity += row.quantity
    productSummary.value += row.value
    if (row.quantity > 0) productSummary.batchCount += 1
    productSummaries.set(row.productId, productSummary)

    const warehouseSummary = warehouseSummaries.get(row.warehouseId) ?? {
      id: row.warehouseId,
      name: row.warehouseName,
      secondary: "Warehouse",
      quantity: 0,
      batchCount: 0,
      value: 0,
    }
    warehouseSummary.quantity += row.quantity
    warehouseSummary.value += row.value
    if (row.quantity > 0) warehouseSummary.batchCount += 1
    warehouseSummaries.set(row.warehouseId, warehouseSummary)
  }

  const byProduct = [...productSummaries.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
  const byWarehouse = [...warehouseSummaries.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0)
  const totalValue = rows.reduce((sum, row) => sum + row.value, 0)

  return {
    rows,
    byProduct,
    byWarehouse,
    totalQuantity,
    totalValue,
    positiveBatchCount: rows.filter((row) => row.quantity > 0).length,
    stockedProductCount: byProduct.filter((item) => item.quantity > 0).length,
    stockedWarehouseCount: byWarehouse.filter((item) => item.quantity > 0).length,
  }
}

function csvCell(value: string | number): string {
  const text = String(value ?? "")
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function buildInventoryValuationCsv(rows: readonly InventoryValuationRow[]): string {
  const header = [
    "Product", "SKU", "Category", "Batch", "Expiry", "Warehouse", "Location",
    "Quantity", "Unit", "Unit Cost", "Stock Value",
  ]
  const data = rows.map((row) => [
    row.productName, row.sku, row.category, row.batch, row.expiry,
    row.warehouseName, row.locationName, row.quantity, row.unit,
    row.unitCost.toFixed(2), row.value.toFixed(2),
  ])
  return "\uFEFF" + [header, ...data].map((line) => line.map(csvCell).join(",")).join("\r\n")
}
