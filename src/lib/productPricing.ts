export function calculateGrossMarginPercentage(
  purchasePrice: number,
  sellingPrice: number,
): number | null {
  if (
    !Number.isFinite(purchasePrice) ||
    !Number.isFinite(sellingPrice) ||
    purchasePrice < 0 ||
    sellingPrice <= 0
  ) return null

  return Math.round(((sellingPrice - purchasePrice) / sellingPrice) * 10_000) / 100
}

export function calculateSellingPriceFromGrossMargin(
  purchasePrice: number,
  marginPercentage: number,
): number {
  if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
    throw new Error("Purchase price must be zero or greater.")
  }
  if (!Number.isFinite(marginPercentage) || marginPercentage >= 100) {
    throw new Error("Gross margin must be less than 100%.")
  }

  const sellingPrice = purchasePrice / (1 - marginPercentage / 100)
  if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
    throw new Error("The margin produces an invalid selling price.")
  }
  return Math.round((sellingPrice + Number.EPSILON) * 100) / 100
}
