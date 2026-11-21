export type StockAdjustmentType = "ADJUSTMENT" | "DAMAGE" | "LOSS"

/**
 * Generic adjustments retain signed-delta behaviour. Damage and loss are entered
 * as positive write-off quantities and converted to negative stock movements.
 */
export function toStockMovementDelta(
  quantity: number,
  movementType: StockAdjustmentType,
): number {
  if (!Number.isInteger(quantity) || quantity === 0) {
    throw new Error("Enter a non-zero whole number quantity.")
  }

  if (movementType === "ADJUSTMENT") return quantity

  if (quantity < 0) {
    throw new Error("Enter a positive quantity for damage or loss.")
  }

  return -quantity
}

/** Defense-in-depth validation for explicit stock write-offs. */
export function validateStockWriteOff(
  movementType: StockAdjustmentType,
  quantityDelta: number,
  lotId: string | null,
  reason: string,
): void {
  if (movementType === "ADJUSTMENT") return

  if (quantityDelta >= 0) {
    throw new Error("Damage and loss must reduce stock.")
  }
  if (!lotId) {
    throw new Error("Select an existing batch/lot before recording damage or loss.")
  }
  if (!reason.trim()) {
    throw new Error("Enter a reason before recording damage or loss.")
  }
}
