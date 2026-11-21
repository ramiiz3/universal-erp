export type WeightedAverageLotCost = {
  quantity: number
  totalValue: number
  unitCost: number
}

/**
 * Blends a new receipt into the remaining quantity of the same batch/location.
 * This prevents a later receipt at a different price from repricing all
 * previously-held units at the incoming unit cost.
 */
export function mergeLotReceiptCost(
  existingQuantity: number,
  existingUnitCost: number,
  incomingQuantity: number,
  incomingUnitCost: number,
): WeightedAverageLotCost {
  if (
    !Number.isFinite(existingQuantity) ||
    existingQuantity < 0 ||
    !Number.isFinite(incomingQuantity) ||
    incomingQuantity <= 0 ||
    !Number.isFinite(existingUnitCost) ||
    existingUnitCost < 0 ||
    !Number.isFinite(incomingUnitCost) ||
    incomingUnitCost < 0
  ) {
    throw new Error("Lot quantities and purchase costs must be valid non-negative numbers, with a positive receipt quantity.")
  }

  const quantity = existingQuantity + incomingQuantity
  const totalValue =
    existingQuantity * existingUnitCost +
    incomingQuantity * incomingUnitCost

  return {
    quantity,
    totalValue,
    unitCost: quantity > 0 ? totalValue / quantity : 0,
  }
}
