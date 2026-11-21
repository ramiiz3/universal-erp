import { describe, expect, it } from "vitest"
import { toStockMovementDelta, validateStockWriteOff } from "./stockAdjustment"

describe("stock damage and loss adjustments", () => {
  it("preserves positive generic stock adjustments", () => {
    expect(toStockMovementDelta(8, "ADJUSTMENT")).toBe(8)
  })

  it("preserves negative generic stock adjustments", () => {
    expect(toStockMovementDelta(-3, "ADJUSTMENT")).toBe(-3)
  })

  it("converts a positive damage quantity into a stock deduction", () => {
    expect(toStockMovementDelta(4, "DAMAGE")).toBe(-4)
  })

  it("converts a positive loss quantity into a stock deduction", () => {
    expect(toStockMovementDelta(2, "LOSS")).toBe(-2)
  })

  it("rejects zero and fractional quantities", () => {
    expect(() => toStockMovementDelta(0, "DAMAGE")).toThrow(/whole number/)
    expect(() => toStockMovementDelta(1.5, "LOSS")).toThrow(/whole number/)
  })

  it("rejects negative write-off input", () => {
    expect(() => toStockMovementDelta(-2, "DAMAGE")).toThrow(/positive quantity/)
  })

  it("requires an existing batch for write-offs", () => {
    expect(() => validateStockWriteOff("LOSS", -1, null, "Missing stock")).toThrow(/existing batch/)
  })

  it("requires a reason for write-offs", () => {
    expect(() => validateStockWriteOff("DAMAGE", -1, "LOT-1", "   ")).toThrow(/reason/)
  })

  it("requires write-offs to be negative movements", () => {
    expect(() => validateStockWriteOff("DAMAGE", 1, "LOT-1", "Broken")).toThrow(/reduce stock/)
  })

  it("does not impose write-off rules on generic adjustments", () => {
    expect(() => validateStockWriteOff("ADJUSTMENT", 2, null, "")).not.toThrow()
  })
})
