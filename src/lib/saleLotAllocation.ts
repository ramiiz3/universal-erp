import type { InventoryLot, Product } from "../context/ERPContext"

export type LotSaleRequest = {
  product: Product
  quantity: number
  unitPrice?: number
}

export type LotSaleAllocation = {
  product: Product
  quantity: number
  unitPrice: number
  lotId: string
  batch: string
  expiry: string
  unitCost: number
  totalCost: number
}

export type LotSaleAllocationResult = {
  updatedLots: InventoryLot[]
  lines: LotSaleAllocation[]
  unallocated: {
    productId: string
    productName: string
    quantity: number
  }[]
}

export function calculateLotSaleTotals(
  lines: Pick<LotSaleAllocation, "quantity" | "unitPrice" | "product">[],
  discount = 0,
) {
  const subtotal = lines.reduce(
    (sum, line) => sum + line.quantity * line.unitPrice,
    0,
  )
  const appliedDiscount = Math.min(Math.max(discount, 0), subtotal)
  const discountRatio = subtotal > 0 ? appliedDiscount / subtotal : 0
  const vat = lines.reduce((sum, line) => {
    const lineTotal = line.quantity * line.unitPrice
    const discountedLine = lineTotal * (1 - discountRatio)
    return sum + discountedLine * (line.product.vatRate / 100)
  }, 0)

  return {
    subtotal,
    discount: appliedDiscount,
    vat,
    total: subtotal - appliedDiscount + vat,
  }
}

export function allocateSaleLots(
  requests: LotSaleRequest[],
  inventoryLots: InventoryLot[],
): LotSaleAllocationResult {
  const updatedLots = inventoryLots.map((lot) => ({ ...lot }))
  const lines: LotSaleAllocation[] = []
  const unallocated: LotSaleAllocationResult["unallocated"] = []

  for (const request of requests) {
    let remaining = request.quantity
    const lots = updatedLots
      .map((lot, index) => ({ lot, index }))
      .filter(({ lot }) => lot.productId === request.product.id && lot.quantity > 0)
      .sort((left, right) => {
        const leftExpiry = Date.parse(left.lot.expiry)
        const rightExpiry = Date.parse(right.lot.expiry)
        const leftValid = Number.isFinite(leftExpiry)
        const rightValid = Number.isFinite(rightExpiry)
        if (leftValid && rightValid && leftExpiry !== rightExpiry) return leftExpiry - rightExpiry
        if (leftValid !== rightValid) return leftValid ? -1 : 1
        return left.index - right.index
      })

    for (const { lot } of lots) {
      if (remaining <= 0) break

      const quantity = Math.min(remaining, lot.quantity)
      lot.quantity -= quantity
      remaining -= quantity

      const unitCost = lot.purchasePrice
      lines.push({
        product: request.product,
        quantity,
        unitPrice: lot.sellingPrice ?? request.unitPrice ?? request.product.sellingPrice,
        lotId: lot.id,
        batch: lot.batch,
        expiry: lot.expiry,
        unitCost,
        totalCost: quantity * unitCost,
      })
    }

    if (remaining > 0) {
      unallocated.push({
        productId: request.product.id,
        productName: request.product.name,
        quantity: remaining,
      })
    }
  }

  return { updatedLots, lines, unallocated }
}
