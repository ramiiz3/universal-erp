export type StockCountStatus = "DRAFT" | "REVIEW" | "POSTED" | "CANCELLED"

export type StockCountLine = {
  id: string
  lotId: string
  productId: string
  productName: string
  sku: string
  unit: string
  batch: string
  expiry: string
  locationId: string | null
  locationName: string
  systemQuantity: number
  countedQuantity: number | null
}

export type StockCount = {
  id: string
  reference: string
  warehouseId: string
  warehouseName: string
  locationId: string | null
  locationName: string
  notes: string
  status: StockCountStatus
  lines: StockCountLine[]
  createdAt: string
  submittedAt?: string
  postedAt?: string
  cancelledAt?: string
}

export function calculateStockCountVariance(line: StockCountLine): number | null {
  if (line.countedQuantity === null) return null
  return line.countedQuantity - line.systemQuantity
}

export function validateStockCountLines(lines: StockCountLine[]): string[] {
  const errors: string[] = []
  if (!lines.length) errors.push("This stock count has no inventory lines.")
  const seenLots = new Set<string>()
  let hasMissingCount = false
  let hasInvalidQuantity = false
  let hasInvalidBookQuantity = false

  for (const line of lines) {
    if (seenLots.has(line.lotId)) errors.push(`Inventory lot ${line.lotId} appears more than once.`)
    seenLots.add(line.lotId)
    if (!Number.isInteger(line.systemQuantity) || line.systemQuantity < 0) {
      hasInvalidBookQuantity = true
    }
    if (line.countedQuantity === null) {
      hasMissingCount = true
    } else if (!Number.isInteger(line.countedQuantity) || line.countedQuantity < 0) {
      hasInvalidQuantity = true
    }
  }

  if (hasMissingCount) errors.push("Enter a counted quantity for every inventory line before submitting.")
  if (hasInvalidQuantity) errors.push("Counted quantities must be whole numbers greater than or equal to zero.")
  if (hasInvalidBookQuantity) errors.push("One or more book quantities are invalid. Resolve the inventory data before posting.")
  return errors
}

export function createStockCountReference(
  counts: Pick<StockCount, "reference">[],
  now: Date = new Date(),
): string {
  const year = now.getFullYear()
  const prefix = `SC-${year}-`
  const highest = counts.reduce((max, count) => {
    if (!count.reference.startsWith(prefix)) return max
    const sequence = Number(count.reference.slice(prefix.length))
    return Number.isInteger(sequence) ? Math.max(max, sequence) : max
  }, 0)
  return `${prefix}${String(highest + 1).padStart(5, "0")}`
}
