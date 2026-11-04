export type ProductInput = {
  name: string
  sku: string
  barcode: string
  description: string
  category: string
  manufacturer: string
  unit: string
  purchasePrice: string
  sellingPrice: string
  minimumStock: string
  vatRate: string
}

export type ProductWrite = {
  name: string
  sku: string
  barcode: string
  description: string
  category: string
  manufacturer: string | null
  unit: string
  purchase_price: number
  selling_price: number
  minimum_stock: number
  vat_rate: number
}

export type ReceiptInput = {
  productId: string
  warehouseId: string
  batch: string
  expiry: string
  quantity: string
  purchasePrice: string
  sellingPrice: string
  reason: string
}

export type AdjustmentInput = {
  lotId: string
  quantityDelta: string
  reason: string
}

function numberValue(value: string, label: string, minimum: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < minimum) {
    throw new Error(`${label} must be ${minimum === 0 ? "zero or greater" : `greater than ${minimum}`}.`)
  }
  return parsed
}

export function buildProductWrite(input: ProductInput): ProductWrite {
  const name = input.name.trim()
  if (!name) throw new Error("Product name is required.")
  if (!input.unit.trim()) throw new Error("Unit of measurement is required.")
  const vatRate = numberValue(input.vatRate, "VAT rate", 0)
  if (vatRate > 100) throw new Error("VAT rate cannot exceed 100%.")
  return {
    name,
    sku: input.sku.trim(),
    barcode: input.barcode.trim(),
    description: input.description.trim(),
    category: input.category.trim(),
    manufacturer: input.manufacturer.trim() || null,
    unit: input.unit.trim(),
    purchase_price: numberValue(input.purchasePrice, "Purchase cost", 0),
    selling_price: numberValue(input.sellingPrice, "Selling price", 0),
    minimum_stock: numberValue(input.minimumStock, "Minimum stock", 0),
    vat_rate: vatRate,
  }
}

export function buildReceiptWrite(input: ReceiptInput) {
  if (!input.productId) throw new Error("Select a product.")
  if (!input.warehouseId) throw new Error("Select a warehouse.")
  if (input.expiry && Number.isNaN(Date.parse(`${input.expiry}T00:00:00`))) {
    throw new Error("Enter a valid expiry date.")
  }
  const quantity = numberValue(input.quantity, "Received quantity", 0)
  if (quantity <= 0) throw new Error("Received quantity must be greater than zero.")
  const sellingPrice = input.sellingPrice.trim()
  return {
    productId: input.productId,
    warehouseId: input.warehouseId,
    batch: input.batch.trim(),
    expiry: input.expiry || null,
    quantity,
    purchasePrice: numberValue(input.purchasePrice, "Unit purchase cost", 0),
    sellingPrice: sellingPrice ? numberValue(sellingPrice, "Lot selling price", 0) : null,
    reason: input.reason.trim() || "Stock received",
  }
}

export function buildAdjustmentWrite(input: AdjustmentInput) {
  if (!input.lotId) throw new Error("Select an inventory lot.")
  const quantityDelta = Number(input.quantityDelta)
  if (!Number.isFinite(quantityDelta) || quantityDelta === 0) {
    throw new Error("Adjustment quantity must be a non-zero number.")
  }
  const reason = input.reason.trim()
  if (!reason) throw new Error("An adjustment reason is required.")
  return { lotId: input.lotId, quantityDelta, reason }
}

export function createSubmissionLock() {
  let pending = false
  return async function run<T>(operation: () => Promise<T>): Promise<T | undefined> {
    if (pending) return undefined
    pending = true
    try {
      return await operation()
    } finally {
      pending = false
    }
  }
}
