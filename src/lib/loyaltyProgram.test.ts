import { describe, expect, it } from "vitest"
import {
  calculateLoyaltyPointsEarned,
  calculateLoyaltyReturnAdjustment,
  updateLoyaltyPointBalance,
  validateLoyaltyRedemption,
} from "./loyaltyProgram"

const enabledRules = {
  enabled: true,
  pointsPerCurrencyUnit: 0.1,
  currencyPerPoint: 0.1,
}

describe("pharmacy customer loyalty", () => {
  it("earns whole points on settled registered-customer spend after discounts", () => {
    expect(calculateLoyaltyPointsEarned({
      rules: enabledRules,
      isSettledSale: true,
      isRegisteredCustomer: true,
      subtotal: 250,
      totalDiscount: 10,
    })).toBe(24)
  })

  it("does not award points on a credit sale or a walk-in sale", () => {
    expect(calculateLoyaltyPointsEarned({
      rules: enabledRules,
      isSettledSale: false,
      isRegisteredCustomer: true,
      subtotal: 250,
      totalDiscount: 0,
    })).toBe(0)
    expect(calculateLoyaltyPointsEarned({
      rules: enabledRules,
      isSettledSale: true,
      isRegisteredCustomer: false,
      subtotal: 250,
      totalDiscount: 0,
    })).toBe(0)
  })

  it("converts redeemed points into a rounded currency discount", () => {
    expect(validateLoyaltyRedemption({
      rules: enabledRules,
      requestedPoints: 125,
      availablePoints: 200,
      isRegisteredCustomer: true,
      isSettledSale: true,
    })).toEqual({ pointsRedeemed: 125, discountAmount: 12.5 })
  })

  it("rejects redemption for disabled, walk-in, credit and insufficient-balance cases", () => {
    const base = {
      requestedPoints: 10,
      availablePoints: 50,
      isRegisteredCustomer: true,
      isSettledSale: true,
    }
    expect(() => validateLoyaltyRedemption({
      ...base,
      rules: { ...enabledRules, enabled: false },
    })).toThrow(/not enabled/)
    expect(() => validateLoyaltyRedemption({
      ...base,
      rules: enabledRules,
      isRegisteredCustomer: false,
    })).toThrow(/registered customer/)
    expect(() => validateLoyaltyRedemption({
      ...base,
      rules: enabledRules,
      isSettledSale: false,
    })).toThrow(/settled sale/)
    expect(() => validateLoyaltyRedemption({
      ...base,
      rules: enabledRules,
      availablePoints: 5,
    })).toThrow(/enough loyalty points/)
  })

  it("requires whole non-negative points and a positive redemption value", () => {
    expect(() => validateLoyaltyRedemption({
      rules: enabledRules,
      requestedPoints: 1.5,
      availablePoints: 10,
      isRegisteredCustomer: true,
      isSettledSale: true,
    })).toThrow(/whole number/)
    expect(() => validateLoyaltyRedemption({
      rules: { ...enabledRules, currencyPerPoint: 0 },
      requestedPoints: 1,
      availablePoints: 10,
      isRegisteredCustomer: true,
      isSettledSale: true,
    })).toThrow(/positive currency value/)
  })


  it("reverses and restores loyalty points cumulatively across partial returns", () => {
    const first = calculateLoyaltyReturnAdjustment({
      saleSubtotal: 100,
      cumulativeReturnedSubtotal: 40,
      pointsEarnedOnSale: 10,
      pointsRedeemedOnSale: 20,
      pointsEarnedAlreadyReversed: 0,
      pointsRedeemedAlreadyRestored: 0,
    })
    expect(first).toEqual({ pointsEarnedReversed: 4, pointsRedeemedRestored: 8 })

    const second = calculateLoyaltyReturnAdjustment({
      saleSubtotal: 100,
      cumulativeReturnedSubtotal: 100,
      pointsEarnedOnSale: 10,
      pointsRedeemedOnSale: 20,
      pointsEarnedAlreadyReversed: first.pointsEarnedReversed,
      pointsRedeemedAlreadyRestored: first.pointsRedeemedRestored,
    })
    expect(second).toEqual({ pointsEarnedReversed: 6, pointsRedeemedRestored: 12 })
  })

  it("does not restore or reverse points beyond the original sale balance", () => {
    expect(calculateLoyaltyReturnAdjustment({
      saleSubtotal: 100,
      cumulativeReturnedSubtotal: 200,
      pointsEarnedOnSale: 10,
      pointsRedeemedOnSale: 20,
      pointsEarnedAlreadyReversed: 10,
      pointsRedeemedAlreadyRestored: 20,
    })).toEqual({ pointsEarnedReversed: 0, pointsRedeemedRestored: 0 })
  })

  it("updates the customer balance by subtracting redeemed and adding earned points", () => {
    expect(updateLoyaltyPointBalance(100, 30, 12)).toBe(82)
    expect(() => updateLoyaltyPointBalance(5, 6, 2)).toThrow(/enough loyalty points/)
  })
})
