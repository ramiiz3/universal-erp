import type { CloudInventoryLot, CloudProduct } from "./CloudInventoryContext"

export type SaleCartItem = {
  productId: string
  quantity: number
}

export type PurchaseCartItem = {
  productId: string
  quantity: number
  unitCost: number
  discountAmount: number
}

export type PurchaseReceiveItem = {
  purchaseLineId: string
  outstandingQuantity: number
  quantity: number
  unitCost: number | null
  sellingPrice: number | null
  batch: string
  expiry: string
}

export type PaymentInput = {
  method: "cash" | "card" | "bank_transfer" | "other"
  amount: number
  reference: string
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function positiveQuantity(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be greater than zero.`)
  }
  return value
}

export function buildSaleLines(items: SaleCartItem[]) {
  if (!items.length) throw new Error("Add at least one product to the sale.")
  const seen = new Set<string>()
  return items.map(({ productId, quantity }) => {
    if (!productId || seen.has(productId)) {
      throw new Error("Each product must appear only once in the sale.")
    }
    seen.add(productId)
    return {
      product_id: productId,
      quantity: positiveQuantity(quantity, "Sale quantity"),
    }
  })
}

export function buildSalePayments(
  method: PaymentInput["method"],
  amount: number,
  reference: string,
  total: number,
) {
  if (!Number.isFinite(amount) || amount < 0 || amount > total) {
    throw new Error("Payment must be zero or a valid amount not exceeding the total.")
  }
  if (amount === 0) return []
  return [{
    method,
    amount: roundMoney(amount),
    reference: reference.trim(),
  }]
}

export function buildPurchaseLines(items: PurchaseCartItem[]) {
  if (!items.length) throw new Error("Add at least one product to the purchase.")
  const seen = new Set<string>()
  return items.map(({ productId, quantity, unitCost, discountAmount }) => {
    if (!productId || seen.has(productId)) {
      throw new Error("Each product must appear only once in the purchase.")
    }
    seen.add(productId)
    const qty = positiveQuantity(quantity, "Purchase quantity")
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      throw new Error("Unit cost must be zero or greater.")
    }
    const discount = roundMoney(discountAmount)
    if (!Number.isFinite(discountAmount) || discount < 0 || discount > roundMoney(qty * unitCost)) {
      throw new Error("Line discount must be valid and cannot exceed its gross amount.")
    }
    return {
      product_id: productId,
      quantity: qty,
      unit_cost: unitCost,
      discount_amount: discount,
    }
  })
}

export function buildPurchaseReceiptLines(items: PurchaseReceiveItem[]) {
  if (items.some((item) => !Number.isFinite(item.quantity) || item.quantity < 0)) {
    throw new Error("Received quantity must be zero or greater.")
  }
  const received = items.filter((item) => item.quantity > 0)
  if (!received.length) throw new Error("Enter a quantity to receive for at least one line.")
  return received.map((item) => {
    const quantity = positiveQuantity(item.quantity, "Received quantity")
    if (quantity > item.outstandingQuantity) {
      throw new Error("Received quantity cannot exceed the purchase line balance.")
    }
    if (item.unitCost !== null && (!Number.isFinite(item.unitCost) || item.unitCost < 0)) {
      throw new Error("Unit cost must be zero or greater.")
    }
    if (item.sellingPrice !== null && (!Number.isFinite(item.sellingPrice) || item.sellingPrice < 0)) {
      throw new Error("Lot selling price must be zero or greater.")
    }
    if (item.expiry && Number.isNaN(Date.parse(`${item.expiry}T00:00:00`))) {
      throw new Error("Enter a valid expiry date.")
    }
    return {
      purchase_line_id: item.purchaseLineId,
      quantity,
      unit_cost: item.unitCost,
      selling_price: item.sellingPrice,
      batch: item.batch.trim(),
      expiry: item.expiry || null,
    }
  })
}

export type FefoEstimate = {
  subtotal: number
  vat: number
  total: number
  shortProducts: string[]
}

export function estimateFefoSale(
  products: CloudProduct[],
  lots: CloudInventoryLot[],
  items: SaleCartItem[],
  warehouseId: string,
  companyTaxRate: number,
  discountAmount = 0,
  today = new Date().toISOString().slice(0, 10),
): FefoEstimate {
  let subtotal = 0
  let vat = 0
  const shortProducts: string[] = []
  const allocations: Array<{ gross: number; vatRate: number }> = []
  for (const item of items) {
    const product = products.find((candidate) => candidate.id === item.productId && candidate.is_active)
    if (!product || !Number.isFinite(item.quantity) || item.quantity <= 0) continue
    let remaining = item.quantity
    const eligible = lots
      .filter((lot) => lot.product_id === product.id
        && lot.warehouse_id === warehouseId
        && Number(lot.quantity) > 0
        && (!lot.expiry || lot.expiry >= today))
      .sort((a, b) => {
        if (a.expiry === null && b.expiry !== null) return 1
        if (a.expiry !== null && b.expiry === null) return -1
        return (a.expiry ?? "").localeCompare(b.expiry ?? "")
          || a.created_at.localeCompare(b.created_at)
          || a.id.localeCompare(b.id)
      })
    for (const lot of eligible) {
      if (remaining <= 0) break
      const quantity = Math.min(remaining, Number(lot.quantity))
      const unitPrice = lot.selling_price ?? product.selling_price
      const lineGross = roundMoney(quantity * unitPrice)
      subtotal += lineGross
      const rate = product.vat_rate > 0 ? product.vat_rate : companyTaxRate
      allocations.push({ gross: lineGross, vatRate: rate })
      remaining -= quantity
    }
    if (remaining > 0) shortProducts.push(product.name)
  }
  subtotal = roundMoney(subtotal)
  const discount = Number.isFinite(discountAmount)
    ? Math.max(0, Math.min(roundMoney(discountAmount), subtotal))
    : 0
  let discountUsed = 0
  allocations.forEach((allocation, index) => {
    const remainingDiscount = Math.max(0, roundMoney(discount - discountUsed))
    const proportionalShare = subtotal === 0
      ? 0
      : roundMoney(discount * allocation.gross / subtotal)
    const discountShare = index === allocations.length - 1
      ? remainingDiscount
      : Math.min(remainingDiscount, Math.max(0, proportionalShare))
    discountUsed += discountShare
    vat += roundMoney((allocation.gross - discountShare) * allocation.vatRate / 100)
  })
  vat = roundMoney(vat)
  return { subtotal, vat, total: roundMoney(subtotal - discount + vat), shortProducts }
}
