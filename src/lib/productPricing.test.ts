import { describe, expect, it } from "vitest"
import {
  calculateGrossMarginPercentage,
  calculateSellingPriceFromGrossMargin,
} from "./productPricing"

describe("product gross margin pricing", () => {
  it("calculates gross margin from purchase and selling price", () => {
    expect(calculateGrossMarginPercentage(4, 8)).toBe(50)
    expect(calculateGrossMarginPercentage(8, 8)).toBe(0)
    expect(calculateGrossMarginPercentage(6, 5)).toBe(-20)
  })

  it("returns null where a gross margin cannot be calculated", () => {
    expect(calculateGrossMarginPercentage(4, 0)).toBeNull()
    expect(calculateGrossMarginPercentage(-1, 5)).toBeNull()
  })

  it("calculates selling price from a target gross margin", () => {
    expect(calculateSellingPriceFromGrossMargin(4, 50)).toBe(8)
    expect(calculateSellingPriceFromGrossMargin(4, 20)).toBe(5)
    expect(calculateSellingPriceFromGrossMargin(4, 0)).toBe(4)
  })

  it("supports a selling price below purchase cost", () => {
    expect(calculateSellingPriceFromGrossMargin(4, -25)).toBe(3.2)
  })

  it("rejects invalid purchase price and 100 percent margin", () => {
    expect(() => calculateSellingPriceFromGrossMargin(-1, 20)).toThrow(/Purchase price/)
    expect(() => calculateSellingPriceFromGrossMargin(4, 100)).toThrow(/less than 100/)
  })
})
