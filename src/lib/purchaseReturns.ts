export type PurchaseReturnAllocation = {
  lotId: string
  batch: string
  expiry: string
  quantity: number
  unitCost: number
}

export type PurchaseReturnItem = {
  id: string
  purchaseItemId: string
  productId: string
  productName: string
  quantity: number
  purchaseUnit: string
  baseQuantity: number
  baseUnit: string
  unitPurchasePrice: number
  baseUnitPurchasePrice: number
  creditAmount: number
  allocations: PurchaseReturnAllocation[]
}

export type PurchaseReturn = {
  id: string
  returnNumber: string
  purchaseId: string
  purchaseNumber: string
  supplierId?: string
  supplierName: string
  supplierInvoice: string
  creditNoteReference: string
  reason: string
  createdAt: string
  items: PurchaseReturnItem[]
  totalQuantity: number
  totalBaseQuantity: number
  totalCreditAmount: number
}

export type CreatePurchaseReturnInput = {
  purchaseId: string
  creditNoteReference?: string
  reason: string
  items: { purchaseItemId: string; quantity: number }[]
}

export type PurchaseReturnPurchaseSource = {
  id: string
  purchaseNumber: string
  supplierId?: string
  supplierName: string
  supplierInvoice: string
  status: string
  warehouseId?: string
  locationId?: string | null
  items: readonly {
    id: string
    productId: string
    name: string
    quantity: number
    purchasePrice: number
    batch: string
    expiry: string
    purchaseUnit?: string
    baseUnit?: string
    conversionFactor?: number
    baseQuantity?: number
    baseUnitPurchasePrice?: number
    lotId?: string
  }[]
}

export type PurchaseReturnLotSource = {
  id: string
  productId: string
  batch: string
  expiry: string
  quantity: number
  purchasePrice: number
  warehouseId?: string
  locationId?: string | null
}

const EPSILON = 1e-8

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function getPurchaseReturnedQuantity(
  purchaseId: string,
  purchaseItemId: string,
  existing: readonly PurchaseReturn[],
): number {
  return existing
    .filter((record) => record.purchaseId === purchaseId)
    .flatMap((record) => record.items)
    .filter((item) => item.purchaseItemId === purchaseItemId)
    .reduce((sum, item) => sum + item.quantity, 0)
}

export function getPurchaseReturnRemainingQuantity(
  purchase: PurchaseReturnPurchaseSource,
  purchaseItemId: string,
  existing: readonly PurchaseReturn[],
): number {
  const item = purchase.items.find((line) => line.id === purchaseItemId)
  if (!item) return 0
  return Math.max(0, item.quantity - getPurchaseReturnedQuantity(purchase.id, purchaseItemId, existing))
}

function nextPurchaseReturnNumber(existing: readonly PurchaseReturn[], now: Date): string {
  const prefix = `PR-${now.getFullYear()}-`
  const highest = existing.reduce((max, record) => {
    if (!record.returnNumber.startsWith(prefix)) return max
    const suffix = Number(record.returnNumber.slice(prefix.length))
    return Number.isSafeInteger(suffix) ? Math.max(max, suffix) : max
  }, 0)
  return `${prefix}${String(highest + 1).padStart(5, "0")}`
}

export function buildPurchaseReturn(
  input: CreatePurchaseReturnInput,
  purchase: PurchaseReturnPurchaseSource | undefined,
  existing: readonly PurchaseReturn[],
  lots: readonly PurchaseReturnLotSource[],
  now = new Date(),
): PurchaseReturn {
  if (!purchase) throw new Error("Original supplier purchase was not found.")
  if (purchase.status !== "Received") throw new Error("Only received purchases can be returned to a supplier.")
  const reason = String(input.reason ?? "").trim()
  if (!reason) throw new Error("A purchase return reason is required.")
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("Select at least one purchase line to return.")
  }

  const seen = new Set<string>()
  const items: PurchaseReturnItem[] = input.items.map((requested, index) => {
    if (seen.has(requested.purchaseItemId)) {
      throw new Error("A purchase line can only appear once in a return.")
    }
    seen.add(requested.purchaseItemId)

    if (!Number.isFinite(requested.quantity) || requested.quantity <= 0) {
      throw new Error("Return quantity must be greater than zero.")
    }
    const source = purchase.items.find((item) => item.id === requested.purchaseItemId)
    if (!source) throw new Error("A selected item does not belong to the original purchase.")

    const returnedBefore = getPurchaseReturnedQuantity(purchase.id, source.id, existing)
    const remaining = source.quantity - returnedBefore
    if (requested.quantity > remaining + EPSILON) {
      throw new Error(`Return quantity for ${source.name} exceeds the remaining received quantity (${Math.max(0, remaining)} ${source.purchaseUnit ?? source.baseUnit ?? "units"}).`)
    }

    const conversionFactor = source.conversionFactor ?? (
      source.quantity > 0 && source.baseQuantity !== undefined
        ? source.baseQuantity / source.quantity
        : 1
    )
    if (!Number.isFinite(conversionFactor) || conversionFactor <= 0) {
      throw new Error(`Invalid unit conversion for ${source.name} on the original purchase.`)
    }

    const baseQuantity = requested.quantity * conversionFactor
    const baseUnitPurchasePrice = source.baseUnitPurchasePrice ??
      (conversionFactor > 0 ? source.purchasePrice / conversionFactor : source.purchasePrice)
    if (!Number.isFinite(baseQuantity) || baseQuantity <= 0 ||
      !Number.isFinite(baseUnitPurchasePrice) || baseUnitPurchasePrice < 0) {
      throw new Error(`The recorded purchase cost or quantity for ${source.name} is invalid.`)
    }

    const matchingLots = lots
      .filter((lot) => {
        const exactPurchaseLot = source.lotId ? lot.id === source.lotId : true
        return exactPurchaseLot &&
          lot.productId === source.productId &&
          lot.batch.trim().toUpperCase() === source.batch.trim().toUpperCase() &&
          lot.expiry === source.expiry &&
          (!purchase.warehouseId || lot.warehouseId === purchase.warehouseId) &&
          (purchase.locationId === undefined || (lot.locationId ?? null) === (purchase.locationId ?? null))
      })
      .sort((left, right) => left.id.localeCompare(right.id))

    let remainingBase = baseQuantity
    const allocations: PurchaseReturnAllocation[] = []
    for (const lot of matchingLots) {
      if (remainingBase <= EPSILON) break
      const available = Math.max(0, lot.quantity)
      const quantity = Math.min(available, remainingBase)
      if (quantity <= EPSILON) continue
      allocations.push({
        lotId: lot.id,
        batch: lot.batch,
        expiry: lot.expiry,
        quantity,
        unitCost: lot.purchasePrice,
      })
      remainingBase -= quantity
    }

    if (remainingBase > EPSILON) {
      const available = matchingLots.reduce((sum, lot) => sum + Math.max(0, lot.quantity), 0)
      throw new Error(`Insufficient available stock from the original batch for ${source.name}. Available: ${available} ${source.baseUnit ?? "units"}; requested: ${baseQuantity}.`)
    }

    const creditAmount = roundMoney(requested.quantity * source.purchasePrice)
    return {
      id: `PRITEM-${now.getTime()}-${index}`,
      purchaseItemId: source.id,
      productId: source.productId,
      productName: source.name,
      quantity: requested.quantity,
      purchaseUnit: source.purchaseUnit ?? source.baseUnit ?? "Unit",
      baseQuantity,
      baseUnit: source.baseUnit ?? "Unit",
      unitPurchasePrice: source.purchasePrice,
      baseUnitPurchasePrice,
      creditAmount,
      allocations,
    }
  })

  return {
    id: `PURCHASE-RETURN-${now.getTime()}`,
    returnNumber: nextPurchaseReturnNumber(existing, now),
    purchaseId: purchase.id,
    purchaseNumber: purchase.purchaseNumber,
    supplierId: purchase.supplierId,
    supplierName: purchase.supplierName,
    supplierInvoice: purchase.supplierInvoice,
    creditNoteReference: (input.creditNoteReference ?? "").trim(),
    reason,
    createdAt: now.toISOString(),
    items,
    totalQuantity: roundMoney(items.reduce((sum, item) => sum + item.quantity, 0)),
    totalBaseQuantity: roundMoney(items.reduce((sum, item) => sum + item.baseQuantity, 0)),
    totalCreditAmount: roundMoney(items.reduce((sum, item) => sum + item.creditAmount, 0)),
  }
}
