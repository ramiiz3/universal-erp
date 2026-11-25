export type LoyaltyProgramRules = {
  enabled: boolean
  pointsPerCurrencyUnit: number
  currencyPerPoint: number
}

export type LoyaltyRedemptionResult = {
  pointsRedeemed: number
  discountAmount: number
}

export function validateLoyaltyRedemption(input: {
  rules: LoyaltyProgramRules
  requestedPoints: number
  availablePoints: number
  isRegisteredCustomer: boolean
  isSettledSale: boolean
}): LoyaltyRedemptionResult {
  const { rules } = input
  const requested = Number(input.requestedPoints)
  const balance = Number(input.availablePoints)

  if (!Number.isFinite(requested) || !Number.isInteger(requested) || requested < 0) {
    throw new Error("Loyalty points to redeem must be a whole number greater than or equal to zero.")
  }
  if (requested === 0) return { pointsRedeemed: 0, discountAmount: 0 }
  if (!rules.enabled) throw new Error("The loyalty programme is not enabled in Settings.")
  if (!input.isRegisteredCustomer) throw new Error("Select a registered customer to redeem loyalty points.")
  if (!input.isSettledSale) throw new Error("Loyalty points can only be redeemed on a settled sale.")
  if (!Number.isFinite(balance) || requested > balance) throw new Error("The customer does not have enough loyalty points.")
  if (!Number.isFinite(rules.currencyPerPoint) || rules.currencyPerPoint <= 0) {
    throw new Error("Set a positive currency value per loyalty point in Settings before redeeming points.")
  }

  return {
    pointsRedeemed: requested,
    discountAmount: Number((requested * rules.currencyPerPoint).toFixed(2)),
  }
}

export function calculateLoyaltyPointsEarned(input: {
  rules: LoyaltyProgramRules
  isSettledSale: boolean
  isRegisteredCustomer: boolean
  subtotal: number
  totalDiscount: number
}): number {
  const { rules } = input
  if (!rules.enabled || !input.isSettledSale || !input.isRegisteredCustomer) return 0
  const rate = Number(rules.pointsPerCurrencyUnit)
  if (!Number.isFinite(rate) || rate <= 0) return 0
  const eligibleSpend = Math.max(0, Number(input.subtotal) - Number(input.totalDiscount))
  return Math.max(0, Math.floor(eligibleSpend * rate + 1e-9))
}

export function updateLoyaltyPointBalance(
  currentBalance: number,
  pointsRedeemed: number,
  pointsEarned: number,
): number {
  const balance = Math.max(0, Math.floor(Number(currentBalance) || 0))
  const redeemed = Math.max(0, Math.floor(Number(pointsRedeemed) || 0))
  const earned = Math.max(0, Math.floor(Number(pointsEarned) || 0))
  if (redeemed > balance) throw new Error("The customer does not have enough loyalty points.")
  return balance - redeemed + earned
}
