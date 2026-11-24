import type { InventoryLot, Product } from "../context/ERPContext"

export type LotSaleRequest = {
  product: Product
  quantity: number
  requestId?: string
  /** Base-stock quantity represented by one selected POS selling unit. */
  saleUnitConversionFactor?: number
  unitPrice?: number
  unitPriceOverride?: boolean

  warehouseId?: string
}

export type LotSaleAllocation = {
  product: Product
  requestId?: string
  quantity: number
  unitPrice: number
  lotId: string
  batch: string
  expiry: string
  supplierId?: string
  supplierName?: string
  grnNumber?: string
  purchaseDate?: string
  unitCost: number
  totalCost: number

  warehouseId?: string
  locationId?: string | null
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

function expiryEndDay(value: string): number | null {
  const trimmed = value?.trim?.() ?? ""
  if (!trimmed) return null

  const yearMonth = /^(\d{4})-(\d{2})$/.exec(trimmed)
  const monthYear = /^(\d{1,2})\/(\d{4})$/.exec(trimmed)
  if (yearMonth || monthYear) {
    const year = Number(yearMonth ? yearMonth[1] : monthYear![2])
    const month = Number(yearMonth ? yearMonth[2] : monthYear![1])
    if (year < 1 || month < 1 || month > 12) return null
    const lastDay = new Date(year, month, 0)
    return Math.floor(Date.UTC(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate()) / 86_400_000)
  }

  const exactDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (exactDate) {
    const year = Number(exactDate[1])
    const month = Number(exactDate[2])
    const day = Number(exactDate[3])
    const parsed = new Date(year, month - 1, day)
    if (
      month < 1 || month > 12 || day < 1 ||
      parsed.getFullYear() !== year ||
      parsed.getMonth() !== month - 1 ||
      parsed.getDate() !== day
    ) return null
    return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
  }

  const dayMonthYear = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed)
  if (dayMonthYear) {
    const day = Number(dayMonthYear[1])
    const month = Number(dayMonthYear[2])
    const year = Number(dayMonthYear[3])
    const parsed = new Date(year, month - 1, day)
    if (
      month < 1 || month > 12 || day < 1 ||
      parsed.getFullYear() !== year ||
      parsed.getMonth() !== month - 1 ||
      parsed.getDate() !== day
    ) return null
    return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return Math.floor(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()) / 86_400_000)
}

function isExpiredAsOf(value: string, asOfDate: Date): boolean {
  const expiryDay = expiryEndDay(value)
  if (expiryDay === null) return false
  const todayDay = Math.floor(
    Date.UTC(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate.getDate()) /
      86_400_000,
  )
  return expiryDay < todayDay
}

/** Returns true only when the lot's recorded expiry is before the sale date. */
export function isInventoryLotExpired(
  lot: Pick<InventoryLot, "expiry">,
  asOfDate: Date = new Date(),
): boolean {
  return isExpiredAsOf(lot.expiry, asOfDate)
}

/**
 * Orders lots the way a pharmacy should review them: earliest valid expiry
 * first, undated stock after dated stock, and already-expired stock last.
 */
export function sortInventoryLotsByFEFO<T extends Pick<InventoryLot, "expiry">>(
  lots: T[],
  asOfDate: Date = new Date(),
): T[] {
  return lots
    .map((lot, index) => ({ lot, index, expiry: expiryEndDay(lot.expiry), expired: isExpiredAsOf(lot.expiry, asOfDate) }))
    .sort((left, right) => {
      if (left.expired !== right.expired) return left.expired ? 1 : -1
      const leftValid = left.expiry !== null
      const rightValid = right.expiry !== null
      if (leftValid && rightValid && left.expiry !== right.expiry) return left.expiry! - right.expiry!
      if (leftValid !== rightValid) return leftValid ? -1 : 1
      return left.index - right.index
    })
    .map(({ lot }) => lot)
}

/** Positive, non-expired lots eligible for a new POS sale, in FEFO order. */
export function getSaleableInventoryLots(
  inventoryLots: InventoryLot[],
  productId: string,
  warehouseId?: string,
  asOfDate: Date = new Date(),
): InventoryLot[] {
  return sortInventoryLotsByFEFO(
    inventoryLots.filter((lot) =>
      lot.productId === productId &&
      lot.quantity > 0 &&
      (!warehouseId || lot.warehouseId === warehouseId) &&
      !isExpiredAsOf(lot.expiry, asOfDate),
    ),
    asOfDate,
  )
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
    const vatRate = line.product.vatApplicable === false ? 0 : line.product.vatRate
    return sum + discountedLine * (vatRate / 100)
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
  asOfDate: Date = new Date(),
): LotSaleAllocationResult {
  const updatedLots = inventoryLots.map((lot) => ({ ...lot }))
  const lines: LotSaleAllocation[] = []
  const unallocated: LotSaleAllocationResult["unallocated"] = []

  for (const request of requests) {
    const factor = request.saleUnitConversionFactor ?? 1
    if (!Number.isFinite(factor) || factor <= 0) {
      unallocated.push({
        productId: request.product.id,
        productName: request.product.name,
        quantity: request.quantity,
      })
      continue
    }

    const requestedPackageCount = Math.round(request.quantity / factor)
    const representedQuantity = requestedPackageCount * factor
    if (
      requestedPackageCount <= 0 ||
      Math.abs(representedQuantity - request.quantity) > 1e-7
    ) {
      unallocated.push({
        productId: request.product.id,
        productName: request.product.name,
        quantity: request.quantity,
      })
      continue
    }

    let remainingPackages = requestedPackageCount
    const lots = getSaleableInventoryLots(
      updatedLots,
      request.product.id,
      request.warehouseId,
      asOfDate,
    )

    for (const lot of lots) {
      if (remainingPackages <= 0) break

      // Never split a sealed selling unit across supplier batches. A strip,
      // box or sachet must be fulfilled entirely from one lot.
      const packagesInLot = Math.floor((lot.quantity + 1e-9) / factor)
      const packagesToAllocate = Math.min(remainingPackages, packagesInLot)
      if (packagesToAllocate <= 0) continue

      const quantity = Math.min(lot.quantity, packagesToAllocate * factor)
      lot.quantity = Math.max(0, lot.quantity - quantity)
      remainingPackages -= packagesToAllocate

      const unitCost = lot.purchasePrice
      lines.push({
        product: request.product,
        requestId: request.requestId,
        quantity,
        unitPrice: request.unitPriceOverride
          ? request.unitPrice ?? lot.sellingPrice ?? request.product.sellingPrice
          : lot.sellingPrice ?? request.unitPrice ?? request.product.sellingPrice,
        lotId: lot.id,
        warehouseId: lot.warehouseId,
        locationId: lot.locationId ?? null,
        batch: lot.batch,
        expiry: lot.expiry,
        supplierId: lot.supplierId,
        supplierName: lot.supplierName,
        grnNumber: lot.grnNumber,
        purchaseDate: lot.purchaseDate,
        unitCost,
        totalCost: quantity * unitCost,
      })
    }

    if (remainingPackages > 0) {
      unallocated.push({
        productId: request.product.id,
        productName: request.product.name,
        quantity: remainingPackages * factor,
      })
    }
  }

  return { updatedLots, lines, unallocated }
}
