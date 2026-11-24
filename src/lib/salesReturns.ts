export type SalesRefundMethod = "Cash" | "Card" | "Bank Transfer"

export type SalesReturnAllocation = {
  lotId: string
  batch: string
  expiry: string
  quantity: number
}

export type SalesReturnItem = {
  id: string
  saleItemId: string
  productId: string
  productName: string
  quantity: number
  sellingUnit: string
  baseQuantity: number
  subtotalAmount: number
  discountAmount: number
  vatAmount: number
  refundAmount: number
  allocations: SalesReturnAllocation[]
}

export type SalesReturn = {
  id: string
  returnNumber: string
  saleId: string
  invoiceNumber: string
  customerName: string
  createdAt: string
  refundMethod: SalesRefundMethod
  reason: string
  items: SalesReturnItem[]
  subtotalAmount: number
  discountAmount: number
  vatAmount: number
  refundTotal: number
}

export type CreateSalesReturnInput = {
  saleId: string
  refundMethod: SalesRefundMethod
  reason: string
  items: { saleItemId: string; quantity: number }[]
}

type ReturnProduct = {
  id: string
  name?: string
  productType?: "GOODS" | "SERVICE"
  returnEligible?: boolean
}

type ReturnSaleItem = {
  id: string
  productId: string
  name: string
  quantity: number
  unitPrice: number
  vatRate: number
  total: number
  returnEligible?: boolean
  sellingUnit?: string
  conversionFactor?: number
  baseQuantity?: number
  batchAllocations: { lotId: string; batch: string; expiry: string; quantity: number }[]
}

type ReturnSale = {
  id: string
  invoiceNumber: string
  createdAt: string
  customerName: string
  paymentMethod: string
  status: string
  subtotal: number
  discount: number
  items: ReturnSaleItem[]
}

const METHODS: SalesRefundMethod[] = ["Cash", "Card", "Bank Transfer"]
const EPSILON = 1e-8

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function allocationKey(item: { lotId: string; batch: string; expiry: string }): string {
  return `${item.lotId}|${item.batch}|${item.expiry}`
}

export function getReturnedQuantity(
  saleId: string,
  saleItemId: string,
  existing: readonly SalesReturn[],
): number {
  return existing
    .filter((record) => record.saleId === saleId)
    .flatMap((record) => record.items)
    .filter((item) => item.saleItemId === saleItemId)
    .reduce((sum, item) => sum + item.quantity, 0)
}

export function isSaleFullyReturned(
  sale: { id: string; items: readonly { id: string; quantity: number }[] },
  existing: readonly SalesReturn[],
): boolean {
  if (!sale.items.length) return false
  return sale.items.every((item) =>
    getReturnedQuantity(sale.id, item.id, existing) >= item.quantity - EPSILON,
  )
}

export function isSaleItemReturnEligible(
  saleItem: { returnEligible?: boolean },
  product: ReturnProduct | undefined,
): boolean {
  if (saleItem.returnEligible !== undefined) return saleItem.returnEligible === true
  // Older invoices predate line-level snapshots; retain their previous Product Master based behavior.
  return product?.productType !== "SERVICE" && product?.returnEligible === true
}

export function buildSalesReturn(
  input: CreateSalesReturnInput,
  sale: ReturnSale | undefined,
  products: readonly ReturnProduct[],
  existing: readonly SalesReturn[],
  now = new Date(),
): SalesReturn {
  if (!sale) throw new Error("Original sale was not found.")
  if (sale.paymentMethod === "Credit" || sale.status === "Pending") {
    throw new Error("Credit sales must be settled or adjusted through customer receivables before a return can be processed.")
  }
  if (sale.status !== "Paid") throw new Error("Only paid sales can be returned through this workflow.")
  if (!METHODS.includes(input.refundMethod)) throw new Error("Select a valid refund method.")
  const reason = String(input.reason ?? "").trim()
  if (!reason) throw new Error("A return reason is required.")
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error("Select at least one sale item to return.")

  const seen = new Set<string>()
  const returnAllocationsAlreadyMade = new Map<string, number>()
  for (const record of existing) {
    if (record.saleId !== sale.id) continue
    for (const item of record.items) {
      for (const allocation of item.allocations) {
        const key = `${item.saleItemId}|${allocationKey(allocation)}`
        returnAllocationsAlreadyMade.set(key, (returnAllocationsAlreadyMade.get(key) ?? 0) + allocation.quantity)
      }
    }
  }

  const returnItems: SalesReturnItem[] = input.items.map((requested, index) => {
    if (seen.has(requested.saleItemId)) throw new Error("A sale item can only appear once in a return request.")
    seen.add(requested.saleItemId)
    if (!Number.isInteger(requested.quantity) || requested.quantity <= 0) {
      throw new Error("Return quantity must be a whole number greater than zero.")
    }
    const saleItem = sale.items.find((item) => item.id === requested.saleItemId)
    if (!saleItem) throw new Error("The selected item does not belong to the original invoice.")
    const product = products.find((item) => item.id === saleItem.productId)
    if (!product) throw new Error(`Product ${saleItem.name} was not found in the product master.`)
    if (!isSaleItemReturnEligible(saleItem, product)) {
      throw new Error(`${saleItem.name} is not marked as eligible for returns. Medicines and other restricted products must remain non-returnable.`)
    }

    const previouslyReturned = getReturnedQuantity(sale.id, saleItem.id, existing)
    const remaining = saleItem.quantity - previouslyReturned
    if (requested.quantity > remaining + EPSILON) {
      throw new Error(`Return quantity for ${saleItem.name} exceeds the remaining returnable quantity (${Math.max(0, remaining)}).`)
    }

    const factor = saleItem.conversionFactor ?? (saleItem.quantity > 0 && saleItem.baseQuantity !== undefined
      ? saleItem.baseQuantity / saleItem.quantity
      : 1)
    if (!Number.isFinite(factor) || factor <= 0) throw new Error(`Invalid base-unit conversion for ${saleItem.name}.`)
    const baseQuantity = requested.quantity * factor
    if (!saleItem.batchAllocations?.length) {
      throw new Error(`Original batch allocation is unavailable for ${saleItem.name}; stock cannot be safely restored.`)
    }

    let remainingBase = baseQuantity
    const allocations: SalesReturnAllocation[] = []
    for (const original of saleItem.batchAllocations) {
      const key = `${saleItem.id}|${allocationKey(original)}`
      const alreadyReturned = returnAllocationsAlreadyMade.get(key) ?? 0
      const available = Math.max(0, original.quantity - alreadyReturned)
      const take = Math.min(available, remainingBase)
      if (take > EPSILON) {
        allocations.push({ lotId: original.lotId, batch: original.batch, expiry: original.expiry, quantity: take })
        remainingBase -= take
      }
      if (remainingBase <= EPSILON) break
    }
    if (remainingBase > EPSILON) {
      throw new Error(`Original batch quantities are insufficient to allocate the requested return for ${saleItem.name}.`)
    }

    const fraction = requested.quantity / saleItem.quantity
    const subtotalAmount = roundMoney(saleItem.total * fraction)
    const discountShare = sale.subtotal > 0 ? sale.discount * (saleItem.total / sale.subtotal) : 0
    const discountAmount = roundMoney(discountShare * fraction)
    const taxableAmount = Math.max(0, saleItem.total - discountShare)
    const vatAmount = roundMoney(taxableAmount * (saleItem.vatRate / 100) * fraction)
    const refundAmount = roundMoney(Math.max(0, subtotalAmount - discountAmount + vatAmount))

    return {
      id: `SRITEM-${now.getTime()}-${index}`,
      saleItemId: saleItem.id,
      productId: saleItem.productId,
      productName: saleItem.name,
      quantity: requested.quantity,
      sellingUnit: saleItem.sellingUnit ?? "Unit",
      baseQuantity,
      subtotalAmount,
      discountAmount,
      vatAmount,
      refundAmount,
      allocations,
    }
  })

  const subtotalAmount = roundMoney(returnItems.reduce((sum, item) => sum + item.subtotalAmount, 0))
  const discountAmount = roundMoney(returnItems.reduce((sum, item) => sum + item.discountAmount, 0))
  const vatAmount = roundMoney(returnItems.reduce((sum, item) => sum + item.vatAmount, 0))
  const refundTotal = roundMoney(returnItems.reduce((sum, item) => sum + item.refundAmount, 0))
  const year = now.getFullYear()
  const prefix = `SR-${year}-`
  const highest = existing.reduce((max, item) => {
    if (!item.returnNumber.startsWith(prefix)) return max
    const suffix = Number(item.returnNumber.slice(prefix.length))
    return Number.isFinite(suffix) ? Math.max(max, suffix) : max
  }, 0)
  const returnNumber = `${prefix}${String(highest + 1).padStart(5, "0")}`

  return {
    id: `SALES-RETURN-${now.getTime()}`,
    returnNumber,
    saleId: sale.id,
    invoiceNumber: sale.invoiceNumber,
    customerName: sale.customerName,
    createdAt: now.toISOString(),
    refundMethod: input.refundMethod,
    reason,
    items: returnItems,
    subtotalAmount,
    discountAmount,
    vatAmount,
    refundTotal,
  }
}
