import { describe, expect, it } from "vitest"
import { mergeLotReceiptCost } from "./inventoryCosting"

describe("weighted-average batch receipt costing", () => {
  it("blends incoming receipt cost with the remaining value of the existing batch", () => {
    const result = mergeLotReceiptCost(5, 10, 2, 14)
    expect(result.quantity).toBe(7)
    expect(result.totalValue).toBe(78)
    expect(result.unitCost).toBeCloseTo(78 / 7, 12)
  })

  it("uses the incoming cost when the existing batch has zero quantity", () => {
    expect(mergeLotReceiptCost(0, 10, 3, 12)).toEqual({
      quantity: 3,
      totalValue: 36,
      unitCost: 12,
    })
  })

  it("supports zero-cost stock without producing invalid values", () => {
    expect(mergeLotReceiptCost(2, 0, 2, 8)).toEqual({
      quantity: 4,
      totalValue: 16,
      unitCost: 4,
    })
  })

  it("rejects invalid quantities and costs", () => {
    expect(() => mergeLotReceiptCost(-1, 10, 1, 10)).toThrow(/valid non-negative/)
    expect(() => mergeLotReceiptCost(1, 10, 0, 10)).toThrow(/valid non-negative/)
    expect(() => mergeLotReceiptCost(1, -1, 1, 10)).toThrow(/valid non-negative/)
  })
})
